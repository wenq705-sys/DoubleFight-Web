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
    if (event.type === 'skill_cast') {
      this.sound.skill();
      this.vibrate(theme.feedback.skill);
    }
    if (event.type === 'skill_hit') {
      this.sound.skillImpact(event.skill);
      this.vibrate(
        event.skill === 'petrify' ? [28, 10, 42]
        : event.skill === 'purify' ? [12, 6, 18, 6, 26]
        : event.skill === 'shield' ? [16, 8, 22]
        : [18, 7, 24],
      );
    }
    if (event.type === 'status_remove' && event.status === 'petrify') {
      this.sound.skillImpact('purify');
      this.vibrate([8, 5, 13]);
    }
  }
}
