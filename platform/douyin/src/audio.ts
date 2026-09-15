import type { PresentationEvent } from '../../../src/battle/PresentationEvents';
import type { DouyinApi, DouyinInnerAudioContext } from './api';

type Cue = 'move' | 'merge' | 'merge_high' | 'skill' | 'impact' | 'victory' | 'defeat';

const SOURCES: Record<Cue, string> = {
  move: 'audio/move.wav',
  merge: 'audio/merge.wav',
  merge_high: 'audio/merge-high.wav',
  skill: 'audio/skill.wav',
  impact: 'audio/impact.wav',
  victory: 'audio/victory.wav',
  defeat: 'audio/defeat.wav',
};

export class DouyinAudio {
  private readonly contexts = new Map<Cue, DouyinInnerAudioContext>();
  private enabled = true;

  constructor(private readonly api: Pick<DouyinApi, 'createInnerAudioContext'>) {}

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (!enabled) for (const context of this.contexts.values()) {
      try { context.stop(); } catch { /* optional host audio */ }
    }
  }

  playEvent(event: PresentationEvent): void {
    if (event.type === 'move') this.play('move', 0.34);
    if (event.type === 'merge') this.play(event.value >= 256 ? 'merge_high' : 'merge', event.value >= 512 ? 0.8 : 0.56);
    if (event.type === 'skill_cast') this.play('skill', 0.56);
    if (event.type === 'skill_hit') this.play('impact', event.skill === 'petrify' ? 0.74 : 0.55);
    if (event.type === 'status_remove') this.play('skill', 0.42);
  }

  victory(): void { this.play('victory', 0.72); }
  defeat(): void { this.play('defeat', 0.48); }

  dispose(): void {
    for (const context of this.contexts.values()) {
      try { context.destroy(); } catch { /* ignore */ }
    }
    this.contexts.clear();
  }

  private play(cue: Cue, volume: number): void {
    if (!this.enabled || !this.api.createInnerAudioContext) return;
    let context = this.contexts.get(cue);
    if (!context) {
      try {
        context = this.api.createInnerAudioContext();
        context.src = SOURCES[cue];
        context.autoplay = false;
        context.loop = false;
        context.obeyMuteSwitch = true;
        context.onError?.(() => { /* audio is product polish, never a startup blocker */ });
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
