import { build } from 'vite';
import { copyFile, mkdir, readFile, writeFile, stat } from 'node:fs/promises';

const release = process.argv.includes('--release') || process.env.DOUYIN_RELEASE === '1';
const outDir = release ? 'platform/douyin/dist-release' : 'platform/douyin/dist';
const projectConfigSource = release
  ? 'platform/douyin/project.release.config.json'
  : 'platform/douyin/project.config.json';

await build({
  configFile: false,
  publicDir: false,
  define: { __DOUYIN_RELEASE__: JSON.stringify(release) },
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
await writeGeneratedAudio(outDir);
await writeNightMarketNativeAssets(outDir);

const projectConfig = JSON.parse(await readFile(`${outDir}/project.config.json`, 'utf8'));
const urlCheck = projectConfig.setting?.urlCheck;
if (release && urlCheck !== true) {
  throw new Error('Douyin release build requires setting.urlCheck=true.');
}
if (!release && urlCheck !== false) {
  throw new Error('Douyin IDE development build requires setting.urlCheck=false so local WSS testing is not reset on rebuild.');
}

console.log(`Douyin ${release ? 'release' : 'development'} build written to ${outDir}`);


/**
 * Douyin IDE uploads only outDir (publicDir:false). This copies the entire approved
 * native LOD scene into its LOCAL READ-ONLY package for FileSystemManager.readFile.
 * A non-subpackage Douyin game currently permits <=20MiB; reserve main logic within it.
 */
async function writeNightMarketNativeAssets(outDir) {
  const source = 'public/assets/themes/nightmarket';
  const target = outDir + '/assets/nightmarket';
  const levels = ['0002','0004','0008','0016','0032','0064','0128','0256','0512','1024','2048'];
  const paths = ['board-4x4.glb','environment-mobile.glb',...levels.map(level=>'tiles/'+level+'.glb')];
  let assetBytes = 0;
  for (const path of paths) {
    const bytes = await readFile(source+'/'+path);
    if (bytes.length<64 || bytes.toString('ascii',0,4)!=='glTF' || bytes.readUInt32LE(4)!==2 ||
        bytes.readUInt32LE(8)!==bytes.length) {
      throw new Error('Invalid native night-market GLB: '+path);
    }
    const dir = path.includes('/') ? target+'/tiles' : target;
    await mkdir(dir,{recursive:true});
    await writeFile(target+'/'+path,bytes);
    const copied = await stat(target+'/'+path);
    if (copied.size!==bytes.length) throw new Error('Partial model copy: '+path);
    assetBytes+=bytes.length;
  }
  const packageSize=assetBytes+(await stat(outDir+'/game.js')).size;
  // Non-subpackaged Douyin mini-games are limited to 20MiB. Future add-ons must
  // use subpackages, not silently bloat launch or increase cold-start time.
  if (packageSize > 20*1024*1024) throw new Error('Native package exceeds 20MiB size budget');
  await writeFile(target+'/manifest.json',JSON.stringify({
    scene:'东方夜市·莲灯盛会',
    placement:'native packaged /assets/nightmarket/*, no external URLs',
    characterModels:levels.length,
    generatedPaths:paths,assetBytes,gameJsBytes:(await stat(outDir+'/game.js')).size,
    packageBudgetMiB:20,packageSoFarBytes:packageSize,
  },null,2));
  console.log('Douyin native night-market installed:',paths.length,'GLBs',
    (assetBytes/1048576).toFixed(2)+'MiB',
    'total+game.js:',(packageSize/1048576).toFixed(2)+'MiB');
}

function wavBuffer(sequence, sampleRate = 22050) {
  const samples = [];
  for (const segment of sequence) {
    const count = Math.max(1, Math.floor(segment.duration * sampleRate));
    for (let i = 0; i < count; i++) {
      const t = i / sampleRate;
      const progress = i / count;
      const freq = segment.from + (segment.to - segment.from) * progress;
      const attack = Math.min(1, progress / 0.08);
      const release = Math.min(1, (1 - progress) / 0.16);
      const envelope = Math.max(0, Math.min(attack, release));
      samples.push(Math.sin(Math.PI * 2 * freq * t) * envelope * segment.gain);
    }
  }

  const buffer = Buffer.alloc(44 + samples.length * 2);
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + samples.length * 2, 4);
  buffer.write('WAVE', 8);
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36);
  buffer.writeUInt32LE(samples.length * 2, 40);
  samples.forEach((sample, index) => {
    buffer.writeInt16LE(Math.round(Math.max(-1, Math.min(1, sample)) * 32767), 44 + index * 2);
  });
  return buffer;
}

async function writeGeneratedAudio(root) {
  const audioDir = `${root}/audio`;
  await mkdir(audioDir, { recursive: true });
  const cues = {
    'move.wav': [
      { from: 220, to: 130, duration: 0.055, gain: 0.22 },
    ],
    'merge.wav': [
      { from: 330, to: 460, duration: 0.08, gain: 0.28 },
      { from: 520, to: 700, duration: 0.1, gain: 0.22 },
    ],
    'merge-high.wav': [
      { from: 260, to: 520, duration: 0.11, gain: 0.34 },
      { from: 520, to: 880, duration: 0.14, gain: 0.3 },
      { from: 880, to: 1180, duration: 0.16, gain: 0.2 },
    ],
    'skill.wav': [
      { from: 220, to: 760, duration: 0.12, gain: 0.28 },
      { from: 520, to: 1040, duration: 0.18, gain: 0.24 },
    ],
    'impact.wav': [
      { from: 840, to: 180, duration: 0.14, gain: 0.34 },
      { from: 160, to: 70, duration: 0.16, gain: 0.28 },
    ],
    'victory.wav': [
      { from: 330, to: 440, duration: 0.13, gain: 0.3 },
      { from: 440, to: 660, duration: 0.13, gain: 0.32 },
      { from: 660, to: 990, duration: 0.22, gain: 0.28 },
    ],
    'defeat.wav': [
      { from: 420, to: 310, duration: 0.15, gain: 0.24 },
      { from: 310, to: 180, duration: 0.22, gain: 0.2 },
    ],
  };
  await Promise.all(Object.entries(cues).map(([name, sequence]) =>
    writeFile(`${audioDir}/${name}`, wavBuffer(sequence))
  ));
}
