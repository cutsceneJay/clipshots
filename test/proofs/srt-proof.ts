// Live-feed proof over SRT: a sender pushes the test video in real time,
// the catcher listens like it would for a production program feed.
import { Catcher } from "../../desktop/engine/catcher";
import { spawn } from "node:child_process";
const work = `/tmp/srt-proof-${Date.now()}`;
const c = new Catcher({ source: { kind: "srt", value: "9123" }, workDir: work, clipHeight: 360 });
const got: any[] = [];
c.on("moment", (m) => { got.push(m); console.log(`  caught ${m.start.toFixed(1)}-${m.end.toFixed(1)}s peak ${m.peak}s, ready ${m.latencySec}s after it aired`); });
c.on("error", (e) => console.error("ERROR", e.message));
const done = c.start();
await new Promise((r) => setTimeout(r, 1500));
const sender = spawn("ffmpeg", ["-v", "error", "-re", "-i", "test/fixtures/test120.mp4", "-c", "copy", "-f", "mpegts", "srt://127.0.0.1:9123?mode=caller"], { stdio: "inherit" });
sender.on("close", () => setTimeout(() => c.stop(), 3000));
await done;
console.log(JSON.stringify({ source: "srt", caught: got.map((m) => [m.start, m.end]), latency: got.map((m) => m.latencySec) }));
