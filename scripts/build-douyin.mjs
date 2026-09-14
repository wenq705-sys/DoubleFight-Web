import { build } from 'vite';
import { copyFile, mkdir, readFile } from 'node:fs/promises';

const release = process.argv.includes('--release') || process.env.DOUYIN_RELEASE === '1';
const outDir = release ? 'platform/douyin/dist-release' : 'platform/douyin/dist';
const projectConfigSource = release
  ? 'platform/douyin/project.release.config.json'
  : 'platform/douyin/project.config.json';

await build({
  configFile: false,
  publicDir: false,
  build: {
    target: 'es2020',
    outDir,
    emptyOutDir: true,
    minify: release ? 'esbuild' : false,
    sourcemap: false,
    lib: {
      entry: 'platform/douyin/src/main.ts',
      name: 'DoubleFightDouyin',
      formats: ['iife'],
      fileName: () => 'game.js',
    },
  },
});

await mkdir(outDir, { recursive: true });
await copyFile('platform/douyin/game.json', `${outDir}/game.json`);
await copyFile(projectConfigSource, `${outDir}/project.config.json`);

const projectConfig = JSON.parse(await readFile(`${outDir}/project.config.json`, 'utf8'));
const urlCheck = projectConfig.setting?.urlCheck;
if (release && urlCheck !== true) {
  throw new Error('Douyin release build requires setting.urlCheck=true.');
}
if (!release && urlCheck !== false) {
  throw new Error('Douyin IDE development build requires setting.urlCheck=false so local WSS testing is not reset on rebuild.');
}

console.log(`Douyin ${release ? 'release' : 'development'} build written to ${outDir}`);
