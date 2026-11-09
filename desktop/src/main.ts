// Clipshots desktop: opens the live web app in its own window and runs the
// catcher natively. The web app talks to us only through the small preload API.

import { app, BrowserWindow, ipcMain, dialog, shell, protocol, net, session as eSession, type WebContents } from "electron";
import path from "node:path";
import { promises as fs, existsSync, readFileSync, watch, statSync, type FSWatcher } from "node:fs";
import { pathToFileURL } from "node:url";
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { Catcher, type CaughtMoment, type SourceKind } from "../engine/catcher";
import type { ScanCandidate } from "../../src/lib/detect/scanner";
import type { ReviewFrame } from "../../src/lib/detect/review";

// ---------- config ----------
const DEFAULT_URL = "https://clipshots.lovable.app";
const APP_URL = process.env.CLIPSHOTS_URL || readConfig().appUrl || DEFAULT_URL;
const ALLOWED = new Set<string>([new URL(APP_URL).origin, ...(readConfig().allowedOrigins ?? []), ...(process.env.CLIPSHOTS_EXTRA_ORIGINS?.split(",").filter(Boolean) ?? [])]);
const SIGN_IN_HOSTS = [/(^|\.)accounts\.google\.com$/, /(^|\.)supabase\.co$/, /(^|\.)lovable\.app$/, /(^|\.)lovable\.dev$/];

function readConfig(): { appUrl?: string; allowedOrigins?: string[] } {
  try {
    return JSON.parse(readFileSync(path.join(__dirname, "..", "config.json"), "utf8"));
  } catch {
    return {};
  }
}

function binPath(name: string): string {
  const exe = process.platform === "win32" ? `${name}.exe` : name;
  const packed = path.join(process.resourcesPath ?? "", "bin", exe);
  if (existsSync(packed)) return packed;
  if (name === "ffmpeg") {
    if (process.env.FFMPEG_PATH) return process.env.FFMPEG_PATH;
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const p: string = require("ffmpeg-static");
      if (p && existsSync(p.replace("app.asar", "app.asar.unpacked"))) return p.replace("app.asar", "app.asar.unpacked");
    } catch {}
    return "ffmpeg";
  }
  const dev = path.join(__dirname, "..", "resources", "bin", exe);
  return existsSync(dev) ? dev : name;
}

function libraryRoot() {
  if (process.env.CLIPSHOTS_LIBRARY) return process.env.CLIPSHOTS_LIBRARY;
  const base = process.platform === "darwin" ? app.getPath("home") + "/Movies" : app.getPath("videos");
  return path.join(base, "Clipshots");
}

// ---------- single instance, UA, privileged media scheme ----------
if (!app.requestSingleInstanceLock()) app.quit();
app.on("second-instance", () => {
  if (win) {
    if (win.isMinimized()) win.restore();
    win.focus();
  }
});
// Google refuses sign-in from embedded browsers that say "Electron".
app.userAgentFallback = app.userAgentFallback.replace(/\s*Electron\/\S+/i, "").replace(/\s*clipshots(-desktop)?\/\S+/i, "");
protocol.registerSchemesAsPrivileged([{ scheme: "clipshots-media", privileges: { secure: true, standard: true, stream: true, supportFetchAPI: true, corsEnabled: true } }]);

let win: BrowserWindow | null = null;
// For tests: lets a harness open an extra window with the same preload.
(globalThis as any).__clipshotsPreload = path.join(__dirname, "preload.js");

// ---------- sessions (stored as JSON next to the clips) ----------
interface LocalMoment extends CaughtMoment {
  trimStart?: number | null;
  trimEnd?: number | null;
  cloudId?: string | null;
}
interface LocalSession {
  id: string;
  eventName: string;
  matchName: string;
  game: string;
  context?: string;
  sourceKind: SourceKind;
  sourceLabel: string;
  status: "live" | "ended" | "failed";
  startedAt: string;
  endedAt: string | null;
  folder: string;
  moments: LocalMoment[];
  cloud?: { eventId: string; matchId: string } | null;
  error?: string | null;
  /** Seconds of footage watched. */
  durationSec?: number;
}
const live = new Map<string, { s: LocalSession; c: Catcher }>();

async function saveSession(s: LocalSession) {
  await fs.mkdir(s.folder, { recursive: true });
  const tmp = path.join(s.folder, "session.json.tmp");
  await fs.writeFile(tmp, JSON.stringify(s, null, 2));
  await fs.rename(tmp, path.join(s.folder, "session.json"));
}
async function loadSessions(): Promise<LocalSession[]> {
  const root = libraryRoot();
  if (!existsSync(root)) return [];
  const out: LocalSession[] = [];
  for (const d of await fs.readdir(root)) {
    const f = path.join(root, d, "session.json");
    if (!existsSync(f)) continue;
    try {
      const s: LocalSession = JSON.parse(await fs.readFile(f, "utf8"));
      // A session marked live but not running was interrupted (crash, power cut).
      if (s.status === "live" && !live.has(s.id)) s.status = "failed";
      out.push(live.get(s.id)?.s ?? s);
    } catch {}
  }
  return out.sort((a, b) => b.startedAt.localeCompare(a.startedAt));
}
async function getSession(id: string) {
  return live.get(id)?.s ?? (await loadSessions()).find((s) => s.id === id) ?? null;
}

function send(e: unknown) {
  if (win && !win.isDestroyed()) win.webContents.send("clipshots:event", e);
}

// AI review goes through the signed-in web page (it holds the session; we never hold keys).
const pendingReviews = new Map<string, (v: unknown) => void>();
function reviewViaPage(sessionId: string, game: string, context: string | undefined, candidate: ScanCandidate, frames: ReviewFrame[]) {
  return new Promise<any>((resolve) => {
    if (!win || !isTrusted(win.webContents)) return resolve(null);
    const requestId = randomUUID();
    const t = setTimeout(() => {
      pendingReviews.delete(requestId);
      resolve(null);
    }, 45_000);
    pendingReviews.set(requestId, (v) => {
      clearTimeout(t);
      resolve(v ?? null);
    });
    send({ type: "review", requestId, sessionId, candidate, frames, game, context });
  });
}

function slug(s: string) {
  return s.replace(/[<>:"/\\|?*\x00-\x1f]+/g, "").trim().slice(0, 50) || "Match";
}

async function startSession(o: { eventName: string; matchName: string; game: string; context?: string; source: { kind: SourceKind; value: string }; cloud?: LocalSession["cloud"] }) {
  const id = randomUUID();
  const stamp = new Date().toISOString().slice(0, 16).replace("T", " ").replace(":", ".");
  const folder = path.join(libraryRoot(), `${stamp} ${slug(o.eventName)} - ${slug(o.matchName)}`);
  const s: LocalSession = {
    id,
    eventName: o.eventName,
    matchName: o.matchName,
    game: o.game,
    context: o.context,
    sourceKind: o.source.kind,
    sourceLabel: o.source.kind === "file" || o.source.kind === "recording" ? path.basename(o.source.value) : o.source.value,
    status: "live",
    startedAt: new Date().toISOString(),
    endedAt: null,
    folder,
    moments: [],
    cloud: o.cloud ?? null,
  };
  const c = new Catcher({
    source: o.source,
    workDir: folder,
    ffmpegPath: binPath("ffmpeg"),
    ytDlpPath: binPath("yt-dlp"),
    game: o.game,
    context: o.context,
    review: (cand, frames) => reviewViaPage(id, o.game, o.context, cand, frames),
  });
  live.set(id, { s, c });
  await saveSession(s);
  c.on("status", (text) => send({ type: "status", sessionId: id, text }));
  c.on("level", (l) => send({ type: "level", sessionId: id, ...l }));
  c.on("moment", async (m: CaughtMoment) => {
    s.moments.push(m);
    await saveSession(s);
    send({ type: "moment", sessionId: id, moment: m });
  });
  c.on("error", (err: Error) => {
    s.error = err.message;
    send({ type: "error", sessionId: id, message: err.message });
  });
  c.start()
    .catch((err) => {
      s.error = err?.message ?? "Catching stopped unexpectedly.";
      s.status = "failed";
      send({ type: "error", sessionId: id, message: s.error });
    })
    .finally(async () => {
      if (s.status === "live") s.status = s.error && !s.moments.length ? "failed" : "ended";
      s.endedAt = new Date().toISOString();
      s.durationSec = Math.round(c.feedTime);
      await stitchRecording(c, s).catch(() => null);
      await saveSession(s);
      live.delete(id);
      send({ type: "ended", sessionId: id });
    });
  return { sessionId: id };
}

/** Join the 2 s pieces into one full recording for editors, then tidy up. */
async function stitchRecording(c: Catcher, s: LocalSession) {
  const csv = path.join(c.segDir, "pieces.csv");
  if (!existsSync(csv)) return;
  const pieces = (await fs.readFile(csv, "utf8")).split("\n").filter(Boolean).map((l) => l.split(",")[0]);
  if (!pieces.length) return;
  const list = path.join(c.segDir, "pieces.txt");
  await fs.writeFile(list, pieces.map((p) => `file '${path.join(c.segDir, p).replace(/'/g, "'\\''")}'`).join("\n"));
  const out = path.join(c.segDir, "full.mp4");
  const ok = await new Promise<boolean>((resolve) => {
    const p = spawn(binPath("ffmpeg"), ["-hide_banner", "-loglevel", "error", "-nostdin", "-y", "-f", "concat", "-safe", "0", "-i", list, "-c", "copy", "-movflags", "+faststart", out]);
    p.on("close", (code) => resolve(code === 0));
    p.on("error", () => resolve(false));
  });
  if (ok) {
    for (const p of pieces) await fs.rm(path.join(c.segDir, p), { force: true });
    await fs.rm(list, { force: true });
    await fs.rm(csv, { force: true });
  }
  void s;
}

// ---------- security ----------
function isTrusted(wc: WebContents) {
  try {
    return ALLOWED.has(new URL(wc.getURL()).origin);
  } catch {
    return false;
  }
}
function insideLibrary(p: string) {
  const root = path.resolve(libraryRoot()) + path.sep;
  return path.resolve(p).startsWith(root);
}
function handle(channel: string, fn: (...args: any[]) => any) {
  ipcMain.handle(channel, (e, ...args) => {
    if (!e.senderFrame || !ALLOWED.has(new URL(e.senderFrame.url).origin)) throw new Error("Not allowed");
    return fn(...args);
  });
}

// ---------- recordings-folder watching (auto-catch new OBS recordings) ----------
const prefsFile = () => path.join(app.getPath("userData"), "prefs.json");
let prefs: { watchFolder?: string | null; watchGame?: string } = {};
let watcher: FSWatcher | null = null;
const seen = new Set<string>();
async function loadPrefs() {
  try {
    prefs = JSON.parse(await fs.readFile(prefsFile(), "utf8"));
  } catch {
    prefs = {};
  }
}
async function savePrefs() {
  await fs.writeFile(prefsFile(), JSON.stringify(prefs));
}
function startWatching() {
  watcher?.close();
  watcher = null;
  const dir = prefs.watchFolder;
  if (!dir || !existsSync(dir)) return;
  for (const f of require("node:fs").readdirSync(dir)) seen.add(path.join(dir, f));
  watcher = watch(dir, (_evt, name) => {
    if (!name) return;
    const f = path.join(dir, name.toString());
    if (seen.has(f) || !/\.(mkv|ts|flv|mp4|mov)$/i.test(f)) return;
    seen.add(f);
    // A recording that keeps growing is being written: catch it live.
    let last = -1;
    let growing = 0;
    const iv = setInterval(() => {
      if (!existsSync(f)) return clearInterval(iv);
      const size = statSync(f).size;
      if (size > last && last >= 0) growing++;
      last = size;
      if (growing >= 2) {
        clearInterval(iv);
        const kind: SourceKind = /\.mp4$|\.mov$/i.test(f) ? "recording" : "file";
        startSession({ eventName: "Auto-caught recordings", matchName: path.basename(f).replace(/\.\w+$/, ""), game: prefs.watchGame ?? "generic", source: { kind, value: f } }).then(({ sessionId }) => send({ type: "status", sessionId, text: "Started from your recordings folder" }));
      }
    }, 2000);
    setTimeout(() => clearInterval(iv), 60_000);
  });
}

// ---------- window ----------
function createWindow() {
  win = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 380,
    backgroundColor: "#09090f",
    title: "Clipshots",
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      additionalArguments: [`--clipshots-allowed=${[...ALLOWED].join(",")}`, `--clipshots-version=${app.getVersion()}`],
    },
  });
  win.webContents.setWindowOpenHandler(({ url }) => {
    const u = safeUrl(url);
    if (u && (ALLOWED.has(u.origin) || SIGN_IN_HOSTS.some((r) => r.test(u.hostname)))) return { action: "allow" };
    if (u && /^https?:$/.test(u.protocol)) shell.openExternal(url);
    return { action: "deny" };
  });
  win.webContents.on("will-navigate", (e, url) => {
    const u = safeUrl(url);
    if (u && (ALLOWED.has(u.origin) || SIGN_IN_HOSTS.some((r) => r.test(u.hostname)))) return;
    e.preventDefault();
    if (u && /^https?:$/.test(u.protocol)) shell.openExternal(url);
  });
  win.on("close", (e) => {
    if (live.size && !quitting) {
      const r = dialog.showMessageBoxSync(win!, {
        type: "warning",
        buttons: ["Keep catching", "Stop and quit"],
        defaultId: 0,
        cancelId: 0,
        message: "Clipshots is still catching a match.",
        detail: "Quitting now stops it. Clips caught so far are kept.",
      });
      if (r === 0) return e.preventDefault();
      quitting = true;
      for (const { c } of live.values()) c.stop();
    }
  });
  win.loadURL(APP_URL);
}
let quitting = false;
function safeUrl(u: string) {
  try {
    return new URL(u);
  } catch {
    return null;
  }
}

app.whenReady().then(async () => {
  await loadPrefs();
  protocol.handle("clipshots-media", (req) => {
    const p = decodeURIComponent(new URL(req.url).pathname.replace(/^\//, ""));
    const abs = process.platform === "win32" ? p : "/" + p.replace(/^\/+/, "");
    if (!insideLibrary(abs)) return new Response("Not allowed", { status: 403 });
    return net.fetch(pathToFileURL(abs).toString(), { headers: req.headers, method: req.method });
  });
  // Deny camera/mic/etc. by default.
  eSession.defaultSession.setPermissionRequestHandler((_wc, perm, cb) => cb(perm === "clipboard-sanitized-write" || perm === "notifications"));

  handle("cs:start", (o) => startSession(o));
  handle("cs:stop", async (id: string) => live.get(id)?.c.stop());
  handle("cs:sessions", () => loadSessions());
  handle("cs:session", (id: string) => getSession(id));
  handle("cs:updateMoment", async (sid: string, mid: string, patch: Partial<LocalMoment>) => {
    const s = await getSession(sid);
    const m = s?.moments.find((x) => x.id === mid);
    if (!s || !m) return;
    for (const k of ["kept", "trimStart", "trimEnd", "cloudId"] as const) if (k in patch) (m as any)[k] = (patch as any)[k];
    await saveSession(s);
  });
  handle("cs:setCloud", async (sid: string, cloud: LocalSession["cloud"]) => {
    const s = await getSession(sid);
    if (s) {
      s.cloud = cloud;
      await saveSession(s);
    }
  });
  ipcMain.on("cs:answerReview", (e, requestId: string, verdict: unknown) => {
    if (!e.senderFrame || !ALLOWED.has(new URL(e.senderFrame.url).origin)) return;
    pendingReviews.get(requestId)?.(verdict);
    pendingReviews.delete(requestId);
  });
  handle("cs:pickFile", async () => {
    const r = await dialog.showOpenDialog(win!, { properties: ["openFile"], filters: [{ name: "Video", extensions: ["mkv", "mp4", "mov", "ts", "flv", "webm", "m4v"] }] });
    return r.canceled ? null : r.filePaths[0];
  });
  handle("cs:showInFolder", (p: string) => (insideLibrary(p) ? shell.showItemInFolder(p) : undefined));
  handle("cs:readFile", async (p: string) => {
    if (!insideLibrary(p)) throw new Error("Not allowed");
    const b = await fs.readFile(p);
    return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
  });
  handle("cs:saveText", async (name: string, text: string) => {
    const r = await dialog.showSaveDialog(win!, { defaultPath: path.join(libraryRoot(), path.basename(name)) });
    if (r.canceled || !r.filePath) return null;
    await fs.writeFile(r.filePath, text);
    return r.filePath;
  });
  handle("cs:exportTrim", async (sid: string, mid: string) => {
    const s = await getSession(sid);
    const m = s?.moments.find((x) => x.id === mid);
    if (!s || !m) throw new Error("Not found");
    const a = (m.trimStart ?? m.start) - m.start;
    const len = (m.trimEnd ?? m.end) - (m.trimStart ?? m.start);
    const out = m.clipPath.replace(/\.mp4$/, `-trim-${a.toFixed(1)}-${len.toFixed(1)}.mp4`);
    await new Promise<void>((resolve, reject) => {
      const p = spawn(binPath("ffmpeg"), ["-hide_banner", "-loglevel", "error", "-nostdin", "-y", "-ss", String(a), "-i", m.clipPath, "-t", String(len), "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-c:a", "aac", "-movflags", "+faststart", out]);
      p.on("close", (code) => (code === 0 ? resolve() : reject(new Error("Trim failed"))));
    });
    return out;
  });
  handle("cs:getWatch", () => ({ folder: prefs.watchFolder ?? null, game: prefs.watchGame ?? "generic" }));
  handle("cs:setWatch", async (folder: string | null | "pick", game?: string) => {
    if (folder === "pick") {
      const r = await dialog.showOpenDialog(win!, { properties: ["openDirectory"] });
      if (r.canceled) return { folder: prefs.watchFolder ?? null, game: prefs.watchGame ?? "generic" };
      folder = r.filePaths[0];
    }
    prefs.watchFolder = folder;
    if (game) prefs.watchGame = game;
    await savePrefs();
    startWatching();
    return { folder: prefs.watchFolder ?? null, game: prefs.watchGame ?? "generic" };
  });
  handle("cs:isRendering", () => live.size > 0);

  startWatching();
  createWindow();
});

app.on("before-quit", () => {
  quitting = true;
});
app.on("window-all-closed", () => {
  for (const { c } of live.values()) c.stop();
  app.quit();
});
