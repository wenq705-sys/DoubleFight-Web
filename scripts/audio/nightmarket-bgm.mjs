/** Original eight-bar Oriental Night Market loop, generated once at build-time. */
export function renderNightMarketMusic(pcmWav, sampleRate = 11025) {
  const beat = 60 / 124, bars = 8;
  const total = Math.round(bars * 4 * beat * sampleRate);
  const samples = new Float32Array(total);
  const hz = midi => 440 * Math.pow(2, (midi - 69) / 12);
  const noise = i => ((Math.imul(i + 11, 1664525) + 1013904223 >>> 8) & 65535) / 32768 - 1;
  function add(startBeat, durationBeats, voice) {
    const from = Math.round(startBeat * beat * sampleRate);
    const count = Math.min(total - from, Math.round(durationBeats * beat * sampleRate));
    if (count <= 0) return;
    for (let i = 0; i < count; i++) {
      samples[from + i] += voice(i / sampleRate, i / count, from + i);
    }
  }
  const phase = (n, t) => 2 * Math.PI * hz(n) * t;
  const pluck = (n, gain = .11) => (t, p) =>
    gain * Math.exp(-p * 4.4) * (1 - Math.exp(-p * 100)) *
    (.74 * Math.sin(phase(n, t)) + .19 * Math.sin(phase(n + 12, t)) +
      .07 * Math.sin(phase(n + 19, t)));
  const flute = (n, gain = .13) => (t, p, i) => {
    const vibrato = 1 + .002 * Math.sin(2 * Math.PI * 5.1 * t);
    const shape = Math.min(1, p * 19) * Math.min(1, (1 - p) * 13);
    return gain * shape * (.87 * Math.sin(phase(n, t) * vibrato)
      + .10 * Math.sin(phase(n + 12, t) * vibrato) + .012 * noise(i));
  };
  const bell = (n, gain = .045) => (t, p) =>
    gain * Math.exp(-p * 6) * (.70 * Math.sin(phase(n, t)) +
      .21 * Math.sin(phase(n + 14, t)) + .09 * Math.sin(phase(n + 28, t)));
  // D minor pentatonic: D F G A C. Open fifths keep the mood festive, not martial.
  const roots = [50, 53, 55, 48, 50, 53, 55, 48];
  const pads = [[50,57,60],[53,60,65],[55,62,67],[48,55,60],
    [50,57,60],[53,60,65],[55,62,67],[48,55,60]];
  for (let bar = 0; bar < bars; bar++) {
    const at = bar * 4, root = roots[bar];
    for (const note of pads[bar]) add(at, 3.95, (t, p) =>
      .028 * Math.sin(phase(note, t)) * Math.min(1, p * 3.6) *
      Math.min(1, (1 - p) * 5.5));
    for (const offset of [0, 1.5, 2.5, 3.5]) add(at + offset, .48, pluck(root - 12, .105));
    const arp = [root+12,root+19,root+24,root+19,root+15,root+19,root+24,root+19];
    arp.forEach((note, step) => add(at + step * .5, .46, pluck(note, .074)));
  }
  const phrases = [
    [74,null,77,79,81,79,77,74], [72,null,74,77,79,null,77,74],
    [74,77,79,null,81,84,81,79], [77,74,72,69,72,null,74,null],
    [74,77,79,81,84,null,81,79], [77,null,74,72,74,77,79,77],
    [79,81,84,81,79,77,74,72], [74,72,69,72,74,null,69,null],
  ];
  phrases.forEach((notes, bar) => notes.forEach((note, step) => {
    if (note !== null) add(bar * 4 + step * .5, .43, flute(note));
  }));
  // Light festival rhythm: kick, hand drum, shaker and woodblock.
  for (let step = 0; step < bars * 8; step++) {
    const at = step * .5;
    if (step % 2 === 0) add(at, .28, (t, p) =>
      .155 * Math.sin(2 * Math.PI * (95 - 46 * p) * t) * Math.exp(-p * 9));
    if (step % 4 === 2) add(at, .15, (t, p, i) =>
      .057 * noise(i) * Math.exp(-p * 13));
    add(at, .10, (t, p, i) =>
      (.026 * noise(i) + .012 * Math.sin(2 * Math.PI * 1100 * t)) * Math.exp(-p * 18));
    if (step % 4 === 3) add(at, .12, (t, p) =>
      .039 * Math.sin(2 * Math.PI * 690 * t) * Math.exp(-p * 12));
  }
  // Lantern chimes answer the lead at phrase boundaries.
  for (const at of [3.5,7.5,11.5,15.5,19.5,23.5,27.5,30.5]) {
    add(at, .48, bell(at % 8 < 4 ? 86 : 84, .058));
  }
  // Remove loop-boundary clicks; tame overlap without destroying the groove.
  for (let i = 0; i < total; i++) {
    const edge = Math.min(1, i / (sampleRate * .018), (total - i - 1) / (sampleRate * .018));
    samples[i] = Math.tanh(samples[i] * 1.18) * .85 * Math.max(0, edge);
  }
  return pcmWav(samples, sampleRate);
}
