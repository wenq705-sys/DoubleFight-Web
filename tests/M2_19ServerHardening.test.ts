import { mkdtemp, mkdir, rename, rm, writeFile } from 'node:fs/promises';
import { createHmac } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as filesystem from 'node:fs/promises';
import { JsonAccountRepository } from '../server/auth/AccountRepository';
import { OfficialDouyinProvider } from '../server/auth/DouyinProvider';
import { SessionToken } from '../server/auth/SessionToken';
import { productionReadiness, validateProductionEnvironment } from '../server/ops/Readiness';

const folders: string[] = [];
const env = { DOUYIN_APP_ID: 'fixture-app', DOUYIN_APP_SECRET: 'fixture-secret', DOUBLEFIGHT_SESSION_SECRET: 'fixture-signing-key-over-thirty-two-bytes' };
async function fixture() {
  const folder = await mkdtemp(join(tmpdir(), 'm219-server-'));
  folders.push(folder);
  const file = join(folder, 'new-data', 'accounts.json');
  return { file, folder, repo: await JsonAccountRepository.open(file) };
}
afterEach(async () => { await Promise.all(folders.splice(0).map(folder => rm(folder, { recursive: true, force: true }))); });

describe('M2.19 server regression coverage', () => {
  it.skipIf(process.platform === 'win32')('retains the committed ledger after directory sync fails', async () => {
    const { file, repo } = await fixture();
    const { account } = await repo.findOrCreate('sync-owner');
    const originalOpen = filesystem.open;
    const spy = vi.spyOn(filesystem, 'open').mockImplementation(async (...args) => {
      const handle = await originalOpen(...args);
      if (args[0] === join(file, '..')) vi.spyOn(handle, 'sync').mockRejectedValue(new Error('sync failure'));
      return handle;
    });
    try { await expect(repo.claimAd(account.id, 'daily_s_coin', 'sync-claim')).rejects.toThrow(); }
    finally { spy.mockRestore(); }
    expect((await repo.claimAd(account.id, 'daily_s_coin', 'sync-claim')).granted).toBe(false);
    const reopened = await JsonAccountRepository.open(file);
    expect((await reopened.claimAd(account.id, 'daily_s_coin', 'sync-claim')).granted).toBe(false);
  });
  it('initializes a fresh store and reports persistence failure and recovery truthfully', async () => {
    const { file, repo } = await fixture();
    const { account } = await repo.findOrCreate('owner');
    const dependencies = { databaseReady: () => repo.checkReady(), providerReady: () => true, shuttingDown: () => false };
    const directory = join(file, '..');
    expect((await productionReadiness(env, directory, 6, dependencies)).ready).toBe(true);
    await rename(file, file + '.saved');
    await mkdir(file);
    expect((await productionReadiness(env, directory, 6, dependencies)).ready).toBe(false);
    await expect(repo.claimAd(account.id, 'daily_s_coin', 'recovery-claim')).rejects.toThrow();
    await rm(file, { recursive: true });
    await rename(file + '.saved', file);
    expect((await repo.claimAd(account.id, 'daily_s_coin', 'recovery-claim')).granted).toBe(true);
    expect((await productionReadiness(env, directory, 6, dependencies)).ready).toBe(true);
    const reopened = await JsonAccountRepository.open(file);
    expect((await reopened.claimAd(account.id, 'daily_s_coin', 'recovery-claim')).granted).toBe(false);
    expect((await productionReadiness(env, directory, 6, { ...dependencies, shuttingDown: () => true })).ready).toBe(false);
    expect((await productionReadiness(env, directory, 6, { ...dependencies, providerReady: () => false })).ready).toBe(false);
  });

  it('never replaces a logged-in owner via a shared anonymous identifier', async () => {
    const { repo } = await fixture();
    const first = (await repo.findOrCreate('owner-one', undefined, 'shared-device')).account;
    const second = (await repo.findOrCreate('owner-two', undefined, 'shared-device')).account;
    expect(second.id).not.toBe(first.id);
    expect((await repo.findById(first.id))?.douyinOpenId).toBe('owner-one');
    const anonymous = (await repo.findOrCreate('anonymous:shared-device', undefined, 'shared-device')).account;
    expect(anonymous.id).not.toBe(first.id);
    expect(anonymous.id).not.toBe(second.id);
    expect((await repo.findOrCreate('owner-two', undefined, 'shared-device')).account.id).toBe(second.id);
  });

  it('returns detached snapshots and rejects inherited theme definitions without corrupting balances', async () => {
    const { repo } = await fixture();
    const { account } = await repo.findOrCreate('owner');
    account.economy.balance = 999999;
    expect((await repo.findById(account.id))?.economy.balance).toBe(0);
    const snapshot = (await repo.findById(account.id))!;
    snapshot.themes.owned.push('palace');
    expect((await repo.findById(account.id))?.themes.owned).not.toContain('palace');
    for (const theme of ['constructor', '__proto__', 'toString']) {
      await expect(repo.unlockTheme(account.id, theme, 'request-0001')).rejects.toThrow('invalid_theme_request');
    }
    expect((await repo.findById(account.id))?.economy.balance).toBe(0);
  });

  it('fails closed on corrupt and future-version stores without overwriting them', async () => {
    const { file } = await fixture();
    await writeFile(file, '{broken');
    await expect(JsonAccountRepository.open(file)).rejects.toThrow();
    await writeFile(file, JSON.stringify({ version: 3, accounts: [] }));
    await expect(JsonAccountRepository.open(file)).rejects.toThrow('unsupported account data format');
  });

  it('tracks provider outage and recovery without exposing upstream data', async () => {
    let mode = 0;
    const provider = new OfficialDouyinProvider('fixture-app', 'fixture-secret', async () => {
      if (mode === 0) throw new Error('private-upstream-error');
      return new Response(JSON.stringify(mode === 1 ? { err_no: 40018 } : { err_no: 0, data: { openid: 'owner' } }));
    });
    await expect(provider.exchange({ code: 'code' })).rejects.toMatchObject({ category: 'unavailable' });
    expect(provider.isReady()).toBe(false);
    mode = 1;
    await expect(provider.exchange({ code: 'code' })).rejects.toMatchObject({ category: 'invalid_code' });
    expect(provider.isReady()).toBe(true);
    mode = 2;
    expect(await provider.exchange({ code: 'code' })).toEqual({ openid: 'owner' });
  });

  it('rejects blank signing keys and invalid rotation configuration', () => {
    expect(validateProductionEnvironment({ ...env, DOUBLEFIGHT_SESSION_SECRET: ' '.repeat(40) }).sessionSigningConfigured).toBe(false);
    expect(() => new SessionToken(' '.repeat(40)).issue('owner')).toThrow();
    expect(() => new SessionToken(env.DOUBLEFIGHT_SESSION_SECRET, 'short').assertConfigured()).toThrow();
  });

  it('rejects bearer tokens signed with a blank previous key', () => {
    const blankPrevious = ' '.repeat(40);
    const sessions = new SessionToken(env.DOUBLEFIGHT_SESSION_SECRET, blankPrevious);
    const currentToken = sessions.issue('owner').token;
    const payload = currentToken.split('.')[0];
    const signature = createHmac('sha256', blankPrevious).update(payload).digest('base64url');
    expect(sessions.verify(`${payload}.${signature}`)).toBeNull();
    expect(sessions.verify(currentToken)).toBe('owner');
  });
});
