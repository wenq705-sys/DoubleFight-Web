import { build } from 'vite';
import { copyFile, mkdir, readFile } from 'node:fs/promises';

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
      name: 'DoubleFightDouyinPlatformFoundation',
      formats: ['iife'],
      fileName: () => 'game.js',
    },
  },
});
await mkdir(outDir, { recursive: true });
await Promise.all(['game.json', 'project.config.json'].map(name =>
  copyFile(`platform/douyin/${name}`, `${outDir}/${name}`),
));
const projectConfig = JSON.parse(await readFile(`${outDir}/project.config.json`, 'utf8'));
if (projectConfig.setting?.urlCheck !== false) {
  throw new Error('Douyin IDE development build requires setting.urlCheck=false so local WSS testing is not reset on rebuild. Release packaging must re-enable domain checks.');
}
