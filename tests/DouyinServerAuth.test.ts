import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { JsonAccountRepository, MAX_RECENT_AD_CLAIMS, MAX_RECENT_MATCHES } from '../server/auth/AccountRepository';
import { createAuthHandler } from '../server/auth/AuthHttp';
import { OfficialDouyinProvider, ProviderError, type DouyinProvider } from '../server/auth/DouyinProvider';
import { SessionToken } from '../server/auth/SessionToken';

const secret = 'local-test-secret-with-at-least-thirty-two-bytes';
const folders: string[] = [];
afterEach(async () => {
  await Promise.all(folders.splice(0).map(folder => rm(folder, { recursive: true, force: true })));
});

async function repo() {
  const folder = await mkdtemp(join(tmpdir(), 'doublefight-auth-'));
  folders.push(folder);
  return { folder, repository: await JsonAccountRepository.open(join(folder, 'accounts.json')) };
}

describe('Douyin code2Session provider', () => {
  it('normalizes provider identity and never exposes session_key', async () => {
    const request = vi.fn(async (_url: string | URL | Request, _options?: RequestInit) => new Response(JSON.stringify({
      err_no: 0, data: { openid: 'provider-openid', unionid: 'provider-union', anonymous_openid: 'anon', session_key: 'private-key' },
    }), { status: 200 }));
    const provider = new OfficialDouyinProvider('app-id', 'server-secret', request);
    const identity = await provider.exchange({ code: 'one-time-code', anonymousCode: 'anon-code' });
    expect(identity).toEqual({ openid: 'provider-openid', unionid: 'provider-union', anonymousOpenid: 'anon' });
    expect(JSON.stringify(identity)).not.toContain('private-key');
    const options = request.mock.calls[0]?.[1] as RequestInit;
    expect(JSON.parse(String(options.body))).toEqual({ appid: 'app-id', secret: 'server-secret', code: 'one-time-code', anonymous_code: 'anon-code' });
  });

  it('maps provider code errors without leaking raw response or credentials', async () => {
    const provider = new OfficialDouyinProvider('app', 'secret', async () => new Response(JSON.stringify({ err_no: 40018, err_tips: 'private raw payload' })));
    await expect(provider.exchange({ code: 'bad-code' })).rejects.toMatchObject({ category: 'invalid_code' });
    await expect(new OfficialDouyinProvider(undefined, undefined).exchange({ code: 'x' })).rejects.toMatchObject({ category: 'configuration' });
  });
});

describe('durable accounts and reward ledger', () => {
  it('creates one stable account, persists it, and excludes provider identity from public state', async () => {
    const { folder, repository } = await repo();
    const first = await repository.findOrCreate('private-openid', 'private-unionid');
    const again = await repository.findOrCreate('private-openid');
    expect(first.created).toBe(true);
    expect(again.created).toBe(false);
    expect(again.account.id).toBe(first.account.id);
    const reopened = await JsonAccountRepository.open(join(folder, 'accounts.json'));
    expect((await reopened.findById(first.account.id))?.douyinOpenId).toBe('private-openid');
  });

  it('promotes an anonymous account instead of splitting progression after login', async () => {
    const { repository } = await repo();
    const anonymous = await repository.findOrCreate('anonymous:anon-openid', undefined, 'anon-openid');
    const promoted = await repository.findOrCreate('real-openid', 'real-union', 'anon-openid');
    expect(promoted.created).toBe(false);
    expect(promoted.account.id).toBe(anonymous.account.id);
    expect(promoted.account.douyinOpenId).toBe('real-openid');
    expect(promoted.account.unionId).toBe('real-union');
    expect(promoted.account.anonymousOpenId).toBe('anon-openid');
  });

  it('serializes concurrent sidebar/ad claims and survives reopening', async () => {
    const { folder, repository } = await repo();
    const { account } = await repository.findOrCreate('player-1');
    const sidebar = await Promise.all(Array.from({ length: 6 }, () => repository.claimSidebar(account.id, '2026-09-15')));
    expect(sidebar.filter(result => result.granted)).toHaveLength(1);
    expect((await repository.claimSidebar(account.id, '2026-09-16')).granted).toBe(true);
    const ads = await Promise.all(Array.from({ length: 5 }, () => repository.claimAd(account.id, 'solo_skill_refill', 'claim-12345678')));
    expect(ads.filter(result => result.granted)).toHaveLength(1);
    const reopened = await JsonAccountRepository.open(join(folder, 'accounts.json'));
    expect((await reopened.claimAd(account.id, 'solo_skill_refill', 'claim-12345678')).granted).toBe(false);
    expect((await reopened.findById(account.id))?.rewards.currency).toBe(0);
  });

  it('keeps recent ad replay protection while bounding the ledger after reopen', async () => {
    const { folder, repository } = await repo();
    const { account } = await repository.findOrCreate('ad-player');
    for (let index = 0; index < MAX_RECENT_AD_CLAIMS + 30; index += 1) {
      expect((await repository.claimAd(account.id, 'solo_skill_refill', `ad-claim-${index + 100000}`)).granted).toBe(true);
    }
    expect((await repository.findById(account.id))?.adClaims).toHaveLength(MAX_RECENT_AD_CLAIMS);
    const reopened = await JsonAccountRepository.open(join(folder, 'accounts.json'));
    expect((await reopened.claimAd(account.id, 'solo_skill_refill', `ad-claim-${MAX_RECENT_AD_CLAIMS + 29 + 100000}`)).granted).toBe(false);
    expect((await reopened.findById(account.id))?.adClaims).toHaveLength(MAX_RECENT_AD_CLAIMS);
  });

  it('max-merges Solo progress per theme across repository reopen', async () => {
    const { folder, repository } = await repo();
    const { account } = await repository.findOrCreate('solo-player');
    await repository.mergeSoloProgress(account.id, 'kingdom', 640, 64);
    await repository.mergeSoloProgress(account.id, 'kingdom', 100, 16);
    await repository.mergeSoloProgress(account.id, 'palace', 250, 32);
    const reopened = await JsonAccountRepository.open(join(folder, 'accounts.json'));
    expect((await reopened.findById(account.id))?.solo).toEqual({
      bestKingdom: 640, highestKingdom: 64, bestPalace: 250, highestPalace: 32,
    });
  });

  it('records authoritative win/loss/draw once per match and rematch independently', async () => {
    const { folder, repository } = await repo();
    const a = (await repository.findOrCreate('pvp-a')).account;
    const b = (await repository.findOrCreate('pvp-b')).account;
    const players = [{ playerId: 'room-a', accountId: a.id }, { playerId: 'room-b', accountId: b.id }];
    expect(await repository.recordMatch({ matchId: 'first-match', reason: 'board_locked', winnerId: 'room-a', players })).toBe(true);
    expect(await repository.recordMatch({ matchId: 'first-match', reason: 'board_locked', winnerId: 'room-a', players })).toBe(false);
    expect(await repository.recordMatch({ matchId: 'second-rematch', reason: 'petrified_lock', winnerId: 'room-b', players })).toBe(true);
    expect(await repository.recordMatch({ matchId: 'third-draw', reason: 'time_limit', winnerId: null, players })).toBe(true);
    const reopened = await JsonAccountRepository.open(join(folder, 'accounts.json'));
    expect(await reopened.recordMatch({ matchId: 'second-rematch', reason: 'petrified_lock', winnerId: 'room-b', players })).toBe(false);
    expect((await reopened.findById(a.id))?.pvp).toMatchObject({ wins: 1, losses: 1, draws: 1 });
    expect((await reopened.findById(b.id))?.pvp).toMatchObject({ wins: 1, losses: 1, draws: 1 });
    expect((await reopened.findById(a.id))!.pvp.rating + (await reopened.findById(b.id))!.pvp.rating).toBe(2000);
  });

  it('covers all authoritative end reasons, mixed guest outcomes and bounded match replay', async () => {
    const { folder, repository } = await repo();
    const account = (await repository.findOrCreate('mixed-player')).account;
    const players = [{ playerId: 'auth-player', accountId: account.id }, { playerId: 'guest-player' }];
    for (const reason of ['opponent_left', 'board_locked', 'petrified_lock', 'time_limit']) {
      expect(await repository.recordMatch({ matchId: `${reason}-match`, reason: reason as 'opponent_left' | 'board_locked' | 'petrified_lock' | 'time_limit', winnerId: 'auth-player', players })).toBe(true);
    }
    expect((await repository.findById(account.id))?.pvp.wins).toBe(4);
    for (let index = 0; index < MAX_RECENT_MATCHES + 10; index += 1) {
      await repository.recordMatch({ matchId: `bounded-${index}`, reason: 'time_limit', winnerId: null, players });
    }
    const stored = JSON.parse(await readFile(join(folder, 'accounts.json'), 'utf8')) as { processedMatches: string[] };
    expect(stored.processedMatches).toHaveLength(MAX_RECENT_MATCHES);
    expect(await repository.recordMatch({ matchId: `bounded-${MAX_RECENT_MATCHES + 9}`, reason: 'time_limit', winnerId: null, players })).toBe(false);
  });
});

describe('Double Fight session', () => {
  it('signs, expires, rejects tampering and supports one previous rotation key', () => {
    const current = new SessionToken(secret);
    const { token, expiresAt } = current.issue('account-1', 1000);
    expect(current.verify(token, 1000)).toBe('account-1');
    expect(current.verify(token, expiresAt)).toBeNull();
    expect(current.verify(`${token.slice(0, -1)}x`, 1000)).toBeNull();
    expect(new SessionToken('new-rotation-key-with-at-least-thirty-two-bytes', secret).verify(token, 1000)).toBe('account-1');
    expect(new SessionToken(undefined).verify(token, 1000)).toBeNull();
  });
});

async function fixture(override?: { provider?: DouyinProvider; sessionSecret?: string }) {
  const { repository } = await repo();
  const exchange = vi.fn(async () => ({ openid: 'private-provider-id', unionid: 'private-union-id' }));
  const provider = override?.provider ?? { exchange };
  const logs: Record<string, string | boolean>[] = [];
  const handler = createAuthHandler({
    repository, provider, sessions: new SessionToken(override?.sessionSecret ?? secret),
    now: () => Date.parse('2026-09-15T11:00:00Z'), log: event => logs.push(event),
  });
  const server = createServer((request, response) => { void handler(request, response); });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  return { base, exchange, logs, close: () => new Promise<void>(resolve => server.close(() => resolve())) };
}

async function post(base: string, path: string, body: object, token?: string) {
  return fetch(base + path, { method: 'POST', headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) });
}

describe('account HTTP endpoints', () => {
  it('validates auth, reuses identity, returns only public state, and rejects missing/tampered/expired sessions', async () => {
    const site = await fixture();
    try {
      expect((await post(site.base, '/auth/douyin', {})).status).toBe(400);
      const response = await post(site.base, '/auth/douyin', { code: 'temporary-code' });
      expect(response.status).toBe(200);
      const data = await response.json() as { token: string; player: { id: string } };
      expect(JSON.stringify(data)).not.toMatch(/private-provider|private-union|session_key/);
      expect((await post(site.base, '/auth/douyin', { code: 'new-temporary-code' })).status).toBe(200);
      const denied = await fetch(site.base + '/me');
      expect(denied.status).toBe(401);
      expect((await fetch(site.base + '/me', { headers: { authorization: 'Bearer bad.token' } })).status).toBe(401);
      const me = await fetch(site.base + '/me', { headers: { authorization: `Bearer ${data.token}` } });
      expect((await me.json()).player.id).toBe(data.player.id);
      expect(site.logs).toContainEqual({ event: 'auth_success', account: 'reused' });
      expect(JSON.stringify(site.logs)).not.toContain('temporary-code');
    } finally { await site.close(); }
  });

  it('requires bearer and grants sidebar/ad once; rejects unknown reward kinds', async () => {
    const site = await fixture();
    try {
      const auth = await (await post(site.base, '/auth/douyin', { code: 'temporary-code' })).json() as { token: string };
      expect((await post(site.base, '/rewards/sidebar', { source: 'sidebar_return' })).status).toBe(401);
      expect((await post(site.base, '/rewards/sidebar', {}, auth.token)).status).toBe(400);
      expect((await (await post(site.base, '/rewards/sidebar', { source: 'sidebar_return' }, auth.token)).json()).granted).toBe(true);
      expect((await (await post(site.base, '/rewards/sidebar', { source: 'sidebar_return' }, auth.token)).json()).granted).toBe(false);
      expect((await post(site.base, '/rewards/ad', { kind: 'currency', claimId: 'unique-123456' }, auth.token)).status).toBe(400);
      expect((await (await post(site.base, '/rewards/ad', { kind: 'solo_skill_refill', claimId: 'unique-123456' }, auth.token)).json()).granted).toBe(true);
      expect((await (await post(site.base, '/rewards/ad', { kind: 'solo_skill_refill', claimId: 'unique-123456' }, auth.token)).json()).granted).toBe(false);
    } finally { await site.close(); }
  });

  it('requires bearer for Solo progress and rejects malformed or extreme values', async () => {
    const site = await fixture();
    try {
      const auth = await (await post(site.base, '/auth/douyin', { code: 'temporary-code' })).json() as { token: string };
      expect((await post(site.base, '/progress/solo', { theme: 'kingdom', best: 1, highest: 2 })).status).toBe(401);
      const invalid = [
        { theme: 'third', best: 100, highest: 32 },
        { theme: 'kingdom', best: -1, highest: 32 },
        { theme: 'kingdom', best: 1.5, highest: 32 },
        { theme: 'kingdom', best: 100, highest: 3 },
        { theme: 'kingdom', best: 100, highest: 2_097_152 },
        { theme: 'kingdom', best: 100_000_001, highest: 32 },
      ];
      for (const body of invalid) expect((await post(site.base, '/progress/solo', body, auth.token)).status).toBe(400);
      const first = await (await post(site.base, '/progress/solo', { theme: 'kingdom', best: 640, highest: 64 }, auth.token)).json();
      expect(first.player.solo.bestKingdom).toBe(640);
      const lower = await (await post(site.base, '/progress/solo', { theme: 'kingdom', best: 100, highest: 16 }, auth.token)).json();
      expect(lower.player.solo).toMatchObject({ bestKingdom: 640, highestKingdom: 64, bestPalace: 0 });
    } finally { await site.close(); }
  });

  it('fails closed on missing server secrets and does not exchange code', async () => {
    const provider: DouyinProvider = { exchange: vi.fn(async () => { throw new ProviderError('configuration'); }) };
    const site = await fixture({ provider });
    try {
      const result = await post(site.base, '/auth/douyin', { code: 'temporary-code' });
      expect(result.status).toBe(503);
      expect((await result.json()).error).toBe('configuration');
    } finally { await site.close(); }

    const missingSigningKey: DouyinProvider = { exchange: vi.fn(async () => ({ openid: 'should-not-run' })) };
    const closed = await fixture({ provider: missingSigningKey, sessionSecret: '' });
    try {
      expect((await post(closed.base, '/auth/douyin', { code: 'temporary-code' })).status).toBe(503);
      expect(missingSigningKey.exchange).not.toHaveBeenCalled();
    } finally { await closed.close(); }
  });
});
