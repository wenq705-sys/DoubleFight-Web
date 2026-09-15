import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { JsonAccountRepository } from '../server/auth/AccountRepository.ts';
import { createAuthHandler } from '../server/auth/AuthHttp.ts';
import { SessionToken } from '../server/auth/SessionToken.ts';

const folder = await mkdtemp(join(tmpdir(), 'doublefight-auth-smoke-'));
const repository = await JsonAccountRepository.open(join(folder, 'accounts.json'));
const handler = createAuthHandler({
  repository,
  provider: { exchange: async () => ({ openid: 'mock-provider-id' }) },
  sessions: new SessionToken('smoke-only-server-session-signing-key-123456'),
  log: () => {},
});
const server = createServer((request, response) => { void handler(request, response); });

try {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const post = (path, body, token) => fetch(base + path, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
  });
  const response = await post('/auth/douyin', { code: 'mock-temporary-code' });
  assert.equal(response.status, 200);
  const { token, player } = await response.json();
  assert.ok(token && player.id);
  const me = await fetch(base + '/me', { headers: { authorization: `Bearer ${token}` } });
  assert.equal(me.status, 200);
  assert.equal((await me.json()).player.id, player.id);
  assert.equal((await (await post('/rewards/sidebar', { source: 'sidebar_return' }, token)).json()).granted, true);
  assert.equal((await (await post('/rewards/sidebar', { source: 'sidebar_return' }, token)).json()).granted, false);
  assert.equal((await (await post('/rewards/ad', { kind: 'solo_skill_refill', claimId: 'smoke-claim-123' }, token)).json()).granted, true);
  assert.equal((await (await post('/rewards/ad', { kind: 'solo_skill_refill', claimId: 'smoke-claim-123' }, token)).json()).granted, false);
  console.log('PASS auth: mock code exchange, session, /me, sidebar/ad idempotency');
} finally {
  await new Promise(resolve => server.close(resolve));
  await rm(folder, { recursive: true, force: true });
}
