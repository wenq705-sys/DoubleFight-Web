import { describe, expect, it, vi } from 'vitest';
import { DouyinAuthClient } from '../platform/douyin/src/auth';
import type { DouyinApi } from '../platform/douyin/src/api';
import type { Platform } from '../src/platform/types';

const player = {
  id: 'doublefight-user', displayName: '玩家1234',
  solo: { bestKingdom: 0, highestKingdom: 2, bestPalace: 0, highestPalace: 2 },
  pvp: { wins: 0, losses: 0, draws: 0, rating: 1000 },
  rewards: { currency: 0 },
};

function fixture(storedToken?: string, requestBehavior?: (options: Parameters<NonNullable<DouyinApi['request']>>[0]) => void, onSessionToken = vi.fn()) {
  const values = new Map<string, string>(storedToken ? [['doublefight-session-token', storedToken]] : []);
  const bootstrap = vi.fn(async () => ({ status: 'logged_in' as const, isLoggedIn: true as const, code: 'one-use-code' }));
  const reset = vi.fn();
  const platform = {
    account: { bootstrap, reset },
    storage: {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => { values.set(key, value); },
      removeItem: (key: string) => { values.delete(key); },
    },
  } as Pick<Platform, 'account' | 'storage'>;
  const request = vi.fn((options: Parameters<NonNullable<DouyinApi['request']>>[0]) => {
    if (requestBehavior) requestBehavior(options);
    else if (options.url.endsWith('/auth/douyin')) options.success({ statusCode: 200, data: { token: 'signed.session', player } });
    else if (options.url.endsWith('/me')) options.success({ statusCode: 200, data: { player } });
    else options.success({ statusCode: 200, data: { granted: true, player } });
  });
  const client = new DouyinAuthClient({ request }, platform, 'https://game.example', onSessionToken);
  return { client, values, bootstrap, reset, request, onSessionToken };
}

describe('Douyin account session bootstrap', () => {
  it('exchanges one login code once and stores only the Double Fight token', async () => {
    const setup = fixture();
    const [first, second] = await Promise.all([setup.client.start(), setup.client.start()]);
    expect(first).toEqual({ status: 'authenticated', player });
    expect(second).toEqual(first);
    expect(setup.bootstrap).toHaveBeenCalledOnce();
    expect(setup.request).toHaveBeenCalledOnce();
    expect(setup.values.get('doublefight-session-token')).toBe('signed.session');
    expect(JSON.stringify([...setup.values])).not.toContain('one-use-code');
    expect(setup.request.mock.calls[0]?.[0].data).toEqual({ code: 'one-use-code' });
  });

  it('restores a valid session via /me without another tt.login', async () => {
    const setup = fixture('persisted.session');
    expect(await setup.client.start()).toEqual({ status: 'authenticated', player });
    expect(setup.bootstrap).not.toHaveBeenCalled();
    expect(setup.request.mock.calls[0]?.[0].header?.authorization).toBe('Bearer persisted.session');
  });

  it('falls back to local mode on provider failure without blocking the product', async () => {
    const setup = fixture(undefined, options => options.fail({ errMsg: 'offline' }));
    expect(await setup.client.start()).toEqual({ status: 'local' });
    expect(setup.values.size).toBe(0);
  });

  it('retries a transient auth request instead of pinning local mode forever', async () => {
    let authAttempts = 0;
    const setup = fixture(undefined, options => {
      if (options.url.endsWith('/auth/douyin')) {
        authAttempts += 1;
        if (authAttempts === 1) options.fail({ errMsg: 'temporary offline' });
        else options.success({ statusCode: 200, data: { token: 'recovered.session', player } });
      }
    });
    expect(await setup.client.start()).toEqual({ status: 'local' });
    expect(await setup.client.start()).toEqual({ status: 'authenticated', player });
    expect(authAttempts).toBe(2);
  });

  it('invalidates a consumed one-use login code after provider 401', async () => {
    const setup = fixture(undefined, options => {
      if (options.url.endsWith('/auth/douyin')) options.success({ statusCode: 401, data: { error: 'invalid_code' } });
    });
    expect(await setup.client.start()).toEqual({ status: 'local' });
    expect(setup.reset).toHaveBeenCalledOnce();
  });

  it('posts reward claims with bearer and never grants when the server rejects', async () => {
    const setup = fixture(undefined, options => {
      if (options.url.endsWith('/auth/douyin')) options.success({ statusCode: 200, data: { token: 'signed.session', player } });
      else options.success({ statusCode: 200, data: { granted: false, player } });
    });
    await setup.client.start();
    expect(await setup.client.claimAd('claim-12345678')).toBe('duplicate');
    expect(await setup.client.claimSidebar()).toBe('duplicate');
    expect(setup.request.mock.calls[1]?.[0].data).toEqual({ kind: 'solo_skill_refill', claimId: 'claim-12345678' });
    expect(setup.request.mock.calls[1]?.[0].header?.authorization).toBe('Bearer signed.session');
  });

  it('passes the restored session to socket setup and max-restores Solo cache from /me', async () => {
    const restored = { ...player, solo: { bestKingdom: 800, highestKingdom: 128, bestPalace: 70, highestPalace: 32 } };
    const setup = fixture('persisted.session', options => options.success({ statusCode: 200, data: { player: restored } }));
    setup.values.set('doublefight-best-kingdom', '900');
    setup.values.set('doublefight-highest-kingdom', '64');
    await setup.client.start();
    expect(setup.onSessionToken).toHaveBeenCalledWith('persisted.session');
    expect(setup.values.get('doublefight-best-kingdom')).toBe('900');
    expect(setup.values.get('doublefight-highest-kingdom')).toBe('128');
    expect(setup.values.get('doublefight-best-palace')).toBe('70');
    expect(setup.values.get('doublefight-highest-palace')).toBe('32');
  });

  it('clears an expired bearer after a protected endpoint returns 401 so the next action can re-authenticate', async () => {
    let authCount = 0;
    const setup = fixture(undefined, options => {
      if (options.url.endsWith('/auth/douyin')) {
        authCount += 1;
        options.success({ statusCode: 200, data: { token: authCount === 1 ? 'first.session' : 'second.session', player } });
      } else if (options.url.endsWith('/progress/solo') && authCount === 1) {
        options.success({ statusCode: 401, data: { error: 'unauthorized' } });
      } else if (options.url.endsWith('/progress/solo')) {
        options.success({ statusCode: 200, data: { player } });
      }
    });
    await setup.client.start();
    expect(await setup.client.syncSoloProgress('kingdom', 100, 16)).toBe(false);
    expect(setup.values.has('doublefight-session-token')).toBe(false);
    expect(setup.client.current.status).toBe('local');
    expect(setup.reset).toHaveBeenCalledOnce();

    expect(await setup.client.start()).toEqual({ status: 'authenticated', player });
    expect(setup.values.get('doublefight-session-token')).toBe('second.session');
  });

  it('syncs meaningful Solo progress with bearer without blocking when the network fails', async () => {
    const setup = fixture(undefined, options => {
      if (options.url.endsWith('/auth/douyin')) options.success({ statusCode: 200, data: { token: 'signed.session', player } });
      else if (options.url.endsWith('/progress/solo')) options.fail({ errMsg: 'offline' });
    });
    await setup.client.start();
    expect(await setup.client.syncSoloProgress('palace', 500, 64)).toBe(false);
    expect(setup.request.mock.calls[1]?.[0]).toMatchObject({ method: 'POST', data: { theme: 'palace', best: 500, highest: 64 }, header: { authorization: 'Bearer signed.session' } });
    expect(setup.client.current.status).toBe('authenticated');
  });
});
