// Past-video proof: serve the test video over HTTP like a hosted post,
// let the downloader fetch it, then catch moments at full speed.
import { Catcher } from "../../desktop/engine/catcher";
import { createServer } from "node:http";
import { createReadStream, statSync, rmSync } from "node:fs";
const file = "test/fixtures/test120.mp4";
const srv = createServer((_q, r) => { r.writeHead(200, { "content-type": "video/mp4", "content-length": statSync(file).size }); createReadStream(file).pipe(r); });
await new Promise<void>((r) => srv.listen(8765, "127.0.0.1", r));
const work = `/tmp/vod-proof-${Date.now()}`;
const c = new Catcher({ source: { kind: "vod", value: "http://127.0.0.1:8765/highlight-post.mp4" }, workDir: work, clipHeight: 360 });
const statuses = new Set<string>();
c.on("status", (s) => statuses.add(s.replace(/\d+%/, "N%")));
const got: any[] = [];
c.on("moment", (m) => got.push([m.start, m.end]));
c.on("error", (e) => console.error("ERROR", e.message));
const t0 = Date.now();
await c.start();
srv.close();
console.log(JSON.stringify({ source: "vod", statuses: [...statuses], caught: got, seconds: (Date.now() - t0) / 1000 }));
rmSync(work, { recursive: true, force: true });
