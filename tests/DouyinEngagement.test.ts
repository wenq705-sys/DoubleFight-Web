import { describe, expect, it, vi } from 'vitest';
import { DouyinEngagement } from '../platform/douyin/src/engagement';

describe('Douyin retention client services', () => {
  it('adds a shortcut only through the explicit adapter call and handles cancellation', async () => {
    const addShortcut = vi.fn((options: any) => options.success?.({ errMsg: 'addShortcut:ok' }));
    const service = new DouyinEngagement({ addShortcut });
    expect(await service.addShortcutFromTap()).toBe('added');
    expect(addShortcut).toHaveBeenCalledOnce();

    const cancelled = new DouyinEngagement({ addShortcut: options => options.fail?.({ errMsg: 'user cancel', errNo: 21305 }) });
    expect(await cancelled.addShortcutFromTap()).toBe('cancelled');
  });

  it('deduplicates and caps subscription templates at three', async () => {
    const requestSubscribeMessage = vi.fn((options: any) => options.success?.({ errMsg: 'requestSubscribeMessage:ok' }));
    const service = new DouyinEngagement({ requestSubscribeMessage });
    await service.requestSubscriptionFromTap([' MSG1 ', 'MSG1', 'MSG2', 'MSG3', 'MSG4']);
    expect(requestSubscribeMessage.mock.calls[0]?.[0].tmplIds).toEqual(['MSG1', 'MSG2', 'MSG3']);
  });

  it('reports sanitized analytics without blocking gameplay', () => {
    const reportAnalytics = vi.fn();
    const service = new DouyinEngagement({ reportAnalytics });
    service.track('piece_discovered', { theme: 'palace', tier: 7, name: '贵妃' });
    expect(reportAnalytics).toHaveBeenCalledWith('piece_discovered', { theme: 'palace', tier: 7, name: '贵妃' });

    const broken = new DouyinEngagement({ reportAnalytics: () => { throw new Error('host unavailable'); } });
    expect(() => broken.track('solo_start')).not.toThrow();
  });
});
