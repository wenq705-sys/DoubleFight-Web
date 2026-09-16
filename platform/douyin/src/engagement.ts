import type { DouyinApi } from './api';

export type AnalyticsValue = string | number | boolean;

export class DouyinEngagement {
  constructor(private readonly api: Pick<DouyinApi, 'addShortcut' | 'checkShortcut' | 'requestSubscribeMessage' | 'reportAnalytics'>) {}

  /** Must be called synchronously from the user's touch handler. */
  addShortcutFromTap(): Promise<'added' | 'cancelled' | 'unavailable'> {
    if (!this.api.addShortcut) return Promise.resolve('unavailable');
    return new Promise(resolve => {
      try {
        this.api.addShortcut?.({
          success: () => resolve('added'),
          fail: error => resolve(/cancel/i.test(error.errMsg ?? '') || error.errNo === 21305 ? 'cancelled' : 'unavailable'),
        });
      } catch { resolve('unavailable'); }
    });
  }

  checkShortcut(): Promise<boolean | null> {
    if (!this.api.checkShortcut) return Promise.resolve(null);
    return new Promise(resolve => {
      try {
        this.api.checkShortcut?.({
          success: result => resolve(Boolean(result.status?.exist)),
          fail: () => resolve(null),
        });
      } catch { resolve(null); }
    });
  }

  /** Must be called synchronously from the user's touch handler. */
  requestSubscriptionFromTap(templateIds: readonly string[]): Promise<Record<string, unknown> | null> {
    const ids = [...new Set(templateIds.map(value => value.trim()).filter(Boolean))].slice(0, 3);
    if (!this.api.requestSubscribeMessage || ids.length === 0) return Promise.resolve(null);
    return new Promise(resolve => {
      try {
        this.api.requestSubscribeMessage?.({
          tmplIds: ids,
          success: result => resolve(result),
          fail: () => resolve(null),
        });
      } catch { resolve(null); }
    });
  }

  track(event: string, data: Record<string, AnalyticsValue> = {}): void {
    const safeEvent = event.trim().slice(0, 110);
    if (!safeEvent || !this.api.reportAnalytics) return;
    const clean: Record<string, AnalyticsValue> = {};
    for (const [key, value] of Object.entries(data)) {
      if (!key || typeof value === 'undefined') continue;
      clean[key.slice(0, 64)] = typeof value === 'string' ? value.slice(0, 128) : value;
    }
    try { this.api.reportAnalytics(safeEvent, clean); } catch { /* analytics never blocks play */ }
  }
}
