import { defineConfig } from "vitest/config";
// Separate from vite.config.ts so tests don't boot the Cloudflare worker runtime.
export default defineConfig({ test: { include: ["src/**/*.test.ts"], alias: { "@/": new URL("./src/", import.meta.url).pathname }, environment: "node" } });
