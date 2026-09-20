import { build } from 'vite';
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';

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

const projectConfig = JSON.parse(await readFile(`${outDir}/project.config.json`, 'utf8'));
const urlCheck = projectConfig.setting?.urlCheck;
if (release && urlCheck !== true) {
  throw new Error('Douyin release build requires setting.urlCheck=true.');
}
if (!release && urlCheck !== false) {
  throw new Error('Douyin IDE development build requires setting.urlCheck=false so local WSS testing is not reset on rebuild.');
}

console.log(`Douyin ${release ? 'release' : 'development'} build written to ${outDir}`);


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
    'merge-legendary.wav': [
      { from: 180, to: 420, duration: 0.12, gain: 0.30 },
      { from: 420, to: 840, duration: 0.16, gain: 0.34 },
      { from: 840, to: 1320, duration: 0.20, gain: 0.28 },
      { from: 660, to: 990, duration: 0.24, gain: 0.18 },
    ],
    'milestone.wav': [
      { from: 392, to: 523, duration: 0.12, gain: 0.22 },
      { from: 523, to: 659, duration: 0.14, gain: 0.22 },
      { from: 659, to: 784, duration: 0.18, gain: 0.18 },
    ],
    'rescue.wav': [
      { from: 330, to: 440, duration: 0.12, gain: 0.16 },
      { from: 440, to: 587, duration: 0.16, gain: 0.16 },
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

  const musicPlans = {
    kingdom: [196, 247, 294, 392, 294, 247, 220, 294, 330, 392, 330, 247],
    palace: [220, 277, 330, 440, 392, 330, 277, 330, 370, 440, 370, 277],
    zodiac: [165, 220, 247, 330, 294, 247, 196, 247, 294, 370, 330, 220],
    candy: [262, 330, 392, 523, 440, 392, 330, 392, 494, 523, 440, 330],
    dreamhouse: [196, 247, 330, 392, 330, 294, 247, 294, 330, 440, 392, 247],
  };
  await Promise.all(Object.entries(musicPlans).map(([theme, notes]) => {
    const sequence = notes.map((note, index) => ({
      from: note,
      to: index % 3 === 0 ? note * 1.01 : note,
      duration: 0.48,
      gain: index % 4 === 0 ? 0.085 : 0.065,
    }));
    return writeFile(`${audioDir}/music-${theme}.wav`, wavBuffer(sequence, 11025));
  }));
}
