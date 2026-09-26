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
    const dailyLogin = vi.fn();
    const unsubscribeDailyLogin = auth.subscribeDailyLoginGrant(dailyLogin);
    const started = await auth.start();
    expect(started.status).toBe('authenticated');
    if (started.status === 'authenticated') expect(started.player.pvp.rating).toBe(1000);

    latestRating = 1024;
    const refreshed = await auth.refresh();
    expect(refreshed.status).toBe('authenticated');
    if (refreshed.status === 'authenticated') expect(refreshed.player.pvp.rating).toBe(1024);
    expect(platform.account.bootstrap).toHaveBeenCalledOnce();
  });

  it('reauthenticates automatically when foreground refresh finds an expired session', async () => {
    const storage = storageFixture();
    let authCalls = 0;
    const request = vi.fn((options: any) => {
      if (options.url.endsWith('/auth/douyin')) {
        authCalls += 1;
        options.success({
          statusCode: 200,
          data: { token: `token.${authCalls}`, player: player(1000 + authCalls) },
        });
        return;
      }
      if (options.url.endsWith('/me')) {
        options.success({ statusCode: 401, data: { error: 'unauthorized' } });
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
    expect((await auth.start()).status).toBe('authenticated');
    const refreshed = await auth.refresh();
    expect(refreshed.status).toBe('authenticated');
    if (refreshed.status === 'authenticated') expect(refreshed.player.pvp.rating).toBe(1002);
    expect(authCalls).toBe(2);
    expect(platform.account.bootstrap).toHaveBeenCalledTimes(2);
    expect(platform.account.reset).toHaveBeenCalled();
  });

  it('consumes authoritative daily S Coin and official PvP leaderboard contracts', async () => {
    const storage = storageFixture();
    const additivePlayer = {
      ...player(1012),
      rewards: {
        currency: 15,
        daily: {
          day: '2026-09-16',
          loginClaimed: true,
          adClaimed: false,
          tasks: { solo: false, pvp: false, ad: false },
          streak: 2,
        },
      },
      season: {
        seasonId: 's18-2026-09-10',
        rating: 1036,
        wins: 2,
        losses: 1,
        draws: 0,
        matches: 3,
        endsAt: Date.parse('2026-09-24T00:00:00Z'),
      },
      themes: { owned: ['kingdom', 'palace'], adUnlockProgress: { zodiac: 1 }, adViewsToday: 1, adDailyRemaining: 1 },
    };
    const requests: any[] = [];
    const request = vi.fn((options: any) => {
      requests.push(options);
      if (options.url.endsWith('/auth/douyin')) {
        options.success({
          statusCode: 200,
          data: {
            token: 'abc.def',
            player: additivePlayer,
            dailyLogin: { granted: true, amount: 15, streakAmount: 30 },
          },
        });
        return;
      }
      if (options.url.endsWith('/rewards/ad')) {
        options.success({
          statusCode: 200,
          data: {
            granted: true,
            reward: 'daily_s_coin',
            amount: 30,
            taskAmount: 5,
            player: {
              ...additivePlayer,
              rewards: {
                ...additivePlayer.rewards,
                currency: 50,
                daily: { ...additivePlayer.rewards.daily, adClaimed: true, tasks: { solo: false, pvp: false, ad: true } },
              },
            },
          },
        });
        return;
      }
      if (options.url.includes('/leaderboards/pvp?limit=50')) {
        options.success({
          statusCode: 200,
          data: {
            season: { id: 's18-2026-09-10', startsAt: 1, endsAt: 2 },
            entries: [{ rank: 1, displayName: '玩家P1', rating: 1036, wins: 2, losses: 1, draws: 0, matches: 3 }],
          },
        });
        return;
      }
      if (options.url.endsWith('/themes')) {
        options.success({
          statusCode: 200,
          data: {
            themes: [{ id: 'kingdom', free: true, cost: 0, adViews: 0 }, { id: 'palace', free: false, cost: 100, adViews: 1 }],
            player: additivePlayer,
          },
        });
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
    const dailyLogin = vi.fn();
    const unsubscribeDailyLogin = auth.subscribeDailyLoginGrant(dailyLogin);
    const started = await auth.start();
    expect(started.status).toBe('authenticated');
    if (started.status === 'authenticated') {
      expect(started.player.season?.rating).toBe(1036);
      expect(started.player.rewards.daily?.streak).toBe(2);
    }
    expect(dailyLogin).toHaveBeenCalledWith({ amount: 15, streakAmount: 30 });
    expect(auth.consumeDailyLoginGrant()).toEqual({ amount: 15, streakAmount: 30 });
    expect(auth.consumeDailyLoginGrant()).toBeNull();
    unsubscribeDailyLogin();

    await expect(auth.claimDailySCoinDetailed('daily-claim-1234')).resolves.toEqual({
      status: 'granted',
      amount: 30,
      taskAmount: 5,
    });
    expect(auth.current.status).toBe('authenticated');
    if (auth.current.status === 'authenticated') {
      expect(auth.current.player.rewards.currency).toBe(50);
      expect(auth.current.player.rewards.daily?.adClaimed).toBe(true);
    }
    const adRequest = requests.find(value => value.url.endsWith('/rewards/ad'));
    expect(adRequest?.data).toEqual({ kind: 'daily_s_coin', claimId: 'daily-claim-1234' });

    const board = await auth.fetchPvpLeaderboard(99);
    expect(board?.entries[0]?.rating).toBe(1036);
    expect(requests.some(value => value.url.endsWith('/leaderboards/pvp?limit=50'))).toBe(true);

    const themes = await auth.fetchThemes();
    expect(themes?.map(value => value.id)).toEqual(['kingdom', 'palace']);
  });
});
