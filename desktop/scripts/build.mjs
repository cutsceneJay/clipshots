// Builds the app window (Vite) and bundles the Electron main + preload (esbuild).
import { build } from "esbuild";
import { build as viteBuild } from "vite";

await viteBuild({ configFile: "ui/vite.config.mts", logLevel: "warn" });
const common = { bundle: true, platform: "node", target: "node22", sourcemap: true, logLevel: "warning" };
await build({ ...common, entryPoints: ["src/main.ts"], outfile: "dist/main.js", format: "cjs", external: ["electron", "ffmpeg-static"] });
// Sandboxed preloads must be one file that only requires "electron".
await build({ ...common, entryPoints: ["src/preload.ts"], outfile: "dist/preload.js", format: "cjs", external: ["electron"] });
console.log("built desktop/dist");
