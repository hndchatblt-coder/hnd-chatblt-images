import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { viteSingleFile } from "vite-plugin-singlefile";

export default defineConfig({
  // One self-contained HTML file: Ben plays on a phone, and a single tap on a link has to work.
  // Multi-file builds need a server; this doesn't.
  plugins: [react(), viteSingleFile()],
  server: { port: 5173, host: true },
  build: { target: "es2022", assetsInlineLimit: 100000000, cssCodeSplit: false },
});
