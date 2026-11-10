import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath } from "node:url";

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  root: r("."),
  base: "./",
  plugins: [tailwindcss(), react()],
  resolve: {
    alias: [
      { find: "@/lib/detect", replacement: r("../../src/lib/detect") },
      { find: "@", replacement: r("./src") },
    ],
  },
  build: { outDir: r("../dist/ui"), emptyOutDir: true },
});
