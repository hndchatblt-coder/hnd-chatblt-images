import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  base: './',
  // One file. Ben plays on an iPhone, and the delivery path that actually
  // works is a single self-contained HTML opened in Safari.
  plugins: [react(), viteSingleFile()],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  build: { outDir: 'play', target: 'es2022', assetsInlineLimit: 100000000, cssCodeSplit: false },
});
