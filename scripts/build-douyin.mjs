import { build } from 'vite';
import { copyFile, mkdir } from 'node:fs/promises';

const outDir = 'platform/douyin/dist';
await build({
  configFile: false,
  publicDir: false,
  build: {
    target: 'es2020',
    outDir,
    emptyOutDir: true,
    minify: false,
    sourcemap: false,
    lib: {
      entry: 'platform/douyin/src/main.ts',
      name: 'DoubleFightDouyinRuntimeSpike',
      formats: ['iife'],
      fileName: () => 'game.js',
    },
  },
});
await mkdir(outDir, { recursive: true });
await Promise.all(['game.json', 'project.config.json'].map(name =>
  copyFile(`platform/douyin/${name}`, `${outDir}/${name}`),
));
