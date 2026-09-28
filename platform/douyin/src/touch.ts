import type { Direction } from '../../../shared/game/types';
import type { DouyinApi, DouyinTouchEvent, DouyinTouchPoint } from './api';

/** One completed primary swipe produces at most one shared-core direction. */
export class DouyinSwipeInput {
  private start: DouyinTouchPoint | null = null;
  private latest: DouyinTouchPoint | null = null;
  private active = false;
  private multiTouchBlocked = false;

  constructor(
    private readonly api: DouyinApi,
    private readonly onDirection: (direction: Direction) => void,
    private readonly onTap?: (x: number, y: number) => void,
  ) {
    api.onTouchStart(event => this.onStart(event));
    api.onTouchMove(event => this.onMove(event));
    api.onTouchEnd(event => this.onEnd(event));
    api.onTouchCancel(() => this.cancel(true));
  }

  setActive(active: boolean): void {
    this.active = active;
    if (!active) this.cancel(true);
  }

  cancel(resetMultiTouch = false): void {
    this.start = null;
    this.latest = null;
    if (resetMultiTouch) this.multiTouchBlocked = false;
  }

  private hasMultipleTouches(event: DouyinTouchEvent): boolean {
    return event.touches.length > 1 || event.changedTouches.length > 1;
  }

  private onStart(event: DouyinTouchEvent): void {
    if (!this.active) return;
    event.preventDefault?.();
    if (this.hasMultipleTouches(event)) {
      this.multiTouchBlocked = true;
      this.cancel();
      return;
    }
    if (this.multiTouchBlocked || this.start) return;
    this.start = event.changedTouches[0] ?? event.touches[0] ?? null;
    this.latest = this.start;
  }

  private onMove(event: DouyinTouchEvent): void {
    if (!this.active) return;
    event.preventDefault?.();
    if (this.hasMultipleTouches(event)) {
      this.multiTouchBlocked = true;
      this.cancel();
      return;
    }
    if (this.multiTouchBlocked || !this.start) return;
    this.latest = event.touches.find(touch => touch.identifier === this.start?.identifier)
      ?? event.changedTouches.find(touch => touch.identifier === this.start?.identifier)
      ?? this.latest;
  }

  private onEnd(event: DouyinTouchEvent): void {
    if (this.active) event.preventDefault?.();
    if (this.multiTouchBlocked) {
      if (event.touches.length === 0) this.multiTouchBlocked = false;
      this.cancel();
      return;
    }

    const start = this.start;
    if (!start) return;
    const end = event.changedTouches.find(touch => touch.identifier === start.identifier) ?? this.latest;
    this.cancel();
    if (!end || !this.active) return;
    const dx = end.clientX - start.clientX;
    const dy = end.clientY - start.clientY;
    if (Math.hypot(dx, dy) < 22) {
      this.onTap?.(end.clientX, end.clientY);
      return;
    }
    this.onDirection(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up'));
  }
}
