import { SoundDesign } from '../audio/SoundDesign';
import type { PresentationEvent } from './PresentationEvents';
import type { ThemePresentation } from '../rendering/themes/ThemePresentation';
import { browserPlatform } from '../platform/browser/BrowserPlatform';
import type { HapticIntent } from '../platform/types';

export class BattleFeedback {
  constructor(private readonly sound = new SoundDesign(), private readonly vibrate: (intent: HapticIntent) => void =
    intent => browserPlatform.haptics.trigger(intent)) {}

  play(event: PresentationEvent, theme: ThemePresentation): void {
    if (event.type === 'move') { this.sound.move(); this.vibrate('light'); }
    if (event.type === 'merge') {
      this.sound.merge(event.value);
      if (event.value >= 2048) this.sound.legendary();
      this.vibrate(event.value >= 512 ? 'success' : 'medium');
    }
    if (event.type === 'skill_cast') {
      this.sound.skill();
      this.vibrate('medium');
    }
    if (event.type === 'skill_hit') {
      this.sound.skillImpact(event.skill);
      this.vibrate(event.skill === 'petrify' ? 'error' : 'medium');
    }
    if (event.type === 'status_remove' && event.status === 'petrify') {
      this.sound.skillImpact('purify');
      this.vibrate('light');
    }
  }
}
