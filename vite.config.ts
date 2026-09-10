import { defineConfig } from 'vite';

export default defineConfig({
  base: '/DoubleFight-Web/',
  build: {
    target: 'es2020',
    sourcemap: true,
  },
});
