// Downloads the yt-dlp binary for the platform being packaged into resources/bin.
import { mkdirSync, createWriteStream, chmodSync, existsSync } from "node:fs";
import { pipeline } from "node:stream/promises";
const platform = process.env.TARGET_PLATFORM || process.platform;
const name = platform === "win32" ? "yt-dlp.exe" : platform === "darwin" ? "yt-dlp_macos" : "yt-dlp_linux";
const out = `resources/bin/${platform === "win32" ? "yt-dlp.exe" : "yt-dlp"}`;
mkdirSync("resources/bin", { recursive: true });
if (!existsSync(out)) {
  const res = await fetch(`https://github.com/yt-dlp/yt-dlp/releases/latest/download/${name}`);
  if (!res.ok) throw new Error(`yt-dlp download failed: ${res.status}`);
  await pipeline(res.body, createWriteStream(out));
  if (platform !== "win32") chmodSync(out, 0o755);
}
console.log("yt-dlp ready:", out);
