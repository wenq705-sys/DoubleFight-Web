import type { DouyinApi } from './api';

export interface LoopScheduler { request(callback: () => void): number; cancel(handle: number): void }

/** One registered lifecycle pair and at most one pending animation frame. */
export class DouyinLifecycle {
  private visible = false;
  private frame: number | null = null;
  readonly log: string[] = [];
  constructor(
    api: DouyinApi,
    private readonly scheduler: LoopScheduler,
    private readonly render: () => void,
    private readonly onResume: () => void,
    private readonly onSuspend: () => void,
  ) {
    api.onShow(() => this.show());
    api.onHide(() => this.hide());
  }
  show(): void {
    if (this.visible) return;
    this.visible = true;
    this.log.push('show');
    console.log('[M2.9 lifecycle] show');
    this.onResume();
    this.queue();
  }
  hide(): void {
    if (!this.visible) return;
    this.visible = false;
    if (this.frame !== null) this.scheduler.cancel(this.frame);
    this.frame = null;
    this.onSuspend();
    this.log.push('hide');
    console.log('[M2.9 lifecycle] hide');
  }
  private queue(): void {
    if (!this.visible || this.frame !== null) return;
    this.frame = this.scheduler.request(() => {
      this.frame = null;
      if (!this.visible) return;
      this.render();
      this.queue();
    });
  }
}
