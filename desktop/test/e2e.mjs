// Desktop end-to-end test. Launches the real Electron app (its bundled window,
// no website involved), then checks, for real:
//   - the app makes no network requests of its own
//   - the desktop API is present on the Clipshots origin and absent elsewhere
//   - the user agent has no "Electron"
//   - catching a finished recording through the UI produces real MP4 clips on disk
//   - clips play back through the media protocol in the live board
//   - a growing recording dropped into the watched folder is caught automatically
// Run under Xvfb on Linux CI.
import { _electron as electron } from "playwright-core";
import { createServer } from "node:http";
import { spawn, spawnSync } from "node:child_process";
import { mkdtempSync, existsSync, readdirSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
const electronPath = createRequire(import.meta.url)("electron");

const FIX = path.resolve(process.env.FIXTURES || "../test/fixtures");
const OUT = path.resolve(process.env.E2E_OUT || "test-results");
const FFMPEG = process.env.FFMPEG_PATH || path.resolve("node_modules/ffmpeg-static/ffmpeg");
mkdirSync(OUT, { recursive: true });
const lib = mkdtempSync(path.join(tmpdir(), "clipshots-lib-"));
const results = [];
const check = (name, ok, detail = "") => {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
};

// A stand-in for Google's Gemini endpoint: records what it was sent and
// answers like Gemini does (a tool call with a verdict).
const geminiCalls = [];
const gemini = createServer((q, r) => {
  let body = "";
  q.on("data", (d) => (body += d));
  q.on("end", () => {
    let req = {};
    try { req = JSON.parse(body); } catch {}
    geminiCalls.push({ auth: q.headers.authorization, images: (req.messages?.[1]?.content ?? []).filter((c) => c.type === "image_url").length, size: body.length });
    const userText = req.messages?.[1]?.content?.[0]?.text ?? "";
    const m = /Window ([\d.]+)s to ([\d.]+)s/.exec(userText);
    const verdict = { keep: true, score: 91, category: "Clutch", label: "1vX clutch", reason: "Last player alive wins the round", start: m ? Number(m[1]) + 1 : 0, end: m ? Number(m[2]) - 1 : 5 };
    r.writeHead(200, { "content-type": "application/json" });
    r.end(JSON.stringify({ choices: [{ message: { tool_calls: [{ function: { name: "verdict", arguments: JSON.stringify(verdict) } }] } }] }));
  });
}).listen(3998, "127.0.0.1");

// An untrusted page on another origin.
const evil = createServer((_q, r) => r.end("<html><body>other site</body></html>")).listen(3999, "127.0.0.1");

const app = await electron.launch({
  // E2E_EXECUTABLE runs a packaged build (its bundled ffmpeg) instead of the dev app.
  executablePath: process.env.E2E_EXECUTABLE || electronPath,
  args: [...(process.env.E2E_EXECUTABLE ? [] : ["."]), "--no-proxy-server", ...(process.getuid?.() === 0 || process.env.CI ? ["--no-sandbox"] : [])],
  env: { ...process.env, CLIPSHOTS_LIBRARY: lib, CLIPSHOTS_GEMINI_KEY: "", CLIPSHOTS_GEMINI_URL: "http://127.0.0.1:3998/v1beta/openai/chat/completions", NO_PROXY: "127.0.0.1,localhost", no_proxy: "127.0.0.1,localhost", ...(process.env.E2E_EXECUTABLE ? {} : { FFMPEG_PATH: FFMPEG }) },
});
try {
  const page = await app.firstWindow();
  await page.waitForLoadState("domcontentloaded");
  // Everything the window loads must come from the app itself.
  const outside = [];
  page.on("request", (r) => {
    if (!/^(app:|clipshots-media:|data:|blob:)/.test(r.url())) outside.push(r.url());
  });
  await page.reload();
  await page.waitForFunction(() => !!window.clipshotsDesktop && document.body.innerText.includes("Catch a match"), null, { timeout: 30000 }).catch(() => null);

  check("Desktop API present in the Clipshots window", await page.evaluate(() => typeof window.clipshotsDesktop?.start === "function"));
  const ua = await page.evaluate(() => navigator.userAgent);
  check("User agent has no 'Electron'", !/electron/i.test(ua), ua);

  // Untrusted origin: same preload, different site.
  const absent = await app.evaluate(async ({ BrowserWindow }, url) => {
        const w = new BrowserWindow({ show: false, webPreferences: { preload: globalThis.__clipshotsPreload, sandbox: true, contextIsolation: true, additionalArguments: ["--clipshots-allowed=app://clipshots"] } });
    await w.loadURL(url);
    const v = await w.webContents.executeJavaScript("typeof window.clipshotsDesktop");
    w.destroy();
    return v;
  }, "http://127.0.0.1:3999/");
  check("Desktop API absent on any other page", absent === "undefined", `typeof = ${absent}`);

  // Catch a finished recording through the real UI. The native file picker is
  // answered with the real path (the same thing a person picking it would give).
  const file = path.join(FIX, "test120.mp4");
  await app.evaluate(({ dialog }, f) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [f] });
  }, file);
  // AI key: saved, reported, removed (no real key in CI, so moments below are scan-only).
  const ai1 = await page.evaluate(() => window.clipshotsDesktop.setAiKey("test-key-not-real"));
  const ai2 = await page.evaluate(() => window.clipshotsDesktop.setAiKey(null));
  check("AI key can be saved and removed", ai1.hasKey === true && ai2.hasKey === false, `encrypted at rest: ${ai1.encrypted}`);

  await page.getByRole("button", { name: /Finished file/ }).click();
  await page.getByRole("button", { name: "Choose", exact: true }).click();
  await page.getByLabel("Match").fill("E2E proof match");
  await page.getByRole("button", { name: "Scan this video" }).click();
  await page.waitForURL(/#\/match\/[0-9a-f-]{36}/, { timeout: 15000 });
  const t0 = Date.now();
  await page.waitForFunction(() => /match report/i.test(document.body.innerText), null, { timeout: 180000 }).catch(async (e) => {
    await page.screenshot({ path: path.join(OUT, "desktop-timeout.png"), fullPage: true });
    const id = page.url().split("/").pop();
    console.log("DEBUG session", JSON.stringify(await page.evaluate((i) => window.clipshotsDesktop.session(i), id)).slice(0, 1500));
    throw e;
  });
  const secs = ((Date.now() - t0) / 1000).toFixed(1);
  const sessionId = page.url().split("/").pop();
  const s = await page.evaluate((id) => window.clipshotsDesktop.session(id), sessionId);
  const clips = s.moments.map((m) => m.clipPath);
  const onBursts = s.moments.every((m) => [[20, 24], [64, 69], [100, 104]].some(([a, b]) => m.start < b && m.end > a));
  check("Caught all 3 action bursts, skipped the decoy", s.moments.length === 3 && onBursts, `${s.moments.length} moments in ${secs}s`);
  const probe = (c) => spawnSync(FFMPEG, ["-hide_banner", "-i", c], { encoding: "utf8" }).stderr;
  const real = clips.every((c) => existsSync(c) && /Video: h264/.test(probe(c)) && /Audio: aac/.test(probe(c)));
  check("Each moment is a real MP4 on disk", real, clips.map((c) => path.basename(c)).join(", "));
  check("Full match recording stitched for editors", existsSync(path.join(s.folder, "recording", "full.mp4")));

  // Playback through the media protocol.
  const played = await page.evaluate(async (p) => {
    const v = document.createElement("video");
    v.muted = true;
    v.src = window.clipshotsDesktop.mediaUrl(p);
    document.body.appendChild(v);
    return await new Promise((r) => {
      v.onloadedmetadata = () => (r(v.duration), v.remove());
      v.onerror = () => r(-1);
      setTimeout(() => r(-2), 10000);
    });
  }, clips[0]);
  check("Clip plays in the board", played > 2, `duration ${played}s`);
  const blocked = await page.evaluate(async () => (await fetch(window.clipshotsDesktop.mediaUrl("/etc/passwd")).catch(() => ({ status: 0 }))).status);
  check("Files outside the Clipshots folder are blocked", blocked === 403 || blocked === 0, `status ${blocked}`);

  await page.screenshot({ path: path.join(OUT, "desktop-board.png"), fullPage: true });
  await page.evaluate(() => (location.hash = "#/settings"));
  await page.waitForFunction(() => document.body.innerText.includes("AI labels"));
  await page.screenshot({ path: path.join(OUT, "desktop-settings.png") });
  await page.evaluate(() => (location.hash = "#/"));
  await page.waitForFunction(() => document.body.innerText.includes("E2E proof match"));
  await page.screenshot({ path: path.join(OUT, "desktop-home.png") });
  check("App made no network requests of its own", outside.length === 0, outside.slice(0, 3).join(" ") || "none");

  // Folder watch: a recording that starts growing in the watched folder gets caught.
  const watchDir = mkdtempSync(path.join(tmpdir(), "obs-"));
  await page.evaluate((d) => window.clipshotsDesktop.setWatch(d, "generic"), watchDir);
  const before = (await page.evaluate(() => window.clipshotsDesktop.sessions())).length;
  const rec = spawn(FFMPEG, ["-v", "error", "-re", "-i", path.join(FIX, "test120.mp4"), "-t", "40", "-c", "copy", "-f", "matroska", path.join(watchDir, "Replay 2026-11-06.mkv")]);
  let auto = null;
  for (let i = 0; i < 40 && !auto; i++) {
    await new Promise((r) => setTimeout(r, 1000));
    const ss = await page.evaluate(() => window.clipshotsDesktop.sessions());
    if (ss.length > before) auto = ss.find((x) => x.eventName === "Auto-caught recordings");
  }
  check("New recording in the watched folder is caught automatically", !!auto, auto ? auto.matchName : "no session started");
  await new Promise((r) => rec.on("close", r));
  if (auto) {
    // Recording finished at 40 s; the first burst (20-24 s) must be caught.
    let got = [];
    for (let i = 0; i < 30; i++) {
      const x = await page.evaluate((id) => window.clipshotsDesktop.session(id), auto.id);
      got = x?.moments ?? [];
      if (got.length) break;
      await new Promise((r) => setTimeout(r, 1000));
    }
    check("Watched recording produced the first-burst clip", got.some((m) => m.start < 24 && m.end > 20), got.map((m) => `${m.start}-${m.end}`).join(" "));
    await page.evaluate((id) => window.clipshotsDesktop.stop(id), auto.id);
    // Stop must actually stop a recording that's still being written.
    let stopped = false;
    for (let i = 0; i < 20 && !stopped; i++) {
      await new Promise((r) => setTimeout(r, 1000));
      stopped = (await page.evaluate((id) => window.clipshotsDesktop.session(id), auto.id))?.status !== "live";
    }
    check("Stop ends a recording-in-progress match", stopped);
  }
  // AI labels: with a key saved, each moment is reviewed and labelled.
  await page.evaluate(() => window.clipshotsDesktop.setAiKey("test-key-not-real"));
  await page.evaluate(() => (location.hash = "#/"));
  await page.waitForFunction(() => document.body.innerText.includes("Catch a match"));
  await page.getByRole("button", { name: /Finished file/ }).click();
  await page.getByRole("button", { name: "Choose", exact: true }).click();
  await page.getByLabel("Match").fill("E2E AI match");
  await page.getByLabel("Game", { exact: true }).selectOption("cs2");
  await page.getByRole("button", { name: "Scan this video" }).click();
  await page.waitForURL(/#\/match\/[0-9a-f-]{36}/, { timeout: 15000 });
  await page.waitForFunction(() => /match report/i.test(document.body.innerText), null, { timeout: 180000 });
  const aiS = await page.evaluate((id) => window.clipshotsDesktop.session(id), page.url().split("/").pop());
  const allAi = aiS.moments.length === 3 && aiS.moments.every((m) => m.source === "ai" && m.category === "Clutch" && m.label === "1vX clutch" && m.score === Math.round(0.7 * 91 + 0.3 * m.scanScore));
  check("AI review labels every moment (70/30 blend)", allAi, aiS.moments.map((m) => `${m.label} ${m.score}`).join(", "));
  check("Key sent by the app, frames attached, request under the size limit", geminiCalls.length >= 3 && geminiCalls.every((c) => c.auth === "Bearer test-key-not-real" && c.images >= 6 && c.size < 3_500_000), `${geminiCalls.length} calls, ${geminiCalls[0]?.images} frames, ${Math.round((geminiCalls[0]?.size ?? 0) / 1024)} KB`);
  await page.screenshot({ path: path.join(OUT, "desktop-board-ai.png"), fullPage: true });
  await page.evaluate(() => window.clipshotsDesktop.setAiKey(null));

  check("Watch setting remembered", existsSync(path.join(await app.evaluate(({ app }) => app.getPath("userData")), "prefs.json")));
} finally {
  writeFileSync(path.join(OUT, "e2e-results.json"), JSON.stringify(results, null, 2));
  // Stop anything still catching, so closing doesn't wait on the "still catching" warning.
  const page0 = app.windows()[0];
  const stillLive = await page0?.evaluate(async () => {
    const ss = await window.clipshotsDesktop.sessions();
    const live = ss.filter((x) => x.status === "live");
    for (const x of live) await window.clipshotsDesktop.stop(x.id);
    return live.map((x) => x.matchName);
  }).catch(() => []);
  if (stillLive?.length) console.log("stopped before closing:", stillLive.join(", "));
  await new Promise((r) => setTimeout(r, 3000));
  await Promise.race([app.close().catch(() => null), new Promise((r) => setTimeout(r, 15000))]);
  evil.close();
  gemini.close();
}
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
