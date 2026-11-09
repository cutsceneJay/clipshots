// Bundles main + preload. The catcher and detection code come from the shared source.
import { build } from "esbuild";
const common = { bundle: true, platform: "node", target: "node22", sourcemap: true, logLevel: "warning" };
await build({ ...common, entryPoints: ["src/main.ts"], outfile: "dist/main.js", format: "cjs", external: ["electron", "ffmpeg-static"] });
// Sandboxed preloads must be one file that only requires "electron".
await build({ ...common, entryPoints: ["src/preload.ts"], outfile: "dist/preload.js", format: "cjs", external: ["electron"] });
console.log("built desktop/dist");
