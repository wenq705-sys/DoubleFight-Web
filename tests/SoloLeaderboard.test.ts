import { createServer, type Server } from 'node:http';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { RELEASE_THEME_IDS, type ReleaseThemeId } from '../shared/index';
import { JsonAccountRepository, MAX_SOLO_ASCENSION_MS, type SoloLeaderboardKind, type PlayerAccount } from '../server/auth/AccountRepository';
import { createAuthHandler } from '../server/auth/AuthHttp';
import { SessionToken } from '../server/auth/SessionToken';

const folders: string[] = [];
const servers: Server[] = [];
afterEach(async () => {
  await Promise.all(servers.splice(0).map(server => new Promise<void>((resolve, reject) => {
    server.close(error => error ? reject(error) : resolve());
    server.closeAllConnections();
  })));
  await Promise.all(folders.splice(0).map(folder => rm(folder, { recursive: true, force: true })));
});
async function fixture() {
  const folder = await mkdtemp(join(tmpdir(), 'solo-leaderboard-'));
  folders.push(folder);
  const file = join(folder, 'accounts.json');
  return { file, repo: await JsonAccountRepository.open(file) };
}

it('reads old v1/v2 JSON and preserves optional timings through migration and reopen', async () => {
  const { file, repo } = await fixture();
  const { account } = await repo.findOrCreate('legacy');
  for (const version of [1, 2]) {
    const legacy = structuredClone(account);
    legacy.solo.bestKingdom = 42;
    await writeFile(file, JSON.stringify({ version, accounts: [legacy] }));
    const reopened = await JsonAccountRepository.open(file);
    expect((await reopened.findById(account.id))?.soloByTheme.kingdom).toEqual({ best: 42, highest: 2 });
    expect((await reopened.soloLeaderboard('kingdom', 'ascension')).entries).toEqual([]);
    for (const theme of RELEASE_THEME_IDS) {
      await reopened.mergeSoloProgress(account.id, theme, 100, 2048, undefined, 5000);
    }
    const saved = await JsonAccountRepository.open(file);
    for (const theme of RELEASE_THEME_IDS) {
      expect((await saved.findById(account.id))?.soloByTheme[theme].bestAscensionMs).toBe(5000);
    }
  }
});

it('serializes MAX scores/tiers and MIN timings, including old-client writes', async () => {
  const { repo } = await fixture();
  const { account } = await repo.findOrCreate('merge');
  await Promise.all([
    repo.mergeSoloProgress(account.id, 'kingdom', 100, 2048, undefined, 5000),
    repo.mergeSoloProgress(account.id, 'kingdom', 200, 32, undefined, 3000),
    repo.mergeSoloProgress(account.id, 'kingdom', 50, 64, undefined, 7000),
    repo.mergeSoloProgress(account.id, 'kingdom', 300, 16),
  ]);
  expect((await repo.findById(account.id))?.soloByTheme.kingdom).toEqual({ best: 300, highest: 2048, bestAscensionMs: 3000 });
  for (const invalid of [0, -1, 1.5, NaN, Infinity, MAX_SOLO_ASCENSION_MS + 1]) {
    await expect(repo.mergeSoloProgress(account.id, 'kingdom', 999, 4096, undefined, invalid)).rejects.toThrow('invalid_progress');
  }
  expect((await repo.findById(account.id))?.soloByTheme.kingdom.best).toBe(300);
});

it('sorts both kinds, breaks ties deterministically, filters invalid entries and caps at 50', async () => {
  const { file, repo } = await fixture();
  const { account } = await repo.findOrCreate('seed');
  const accounts: PlayerAccount[] = Array.from({ length: 55 }, (_, i) => ({
    ...structuredClone(account), id: `id-${String(i).padStart(2, '0')}`, createdAt: i < 2 ? 0 : i,
    profile: { displayName: `name-${i}`, ...(i === 0 ? { avatarUrl: 'https://example.com/avatar.png' } : {}) },
    soloByTheme: { ...account.soloByTheme, zodiac: { best: i < 2 ? 1000 : i, highest: 2048, bestAscensionMs: i < 2 ? 100 : 1000 + i } },
  }));
  accounts.push({ ...structuredClone(account), id: 'empty', createdAt: 0, profile: { displayName: 'empty' } });
  accounts.push({ ...structuredClone(accounts[2]), id: 'invalid', soloByTheme: { zodiac: { best: 0, highest: 2, bestAscensionMs: -1 } } });
  await writeFile(file, JSON.stringify({ version: 2, accounts: accounts.reverse() }));
  const loaded = await JsonAccountRepository.open(file);
  for (const kind of ['score', 'ascension'] as const) {
    const rows = (await loaded.soloLeaderboard('zodiac', kind, 100)).entries;
    expect(rows).toHaveLength(50);
    expect(rows.slice(0, 2).map(row => row.displayName)).toEqual(['name-0', 'name-1']);
    expect(rows[0]).toEqual({ rank: 1, displayName: 'name-0', avatarUrl: 'https://example.com/avatar.png', theme: 'zodiac', kind, value: kind === 'score' ? 1000 : 100 });
    expect(rows[2].value).toBe(kind === 'score' ? 54 : 1002);
    expect(rows[49].rank).toBe(50);
    expect((await loaded.soloLeaderboard('zodiac', kind, 1)).entries).toEqual(rows.slice(0, 1));
  }
  expect((await loaded.soloLeaderboard('candy', 'score')).entries).toEqual([]);
  await expect(loaded.soloLeaderboard('unknown' as ReleaseThemeId, 'score')).rejects.toThrow();
  await expect(loaded.soloLeaderboard('kingdom', 'other' as SoloLeaderboardKind)).rejects.toThrow();
  await expect(loaded.soloLeaderboard('kingdom', 'score', NaN)).rejects.toThrow();
});

it('serves public boards and validates progress and query parameters without breaking old clients', async () => {
  const { repo, file } = await fixture();
  const { account } = await repo.findOrCreate('http');
  const sessions = new SessionToken('test-secret-with-at-least-thirty-two-bytes');
  const handler = createAuthHandler({ repository: repo, sessions, provider: { exchange: async () => ({ openid: 'unused' }) }, log: () => {} });
  const server = createServer((req, res) => { void handler(req, res); });
  servers.push(server);
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address() as { port: number };
  const base = `http://127.0.0.1:${address.port}`;
  const token = sessions.issue(account.id).token;
  const post = (body: object, authorized = true) => fetch(`${base}/progress/solo`, { method: 'POST', headers: { 'content-type': 'application/json', ...(authorized ? { authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) });
  const progress = { theme: 'kingdom', best: 100, highest: 2048 };
  expect((await post(progress, false)).status).toBe(401);
  expect((await post(progress)).status).toBe(200);
  for (const invalid of [null, '100', true, 0, -1, 1.5, MAX_SOLO_ASCENSION_MS + 1, Number.MAX_SAFE_INTEGER, [], {}]) {
    const response = await post({ ...progress, bestAscensionMs: invalid });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'invalid_progress' });
  }
  for (const duration of [MAX_SOLO_ASCENSION_MS, 1]) expect((await post({ ...progress, bestAscensionMs: duration })).status).toBe(200);
  expect((await post(progress)).status).toBe(200);
  expect((await post({ ...progress, theme: 'candy', bestAscensionMs: 50 })).status).toBe(403);
  for (const kind of ['score', 'ascension']) {
    const response = await fetch(`${base}/leaderboards/solo?theme=kingdom&kind=${kind}&limit=50`);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ entries: [{ rank: 1, displayName: account.profile.displayName, theme: 'kingdom', kind, value: kind === 'score' ? 100 : 1 }] });
  }
  for (const theme of RELEASE_THEME_IDS) expect((await fetch(`${base}/leaderboards/solo?theme=${theme}&kind=score`)).status).toBe(200);
  for (const query of ['kind=score', 'theme=unknown&kind=score', 'theme=kingdom', 'theme=kingdom&kind=other', ...['', '0', '51', '-1', '1.5', 'abc'].map(limit => `theme=kingdom&kind=score&limit=${limit}`)]) {
    expect((await fetch(`${base}/leaderboards/solo?${query}`)).status).toBe(400);
  }
  expect((await fetch(`${base}/leaderboards/solo`, { method: 'POST' })).status).toBe(405);
  expect((await fetch(`${base}/leaderboards/solo`, { method: 'OPTIONS' })).status).toBe(204);
  expect(JSON.parse(await readFile(file, 'utf8')).accounts[0].soloByTheme.kingdom.bestAscensionMs).toBe(1);
});

