import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { dataDirectoryWritable, productionReadiness, validateProductionEnvironment } from '../server/ops/Readiness';
import { DOUYIN_PRODUCT_CONFIG } from '../platform/douyin/src/config';

const folders: string[] = [];
afterEach(async () => { await Promise.all(folders.splice(0).map(folder => rm(folder, { recursive: true, force: true }))); });

describe('safe production readiness', () => {
  it('does not break Browser health when auth is missing and returns booleans only', async () => {
    const folder = await mkdtemp(join(tmpdir(), 'doublefight-ready-'));
    folders.push(folder);
    const status = await productionReadiness({}, folder, 6);
    expect(status).toEqual({ ready: false, authConfigured: false, sessionSigningConfigured: false, dataDirectoryWritable: true, protocolVersion: 6 });
    expect(JSON.stringify(status)).not.toContain(folder);
  });

  it('requires both provider variables and current/previous signing keys of 32 bytes', async () => {
    const folder = await mkdtemp(join(tmpdir(), 'doublefight-ready-'));
    folders.push(folder);
    const env = { DOUYIN_APP_ID: 'ttmock', DOUYIN_APP_SECRET: 'mock-only-app-secret',
      DOUBLEFIGHT_SESSION_SECRET: 'mock-only-signing-key-over-32-bytes',
      DOUBLEFIGHT_SESSION_SECRET_PREVIOUS: 'short' };
    expect(validateProductionEnvironment(env).sessionSigningConfigured).toBe(false);
    env.DOUBLEFIGHT_SESSION_SECRET_PREVIOUS = 'mock-only-previous-key-over-32-bytes';
    const status = await productionReadiness(env, folder, 6);
    expect(status.ready).toBe(true);
    expect(JSON.stringify(status)).not.toContain(env.DOUBLEFIGHT_SESSION_SECRET);
    expect(JSON.stringify(status)).not.toContain(env.DOUYIN_APP_SECRET);
  });

  it('detects a missing directory or a file instead of a writable volume', async () => {
    const folder = await mkdtemp(join(tmpdir(), 'doublefight-ready-'));
    folders.push(folder);
    const file = join(folder, 'not-a-directory');
    await writeFile(file, 'fixture');
    expect(await dataDirectoryWritable(join(folder, 'missing'))).toBe(false);
    expect(await dataDirectoryWritable(file)).toBe(false);
  });

  it('proxies all M2.12 HTTP surfaces through the production Nginx config', async () => {
    const nginx = await readFile('ops/doublefight-tls.conf', 'utf8');
    for (const route of ['themes(/unlock)?', 'season/current', 'leaderboards/pvp']) {
      expect(nginx).toContain(route);
    }
  });

  it('runs the operator env check with safe status output and fails on app ID drift', () => {
    const providerSecret = 'mock-only-provider-secret';
    const signingKey = 'mock-only-signing-key-over-32-bytes';
    const check = (appId: string) => spawnSync(process.execPath, ['--import', 'tsx', 'scripts/check-production-env.ts'], {
      cwd: process.cwd(), encoding: 'utf8', env: { ...process.env, DOUYIN_APP_ID: appId,
        DOUYIN_APP_SECRET: providerSecret, DOUBLEFIGHT_SESSION_SECRET: signingKey,
        DOUBLEFIGHT_SESSION_SECRET_PREVIOUS: '' },
    });
    const valid = check(DOUYIN_PRODUCT_CONFIG.appId);
    expect(valid.status).toBe(0);
    expect(JSON.parse(valid.stdout)).toEqual({ authConfigured: true, sessionSigningConfigured: true, appIdMatchesRelease: true });
    expect(valid.stdout + valid.stderr).not.toContain(providerSecret);
    expect(valid.stdout + valid.stderr).not.toContain(signingKey);
    const drifted = check('ttwrongappid');
    expect(drifted.status).toBe(1);
    expect(JSON.parse(drifted.stdout).appIdMatchesRelease).toBe(false);
  });
});
