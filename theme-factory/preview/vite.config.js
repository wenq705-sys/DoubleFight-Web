import { defineConfig } from 'vite';
import { fileURLToPath, URL } from 'node:url';
const here = fileURLToPath(new URL('.', import.meta.url));
export default defineConfig({
  root: here,
  base: './',
  publicDir: fileURLToPath(new URL('../dist/', import.meta.url)),
  build: { outDir: fileURLToPath(new URL('../site/', import.meta.url)), emptyOutDir: true, target: 'es2022' },
  server: { host: '0.0.0.0' },
});
