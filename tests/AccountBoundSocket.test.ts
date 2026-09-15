import { spawn, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import WebSocket from 'ws';
import { describe, expect, it } from 'vitest';
import { JsonAccountRepository } from '../server/auth/AccountRepository';
import { SessionToken } from '../server/auth/SessionToken';

const secret = 'integration-only-session-signing-key-with-32-bytes';
const loadout = ['random_clear', 'shield', 'petrify'];

async function freePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = (server.address() as { port: number }).port;
  await new Promise<void>(resolve => server.close(() => resolve()));
  return port;
}

async function runServer(configured = false) {
  const folder = await mkdtemp(join(tmpdir(), 'doublefight-socket-account-'));
  const repository = await JsonAccountRepository.open(join(folder, 'accounts.json'));
  const account = (await repository.findOrCreate('fake-provider-openid')).account;
  const token = new SessionToken(secret).issue(account.id).token;
  const port = await freePort();
  const child: ChildProcess = spawn(process.execPath, ['--import', 'tsx', 'server/index.ts'], {
    cwd: process.cwd(),
    env: { ...process.env, HOST: '127.0.0.1', PORT: String(port), DOUBLEFIGHT_DATA_DIR: folder,
      DOUBLEFIGHT_SESSION_SECRET: secret, DOUYIN_APP_ID: configured ? 'ttmockappid' : '',
      DOUYIN_APP_SECRET: configured ? 'mock-only-provider-secret' : '' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  child.stdout?.on('data', chunk => { output += String(chunk); });
  child.stderr?.on('data', chunk => { output += String(chunk); });
  const base = `http://127.0.0.1:${port}`;
  let ready = false;
  for (let index = 0; index < 80; index += 1) {
    if (child.exitCode !== null) break;
    try { if ((await fetch(`${base}/health`)).ok) { ready = true; break; } } catch { /* booting */ }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  if (!ready) { child.kill(); throw new Error(`local server did not start: ${output}`); }
  return { base, folder, account, token, child, close: async () => {
    child.kill();
    await Promise.race([once(child, 'exit').catch(() => undefined), new Promise(resolve => setTimeout(resolve, 3000))]);
    await rm(folder, { recursive: true, force: true });
  } };
}

async function connect(base: string, bearer?: string) {
  const socket = new WebSocket(base.replace('http:', 'ws:') + '/ws', bearer ? { headers: { Authorization: `Bearer ${bearer}` } } : undefined);
  const messages: Record<string, any>[] = [];
  socket.on('message', raw => messages.push(JSON.parse(String(raw))));
  await once(socket, 'open');
  const wait = async (type: string) => {
    for (let index = 0; index < 100; index += 1) {
      const position = messages.findIndex(message => message.type === type);
      if (position >= 0) return messages.splice(position, 1)[0];
      await new Promise(resolve => setTimeout(resolve, 30));
    }
    throw new Error(`missing ${type}: ${JSON.stringify(messages)}`);
  };
  expect((await wait('welcome')).protocolVersion).toBe(6);
  return { socket, messages, wait, send: (message: object) => socket.send(JSON.stringify(message)) };
}

describe('real WebSocket account handshake without Protocol v6 changes', () => {
  it('keeps /health compatible while /ready signals production auth status safely', async () => {
    for (const configured of [false, true]) {
      const server = await runServer(configured);
      try {
        const health = await fetch(server.base + '/health');
        expect(health.status).toBe(200);
        expect((await health.json()).ok).toBe(true);
        const response = await fetch(server.base + '/ready');
        expect(response.status).toBe(configured ? 200 : 503);
        const readiness = await response.json();
        expect(readiness).toEqual({ ready: configured, authConfigured: configured,
          sessionSigningConfigured: true, dataDirectoryWritable: true, protocolVersion: 6 });
        expect(response.headers.get('cache-control')).toBe('no-store');
        expect(JSON.stringify(readiness)).not.toContain('mock-only-provider-secret');
        expect((await fetch(server.base + '/ready?operator=1')).status).toBe(configured ? 200 : 503);
        expect((await fetch(server.base + '/ready', { method: 'POST' })).status).toBe(405);
      } finally { await server.close(); }
    }
  });
  it('preserves account identity through quick matchmaking with a guest', async () => {
    const server = await runServer();
    const sockets: WebSocket[] = [];
    try {
      const account = await connect(server.base, server.token);
      const guest = await connect(server.base);
      sockets.push(account.socket, guest.socket);
      account.send({ type: 'join_matchmaking', playerName: 'Forged Match Name', theme: 'kingdom', loadout });
      expect((await account.wait('matchmaking_state')).state.status).toBe('searching');
      guest.send({ type: 'join_matchmaking', playerName: 'Real Guest', theme: 'palace', loadout });
      const joined = await account.wait('room_joined');
      expect(joined.room.players.map((player: { name: string }) => player.name)).toEqual([server.account.profile.displayName, 'Real Guest']);
      expect((await guest.wait('room_joined')).room.code).toBe(joined.room.code);
      expect((await account.wait('match_start')).snapshot.players[0].name).toBe(server.account.profile.displayName);
    } finally {
      sockets.forEach(socket => socket.close());
      await server.close();
    }
  });
  it('binds a valid header, blocks a spoofed name, and leaves guest/browser sockets working', async () => {
    const server = await runServer();
    const sockets: WebSocket[] = [];
    try {
      const authenticated = await connect(server.base, server.token);
      sockets.push(authenticated.socket);
      authenticated.send({ type: 'create_room', playerName: 'Forged Name', theme: 'kingdom', loadout });
      const joined = await authenticated.wait('room_joined');
      expect(joined.room.players[0].name).toBe(server.account.profile.displayName);
      expect(JSON.stringify(joined)).not.toContain(server.token);

      const browserGuest = await connect(server.base);
      sockets.push(browserGuest.socket);
      browserGuest.send({ type: 'join_room', roomCode: joined.room.code, playerName: 'Browser Guest', theme: 'palace', loadout });
      expect((await browserGuest.wait('room_joined')).room.players[1].name).toBe('Browser Guest');
      authenticated.send({ type: 'set_ready', ready: true });
      browserGuest.send({ type: 'set_ready', ready: true });
      await authenticated.wait('match_start');
      browserGuest.send({ type: 'leave_room' });
      expect((await authenticated.wait('match_end')).snapshot.result.reason).toBe('opponent_left');

      let wins = 0;
      for (let index = 0; index < 40; index += 1) {
        const me = await fetch(server.base + '/me', { headers: { Authorization: `Bearer ${server.token}` } });
        wins = (await me.json()).player.pvp.wins;
        if (wins === 1) break;
        await new Promise(resolve => setTimeout(resolve, 25));
      }
      expect(wins).toBe(1);

      const invalid = await connect(server.base, 'invalid.token');
      sockets.push(invalid.socket);
      invalid.send({ type: 'create_room', playerName: 'Guest Spoof', theme: 'kingdom', loadout });
      expect((await invalid.wait('room_joined')).room.players[0].name).toBe('Guest Spoof');
    } finally {
      sockets.forEach(socket => socket.close());
      await server.close();
    }
  });

  it('requires the same account on authenticated reconnect and retains room identity', async () => {
    const server = await runServer();
    const sockets: WebSocket[] = [];
    try {
      const first = await connect(server.base, server.token);
      sockets.push(first.socket);
      first.send({ type: 'create_room', playerName: 'Forged', theme: 'kingdom', loadout });
      const joined = await first.wait('room_joined');
      first.socket.close();
      await once(first.socket, 'close');

      const wrong = await connect(server.base, 'invalid.token');
      sockets.push(wrong.socket);
      wrong.send({ type: 'reconnect', roomCode: joined.room.code, reconnectToken: joined.reconnectToken });
      expect((await wrong.wait('error')).code).toBe('INVALID_RECONNECT');

      const restored = await connect(server.base, server.token);
      sockets.push(restored.socket);
      restored.send({ type: 'reconnect', roomCode: joined.room.code, reconnectToken: joined.reconnectToken });
      const resumed = await restored.wait('room_joined');
      expect(resumed.playerId).toBe(joined.playerId);
      expect(resumed.room.players[0].name).toBe(server.account.profile.displayName);
    } finally {
      sockets.forEach(socket => socket.close());
      await server.close();
    }
  });
});
