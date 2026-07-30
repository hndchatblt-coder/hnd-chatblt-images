import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { viteSingleFile } from "vite-plugin-singlefile";

/**
 * Single-file build on purpose. Ben playtests on an iPhone via a raw.githack URL; one
 * self-contained HTML with no sibling asset requests is the delivery path that reliably works
 * (see CLAUDE.md). Relative base so the file runs from any directory depth.
 */
export default defineConfig({
  base: "./",
  plugins: [react(), viteSingleFile()],
  build: {
    target: "es2020",
    cssCodeSplit: false,
    assetsInlineLimit: 100_000_000,
    chunkSizeWarningLimit: 2000,
    rollupOptions: { output: { inlineDynamicImports: true } },
  },
});
