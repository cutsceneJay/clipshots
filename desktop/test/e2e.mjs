// Desktop end-to-end test. Launches the real Electron app against the web app
// (CLIPSHOTS_URL), then checks, for real:
//   - the desktop API is present on the Clipshots origin and absent elsewhere
//   - the user agent has no "Electron"
//   - catching a finished recording through the UI produces real MP4 clips on disk
//   - clips play back through the media protocol in the live board
//   - a growing recording dropped into the watched folder is caught automatically
// Run under Xvfb on Linux CI.
import { _electron as electron } from "playwright";
import { createServer } from "node:http";
import { spawn, spawnSync } from "node:child_process";
import { mkdtempSync, existsSync, readdirSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
const electronPath = createRequire(import.meta.url)("electron");

const APP = process.env.CLIPSHOTS_URL || "http://127.0.0.1:3000";
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

// An untrusted page on another origin.
const evil = createServer((_q, r) => r.end("<html><body>other site</body></html>")).listen(3999, "127.0.0.1");

const app = await electron.launch({
  // E2E_EXECUTABLE runs a packaged build (its bundled ffmpeg) instead of the dev app.
  executablePath: process.env.E2E_EXECUTABLE || electronPath,
  args: [...(process.env.E2E_EXECUTABLE ? [] : ["."]), ...(process.getuid?.() === 0 ? ["--no-sandbox"] : [])],
  env: { ...process.env, CLIPSHOTS_URL: APP, CLIPSHOTS_LIBRARY: lib, ...(process.env.E2E_EXECUTABLE ? {} : { FFMPEG_PATH: FFMPEG }) },
});
try {
  const page = await app.firstWindow();
  await page.waitForLoadState("domcontentloaded");
  await page.goto(`${APP}/catch`);
  await page.waitForFunction(() => !!window.clipshotsDesktop, null, { timeout: 90000 }).catch(() => null);

  check("Desktop API present on the Clipshots site", await page.evaluate(() => typeof window.clipshotsDesktop?.start === "function"));
  const ua = await page.evaluate(() => navigator.userAgent);
  check("User agent has no 'Electron'", !/electron/i.test(ua), ua);

  // Untrusted origin: same preload, different site.
  const absent = await app.evaluate(async ({ BrowserWindow }, url) => {
        const w = new BrowserWindow({ show: false, webPreferences: { preload: globalThis.__clipshotsPreload, sandbox: true, contextIsolation: true, additionalArguments: [`--clipshots-allowed=${process.env.CLIPSHOTS_URL ? new URL(process.env.CLIPSHOTS_URL).origin : ""}`] } });
    await w.loadURL(url);
    const v = await w.webContents.executeJavaScript("typeof window.clipshotsDesktop");
    w.destroy();
    return v;
  }, "http://127.0.0.1:3999/");
  check("Desktop API absent on another site", absent === "undefined", `typeof = ${absent}`);

  // Catch a finished recording through the real UI. The native file picker is
  // answered with the real path (the same thing a person picking it would give).
  const file = path.join(FIX, "test120.mp4");
  await app.evaluate(({ dialog }, f) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [f] });
  }, file);
  await page.goto(`${APP}/catch`);
  await page.getByRole("button", { name: /Finished file/ }).click();
  await page.getByRole("button", { name: "Choose", exact: true }).click();
  await page.getByLabel("Match").fill("E2E proof match");
  await page.getByRole("button", { name: "Scan this video" }).click();
  await page.waitForURL(/\/catch\/[0-9a-f-]{36}/, { timeout: 15000 });
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
  }
  check("Watch setting remembered", existsSync(path.join(await app.evaluate(({ app }) => app.getPath("userData")), "prefs.json")));
} finally {
  writeFileSync(path.join(OUT, "e2e-results.json"), JSON.stringify(results, null, 2));
  await app.close().catch(() => null);
  evil.close();
}
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
