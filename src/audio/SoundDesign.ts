export class SoundDesign {
  private context: AudioContext | null = null;

  private ensureContext(): AudioContext | null {
    if (this.context) {
      if (this.context.state === 'suspended') void this.context.resume();
      return this.context;
    }
    try {
      this.context = new AudioContext();
      return this.context;
    } catch {
      return null;
    }
  }

  move(): void {
    const context = this.ensureContext();
    if (!context) return;
    const now = context.currentTime;
    this.tone(context, now, 148, 104, 0.058, 0.022, 'sine');
    this.tone(context, now + 0.012, 235, 178, 0.052, 0.012, 'triangle');
  }

  merge(value: number): void {
    const context = this.ensureContext();
    if (!context) return;
    const now = context.currentTime;
    const tier = Math.max(1, Math.log2(value));
    const root = 176 + tier * 22;
    const volume = value >= 1024 ? 0.072 : value >= 512 ? 0.062 : value >= 128 ? 0.05 : 0.034;

    this.tone(context, now, 118 + tier * 3, 82 + tier * 2, 0.075, volume * 0.65, 'sine');
    this.tone(context, now + 0.012, root, root * 1.16, 0.21, volume, 'triangle');
    this.tone(context, now + 0.035, root * 1.5, root * 1.62, 0.18, volume * 0.56, 'sine');

    if (value >= 128) this.tone(context, now + 0.055, root * 2, root * 2.18, 0.24, volume * 0.36, 'sine');
  }

  legendary(): void {
    const context = this.ensureContext();
    if (!context) return;
    const now = context.currentTime;

    this.tone(context, now, 78, 62, 0.72, 0.08, 'sine');
    [220, 277, 330, 440].forEach((frequency, index) => {
      this.tone(context, now + index * 0.055, frequency, frequency * 1.06, 0.7, 0.055, index % 2 ? 'sine' : 'triangle');
    });
  }

  private tone(
    context: AudioContext,
    start: number,
    from: number,
    to: number,
    duration: number,
    volume: number,
    type: OscillatorType,
  ): void {
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(Math.max(20, from), start);
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(20, to), start + duration);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.linearRampToValueAtTime(volume, start + Math.min(0.02, duration * 0.25));
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    oscillator.connect(gain).connect(context.destination);
    oscillator.start(start);
    oscillator.stop(start + duration + 0.01);
  }
}
