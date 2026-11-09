// Scanner proof: runs the real catcher over the test footage.
//   npx tsx test/proofs/scan-proof.ts [file] [--live] [--silent]
import { Catcher } from "../../desktop/engine/catcher";
import { rmSync } from "node:fs";

const file = process.argv[2] ?? "test/fixtures/test120.mp4";
const live = process.argv.includes("--live");
const BURSTS = [[20, 24], [64, 69], [100, 104]];
const DECOY = [45, 49];
const work = `/tmp/catcher-proof-${Date.now()}`;
const c = new Catcher({ source: { kind: "recording", value: file, realtime: live }, workDir: work, clipHeight: 360 });
const t0 = Date.now();
const got: any[] = [];
import { spawnSync } from "node:child_process";
const FF = process.env.FFMPEG_PATH || "ffmpeg";
// Is the clip a real H.264+AAC MP4 whose content lines up with the source?
// Burst frames are saturated test patterns; calm frames are a dull blue-grey.
function sat(file: string, at: number) {
  const r = spawnSync(FF, ["-hide_banner", "-ss", String(at), "-i", file, "-frames:v", "1", "-vf", "signalstats,metadata=print:key=lavfi.signalstats.SATAVG", "-f", "null", "-"], { encoding: "utf8" });
  return Number(/SATAVG=([\d.]+)/.exec(r.stderr)?.[1] ?? -1);
}
const clipChecks: boolean[] = [];
c.on("moment", (m) => {
  got.push(m);
  const info = spawnSync(FF, ["-hide_banner", "-i", m.clipPath], { encoding: "utf8" }).stderr;
  const burst = BURSTS.find(([a, b]) => m.start < b && m.end > a);
  const d = /Duration: (\d+):(\d+):([\d.]+)/.exec(info);
  const len = d ? Number(d[1]) * 3600 + Number(d[2]) * 60 + Number(d[3]) : -1;
  const ok = Math.abs(len - (m.end - m.start)) <= 0.2 && /Video: h264/.test(info) && /Audio: aac/.test(info) && (!burst || (sat(m.clipPath, Math.max(0, burst[0] + 1 - m.start)) > 2 * sat(m.clipPath, 0.2) + 5));
  clipChecks.push(ok);
  console.log(`  caught ${m.start.toFixed(1)}-${m.end.toFixed(1)}s peak ${m.peak}s score ${m.score}${live ? ` ready ${m.latencySec}s after it aired` : ""}`);
});
c.on("error", (e) => console.error("ERROR", e.message)); c.on("log", (l) => console.error("LOG", l));
await c.start();
const secs = (Date.now() - t0) / 1000;
const overlaps = (m: any, [a, b]: number[]) => m.start < b && m.end > a;
const period = 120.0333;
const onBurst = (m: any) => { const off = Math.floor(m.peak / period) * period; return BURSTS.some(([a, b]) => m.peak >= off + a - 1 && m.peak <= off + b + 1); };
const covered = BURSTS.map((b) => got.some((m) => overlaps(m, b)));
const decoyHit = got.some((m) => m.peak >= DECOY[0] - 1 && m.peak <= DECOY[1] + 1);
console.log(JSON.stringify({ file, live, candidates: got.length, burstsCovered: covered, decoyCaught: decoyHit, clipsRealAndAligned: clipChecks.every(Boolean), allOnBursts: got.every(onBurst), seconds: secs }));
if (!process.env.KEEP) rmSync(work, { recursive: true, force: true }); else console.log("kept", work);
