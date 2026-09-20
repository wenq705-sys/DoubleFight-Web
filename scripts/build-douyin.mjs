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


function pcmWav(samples, sampleRate = 11025) {
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

function wavBuffer(sequence, sampleRate = 22050) {
  const samples = [];
  for (const segment of sequence) {
    const count = Math.max(1, Math.floor(segment.duration * sampleRate));
    for (let i = 0; i < count; i += 1) {
      const progress = i / count;
      const t = i / sampleRate;
      const freq = segment.from + (segment.to - segment.from) * progress;
      const attack = Math.min(1, progress / 0.06);
      const release = Math.min(1, (1 - progress) / 0.12);
      const envelope = Math.max(0, Math.min(attack, release));
      samples.push(Math.sin(Math.PI * 2 * freq * t) * envelope * segment.gain);
    }
  }
  return pcmWav(samples, sampleRate);
}

const midiHz = midi => 440 * Math.pow(2, (midi - 69) / 12);
const wave = (kind, phase) => {
  if (kind === 'square') return Math.sin(phase) >= 0 ? 1 : -1;
  if (kind === 'triangle') return 2 / Math.PI * Math.asin(Math.sin(phase));
  if (kind === 'pluck') return Math.sin(phase) * 0.72 + Math.sin(phase * 2) * 0.2 + Math.sin(phase * 3) * 0.08;
  if (kind === 'bell') return Math.sin(phase) * 0.68 + Math.sin(phase * 2.01) * 0.22 + Math.sin(phase * 3.98) * 0.1;
  return Math.sin(phase);
};

function renderMusic(plan, sampleRate = 11025) {
  const beat = 60 / plan.bpm;
  const bars = 4;
  const duration = beat * 4 * bars;
  const total = Math.floor(duration * sampleRate);
  const samples = new Array(total).fill(0);
  const seedNoise = index => ((((index * 1103515245 + 12345) >>> 8) & 0xffff) / 32768) - 1;
  const add = (start, length, generator) => {
    const from = Math.max(0, Math.floor(start * sampleRate));
    const count = Math.min(total - from, Math.floor(length * sampleRate));
    for (let i = 0; i < count; i += 1) samples[from + i] += generator(i / sampleRate, i / Math.max(1, count));
  };

  // Kick / snare / hats create a readable groove on phone speakers.
  for (let step = 0; step < bars * 8; step += 1) {
    const at = step * beat / 2;
    if (step % 2 === 0) {
      add(at, 0.16, (t, p) => Math.sin(Math.PI * 2 * (82 - p * 42) * t) * Math.exp(-p * 7) * plan.drum);
    }
    if (step % 4 === 2) {
      add(at, 0.11, (_t, p) => seedNoise(step * 4096 + Math.floor(p * 2048)) * Math.exp(-p * 10) * plan.drum * 0.42);
    }
    add(at, 0.045, (_t, p) => seedNoise(step * 8192 + Math.floor(p * 1024)) * Math.exp(-p * 15) * plan.hat);
  }

  // Bass follows one chord per bar with an off-beat pickup.
  plan.chords.forEach((root, bar) => {
    for (const beatIndex of [0, 1.5, 2, 3.5]) {
      const at = (bar * 4 + beatIndex) * beat;
      const hz = midiHz(root - 12);
      add(at, beat * 0.42, (t, p) => wave('triangle', Math.PI * 2 * hz * t) * Math.pow(1 - p, 1.8) * plan.bass);
    }
    const chord = [root, root + 4, root + 7];
    chord.forEach((note, voice) => {
      const hz = midiHz(note);
      add(bar * 4 * beat, beat * 3.9, (t, p) => wave(plan.pad, Math.PI * 2 * hz * t + voice * 0.3) * Math.sin(Math.PI * Math.min(1, p * 1.8)) * Math.min(1, (1 - p) * 3) * plan.chord * 0.34);
    });
  });

  // A short 8th-note hook repeats twice so the loop is memorable within seconds.
  for (let repeat = 0; repeat < 2; repeat += 1) {
    plan.hook.forEach((note, index) => {
      if (note === null) return;
      const at = (repeat * 8 + index * 0.5) * beat;
      const hz = midiHz(note);
      add(at, beat * 0.44, (t, p) => {
        const env = Math.pow(1 - p, plan.lead === 'bell' ? 2.2 : 1.25);
        const vibrato = 1 + Math.sin(t * 18) * 0.0025;
        return wave(plan.lead, Math.PI * 2 * hz * vibrato * t) * env * plan.melody;
      });
    });
  }

  // Theme accent hits make each world immediately identifiable.
  for (const accent of plan.accents) {
    add(accent.beat * beat, beat * accent.length, (t, p) =>
      wave(accent.wave, Math.PI * 2 * midiHz(accent.note) * t) * Math.pow(1 - p, 1.6) * accent.gain
    );
  }

  // Soft limiter keeps layered synthesis clean and avoids clipping.
  return pcmWav(samples.map(sample => Math.tanh(sample * 1.18) * 0.78), sampleRate);
}

async function writeGeneratedAudio(root) {
  const audioDir = `${root}/audio`;
  await mkdir(audioDir, { recursive: true });
  const cues = {
    'move.wav': [{ from: 220, to: 130, duration: 0.055, gain: 0.22 }],
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

  const plans = {
    kingdom: {
      bpm: 126, chords: [55, 60, 52, 57], hook: [67, 69, 71, 74, 71, 69, 67, 64],
      lead: 'pluck', pad: 'triangle', melody: .17, chord: .12, bass: .16, drum: .22, hat: .045,
      accents: [{ beat: 7.5, length: .5, note: 79, wave: 'bell', gain: .08 }],
    },
    palace: {
      bpm: 122, chords: [57, 62, 55, 60], hook: [69, 72, 74, 76, 74, 72, 69, 67],
      lead: 'pluck', pad: 'sine', melody: .15, chord: .13, bass: .14, drum: .16, hat: .038,
      accents: [{ beat: 3.5, length: .75, note: 81, wave: 'bell', gain: .10 }],
    },
    zodiac: {
      bpm: 132, chords: [45, 50, 52, 48], hook: [69, 72, 74, 76, 79, 76, 74, 72],
      lead: 'square', pad: 'triangle', melody: .145, chord: .11, bass: .20, drum: .30, hat: .055,
      accents: [
        { beat: 0, length: .8, note: 57, wave: 'bell', gain: .10 },
        { beat: 8, length: .8, note: 64, wave: 'bell', gain: .11 },
      ],
    },
    candy: {
      bpm: 138, chords: [60, 65, 57, 67], hook: [72, 76, 79, 81, 79, 76, 74, 71],
      lead: 'bell', pad: 'square', melody: .13, chord: .085, bass: .13, drum: .19, hat: .06,
      accents: [
        { beat: 3.5, length: .35, note: 84, wave: 'bell', gain: .10 },
        { beat: 11.5, length: .35, note: 88, wave: 'bell', gain: .10 },
      ],
    },
    dreamhouse: {
      bpm: 124, chords: [55, 59, 60, 57], hook: [67, 71, 74, 71, 69, 67, 64, 66],
      lead: 'pluck', pad: 'sine', melody: .145, chord: .14, bass: .13, drum: .16, hat: .042,
      accents: [{ beat: 15, length: .7, note: 79, wave: 'bell', gain: .075 }],
    },
  };

  await Promise.all(Object.entries(plans).map(([theme, plan]) =>
    writeFile(`${audioDir}/music-${theme}.wav`, renderMusic(plan))
  ));
}
