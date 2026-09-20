import type { PresentationEvent } from '../../../src/battle/PresentationEvents';
import type { ThemeId } from '../../../src/config/themes';
import type { DouyinApi, DouyinInnerAudioContext } from './api';

type Cue =
  | 'move'
  | 'merge'
  | 'merge_high'
  | 'merge_legendary'
  | 'skill'
  | 'impact'
  | 'milestone'
  | 'rescue'
  | 'victory'
  | 'defeat';

export type MusicScene = 'home' | 'solo';

const SOURCES: Record<Cue, string> = {
  move: 'audio/move.wav',
  merge: 'audio/merge.wav',
  merge_high: 'audio/merge-high.wav',
  merge_legendary: 'audio/merge-legendary.wav',
  skill: 'audio/skill.wav',
  impact: 'audio/impact.wav',
  milestone: 'audio/milestone.wav',
  rescue: 'audio/rescue.wav',
  victory: 'audio/victory.wav',
  defeat: 'audio/defeat.wav',
};

const musicSource = (theme: ThemeId): string => `audio/music-${theme}.wav`;

export class DouyinAudio {
  private readonly contexts = new Map<Cue, DouyinInnerAudioContext>();
  private music: DouyinInnerAudioContext | null = null;
  private musicTheme: ThemeId | null = null;
  private musicScene: MusicScene = 'home';
  private musicPlaying = false;
  private sfxEnabled = true;
  private musicEnabled = true;
  private suspended = false;

  constructor(private readonly api: Pick<DouyinApi, 'createInnerAudioContext'>) {}

  /** Backward-compatible master SFX setter used by older call sites/tests. */
  setEnabled(enabled: boolean): void { this.setSfxEnabled(enabled); }

  setSfxEnabled(enabled: boolean): void {
    this.sfxEnabled = enabled;
    if (!enabled) {
      for (const context of this.contexts.values()) {
        try { context.stop(); } catch { /* optional host audio */ }
      }
    }
  }

  setMusicEnabled(enabled: boolean): void {
    this.musicEnabled = enabled;
    if (!enabled) this.stopMusic();
    else this.syncMusic();
  }

  setScene(scene: MusicScene, theme: ThemeId): void {
    const themeChanged = theme !== this.musicTheme;
    this.musicScene = scene;
    if (themeChanged) {
      this.destroyMusic();
      this.musicTheme = theme;
    }
    this.syncMusic();
  }

  suspend(): void {
    this.suspended = true;
    this.stopMusic();
    for (const context of this.contexts.values()) {
      try { context.stop(); } catch { /* optional host audio */ }
    }
  }

  resume(): void {
    this.suspended = false;
    this.syncMusic();
  }

  playEvent(event: PresentationEvent): void {
    if (event.type === 'move') this.play('move', 0.28);
    if (event.type === 'merge') {
      const cue: Cue = event.value >= 1024 ? 'merge_legendary' : event.value >= 256 ? 'merge_high' : 'merge';
      const volume = event.value >= 1024 ? 0.9 : event.value >= 512 ? 0.76 : 0.52;
      this.play(cue, volume);
    }
    if (event.type === 'skill_cast') this.play('skill', 0.54);
    if (event.type === 'skill_hit') this.play('impact', event.skill === 'petrify' ? 0.72 : 0.52);
    if (event.type === 'status_remove') this.play('skill', 0.4);
  }

  milestone(finalStage = false): void { this.play(finalStage ? 'merge_legendary' : 'milestone', finalStage ? 0.82 : 0.58); }
  rescue(): void { this.play('rescue', 0.46); }
  victory(): void { this.play('victory', 0.78); }
  defeat(): void { this.play('defeat', 0.52); }

  dispose(): void {
    this.destroyMusic();
    for (const context of this.contexts.values()) {
      try { context.destroy(); } catch { /* ignore */ }
    }
    this.contexts.clear();
  }

  private syncMusic(): void {
    if (!this.musicEnabled || this.suspended || !this.musicTheme || !this.api.createInnerAudioContext) return;
    if (!this.music) {
      try {
        const context = this.api.createInnerAudioContext();
        context.src = musicSource(this.musicTheme);
        context.autoplay = false;
        context.loop = true;
        context.obeyMuteSwitch = true;
        context.onError?.(() => { this.musicPlaying = false; });
        this.music = context;
      } catch {
        return;
      }
    }
    this.music.volume = this.musicScene === 'solo' ? 0.25 : 0.17;
    if (this.musicPlaying) return;
    try {
      this.music.seek(0);
      this.music.play();
      this.musicPlaying = true;
    } catch {
      this.musicPlaying = false;
    }
  }

  private stopMusic(): void {
    if (!this.music) return;
    try { this.music.stop(); } catch { /* optional host audio */ }
    this.musicPlaying = false;
  }

  private destroyMusic(): void {
    if (!this.music) return;
    try { this.music.stop(); } catch { /* ignore */ }
    try { this.music.destroy(); } catch { /* ignore */ }
    this.music = null;
    this.musicPlaying = false;
  }

  private play(cue: Cue, volume: number): void {
    if (!this.sfxEnabled || this.suspended || !this.api.createInnerAudioContext) return;
    let context = this.contexts.get(cue);
    if (!context) {
      try {
        context = this.api.createInnerAudioContext();
        context.src = SOURCES[cue];
        context.autoplay = false;
        context.loop = false;
        context.obeyMuteSwitch = true;
        context.onError?.(() => { /* audio polish never blocks startup */ });
        this.contexts.set(cue, context);
      } catch {
        return;
      }
    }
    try {
      context.volume = volume;
      context.stop();
      context.seek(0);
      context.play();
    } catch { /* unsupported simulator/device path */ }
  }
}
