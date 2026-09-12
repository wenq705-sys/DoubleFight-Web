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
    this.tone(context, now, 185, 112, 0.05, 0.028, 'triangle');
    this.tone(context, now + 0.006, 320, 215, 0.042, 0.014, 'sine');
    this.tone(context, now + 0.018, 92, 72, 0.055, 0.012, 'sine');
  }

  merge(value: number): void {
    const context = this.ensureContext();
    if (!context) return;
    const now = context.currentTime;
    const tier = Math.max(1, Math.log2(value));
    const root = 172 + tier * 24;
    const volume = value >= 1024 ? 0.09 : value >= 512 ? 0.076 : value >= 128 ? 0.06 : 0.044;

    this.tone(context, now, 980, 520, 0.035, volume * 0.32, 'square');
    this.tone(context, now, 105 + tier * 2.4, 62 + tier * 1.4, 0.11, volume * 0.86, 'sine');
    this.tone(context, now + 0.016, root, root * 1.19, 0.23, volume, 'triangle');
    this.tone(context, now + 0.04, root * 1.5, root * 1.72, 0.2, volume * 0.62, 'sine');

    if (value >= 64) {
      this.tone(context, now + 0.058, root * 2.02, root * 2.34, 0.27, volume * 0.4, 'sine');
    }
    if (value >= 512) {
      this.tone(context, now + 0.085, root * 2.5, root * 2.82, 0.34, volume * 0.28, 'triangle');
    }
  }

  skill(): void {
    const context = this.ensureContext();
    if (!context) return;
    const now = context.currentTime;

    this.tone(context, now, 82, 52, 0.52, 0.085, 'sine');
    this.tone(context, now + 0.02, 220, 660, 0.42, 0.06, 'triangle');
    this.tone(context, now + 0.08, 440, 880, 0.34, 0.045, 'sine');
    this.tone(context, now + 0.16, 660, 1320, 0.42, 0.035, 'triangle');
    this.tone(context, now + 0.26, 990, 520, 0.2, 0.028, 'square');
  }

  skillImpact(kind: 'random_clear' | 'shield' | 'petrify' | 'shuffle' | 'purify'): void {
    const context = this.ensureContext();
    if (!context) return;
    const now = context.currentTime;

    if (kind === 'petrify') {
      this.tone(context, now, 1180, 320, 0.24, 0.065, 'triangle');
      this.tone(context, now + 0.035, 210, 72, 0.34, 0.08, 'sine');
      this.tone(context, now + 0.08, 1600, 760, 0.18, 0.035, 'square');
      return;
    }

    if (kind === 'shield') {
      this.tone(context, now, 240, 520, 0.24, 0.055, 'sine');
      this.tone(context, now + 0.055, 520, 1040, 0.3, 0.045, 'triangle');
      return;
    }

    if (kind === 'shuffle') {
      this.tone(context, now, 160, 720, 0.22, 0.05, 'triangle');
      this.tone(context, now + 0.08, 760, 190, 0.24, 0.04, 'sine');
      return;
    }

    if (kind === 'purify') {
      [440, 660, 880, 1320].forEach((frequency, index) => {
        this.tone(context, now + index * 0.045, frequency, frequency * 1.12, 0.24, 0.038, 'sine');
      });
      return;
    }

    this.tone(context, now, 520, 1040, 0.18, 0.05, 'triangle');
    this.tone(context, now + 0.04, 180, 90, 0.22, 0.055, 'sine');
  }

  legendary(): void {
    const context = this.ensureContext();
    if (!context) return;
    const now = context.currentTime;

    this.tone(context, now, 72, 48, 0.82, 0.105, 'sine');
    this.tone(context, now + 0.03, 118, 82, 0.56, 0.06, 'triangle');
    [220, 277, 330, 440, 554].forEach((frequency, index) => {
      this.tone(
        context,
        now + 0.09 + index * 0.055,
        frequency,
        frequency * 1.08,
        0.72,
        0.052,
        index % 2 ? 'sine' : 'triangle',
      );
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
    gain.gain.linearRampToValueAtTime(volume, start + Math.min(0.018, duration * 0.22));
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    oscillator.connect(gain).connect(context.destination);
    oscillator.start(start);
    oscillator.stop(start + duration + 0.01);
  }
}
