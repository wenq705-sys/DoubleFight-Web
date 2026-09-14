import type { LifecycleAdapter } from '../types';

export interface FrameScheduler { request(callback: () => void): number; cancel(handle: number): void }

/** Lifecycle owns visibility; this owns at most one pending frame. */
export class DouyinRenderLoop {
  private frame: number | null = null;
  private running = false;
  private unsubscribe: () => void;
  constructor(lifecycle: LifecycleAdapter, private readonly scheduler: FrameScheduler, private readonly render: () => void,
    private readonly onResume: () => void, private readonly onSuspend: () => void) {
    this.unsubscribe = lifecycle.subscribe(() => this.show(), () => this.hide());
    if (lifecycle.visible) this.show();
  }
  show(): void { if (this.running) return; this.running = true; this.onResume(); this.queue(); }
  hide(): void { if (!this.running) return; this.running = false; if (this.frame !== null) this.scheduler.cancel(this.frame); this.frame = null; this.onSuspend(); }
  dispose(): void { this.hide(); this.unsubscribe(); }
  private queue(): void {
    if (!this.running || this.frame !== null) return;
    this.frame = this.scheduler.request(() => { this.frame = null; if (!this.running) return; this.render(); this.queue(); });
  }
}
