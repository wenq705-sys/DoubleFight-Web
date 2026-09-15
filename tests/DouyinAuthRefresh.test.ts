import { describe, expect, it, vi } from 'vitest';
import { DouyinAuthClient } from '../platform/douyin/src/auth';
import type { StorageAdapter } from '../src/platform/types';

function storageFixture(): StorageAdapter {
  const values = new Map<string, string>();
  return {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => { values.set(key, value); },
    removeItem: key => { values.delete(key); },
  };
}

const player = (rating: number) => ({
  id: 'p1',
  displayName: '玩家P1',
  solo: { bestKingdom: 10, highestKingdom: 8, bestPalace: 20, highestPalace: 16 },
  pvp: { wins: 1, losses: 0, draws: 0, rating },
  rewards: { currency: 12 },
});

describe('DouyinAuthClient authoritative refresh', () => {
  it('pulls the latest profile after a match without forcing a new login', async () => {
    const storage = storageFixture();
    let latestRating = 1000;
    const request = vi.fn((options: any) => {
      if (options.url.endsWith('/auth/douyin')) {
        options.success({ statusCode: 200, data: { token: 'abc.def', player: player(1000) } });
        return;
      }
      if (options.url.endsWith('/me')) {
        options.success({ statusCode: 200, data: { player: player(latestRating) } });
        return;
      }
      options.fail?.({ errMsg: 'unexpected request' });
    });
    const platform = {
      storage,
      account: {
        bootstrap: vi.fn(async () => ({ status: 'anonymous' as const, isLoggedIn: false as const, anonymousCode: 'anon1234' })),
        reset: vi.fn(),
      },
    };

    const auth = new DouyinAuthClient({ request }, platform, 'https://game.example.test');
    const started = await auth.start();
    expect(started.status).toBe('authenticated');
    if (started.status === 'authenticated') expect(started.player.pvp.rating).toBe(1000);

    latestRating = 1024;
    const refreshed = await auth.refresh();
    expect(refreshed.status).toBe('authenticated');
    if (refreshed.status === 'authenticated') expect(refreshed.player.pvp.rating).toBe(1024);
    expect(platform.account.bootstrap).toHaveBeenCalledOnce();
  });
});
