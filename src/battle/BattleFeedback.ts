import { SoundDesign } from '../audio/SoundDesign';
import type { PresentationEvent } from './PresentationEvents';
import type { ThemePresentation } from '../rendering/themes/ThemePresentation';

export class BattleFeedback {
  constructor(private readonly sound = new SoundDesign(), private readonly vibrate = (pattern: number | number[]) => {
    if (typeof navigator !== 'undefined') navigator.vibrate?.(pattern);
  }) {}

  play(event: PresentationEvent, theme: ThemePresentation): void {
    if (event.type === 'move') { this.sound.move(); this.vibrate(theme.feedback.move); }
    if (event.type === 'merge') {
      this.sound.merge(event.value);
      if (event.value >= 2048) this.sound.legendary();
      this.vibrate(event.value >= 1024 ? [32, 22, 58] : event.value >= 512 ? [26, 16, 42] : event.value >= 128 ? [19, 9, 24] : theme.feedback.merge);
    }
    if (event.type === 'skill_cast') { this.sound.skill(); this.vibrate(theme.feedback.skill); }
  }
}
