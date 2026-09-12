import assert from 'node:assert/strict';
import { once } from 'node:events';
import WebSocket from 'ws';

// Exercises the real server protocol. Never logs reconnect credentials.
const endpoint = process.argv[2] || 'ws://127.0.0.1:8787/ws';
const healthUrl = new URL(endpoint);
healthUrl.protocol = healthUrl.protocol === 'wss:' ? 'https:' : 'http:';
healthUrl.pathname = '/health';
const sockets = [];
const deadline = setTimeout(() => { console.error('Online smoke timed out'); process.exit(1); }, 45_000);

async function connect() {
  const socket = new WebSocket(endpoint);
  sockets.push(socket);
  const messages = [];
  let failure;
  socket.on('message', raw => messages.push(JSON.parse(raw.toString())));
  socket.on('error', error => { failure = error; });
  const wait = async (type, predicate = () => true) => {
    const until = Date.now() + 10_000;
    while (Date.now() < until) {
      if (failure) throw failure;
      const error = messages.find(m => m.type === 'error');
      if (error) throw new Error(`Protocol error: ${error.code}`);
      const index = messages.findIndex(m => m.type === type && predicate(m));
      if (index >= 0) return messages.splice(index, 1)[0];
      await new Promise(resolve => setTimeout(resolve, 20));
    }
    throw new Error(`Timed out waiting for ${type}`);
  };
  await once(socket, 'open');
  const welcome = await wait('welcome');
  assert.equal(welcome.protocolVersion, 6);
  return { socket, wait, send: message => socket.send(JSON.stringify(message)) };
}

const defaultLoadout = ['random_clear', 'shield', 'petrify'];

async function runPair(mode) {
  const a = await connect();
  const b = await connect();
  let identity;
  if (mode === 'private') {
    a.send({ type: 'create_room', playerName: 'Ops A', theme: 'kingdom', loadout: defaultLoadout });
    identity = await a.wait('room_joined');
    b.send({ type: 'join_room', roomCode: identity.room.code, playerName: 'Ops B', theme: 'palace', loadout: ['shuffle', 'purify', 'petrify'] });
    await b.wait('room_joined');
    a.send({ type: 'set_ready', ready: true });
    b.send({ type: 'set_ready', ready: true });
  } else {
    a.send({ type: 'join_matchmaking', playerName: 'Ops A', theme: 'kingdom', loadout: defaultLoadout });
    await a.wait('matchmaking_state', m => m.state.status === 'searching');
    b.send({ type: 'join_matchmaking', playerName: 'Ops B', theme: 'palace', loadout: ['shuffle', 'purify', 'petrify'] });
    identity = await a.wait('room_joined');
    await b.wait('room_joined');
  }
  const start = (await a.wait('match_start')).snapshot;
  const other = (await b.wait('match_start')).snapshot;
  assert.equal(start.matchId, other.matchId);
  assert.equal(start.roundEndsAt - start.roundStartedAt, 180_000);
  assert.deepEqual(start.players.map(p => p.theme).sort(), ['kingdom', 'palace']);
  assert.equal(start.players.every(p => Array.isArray(p.loadout) && p.loadout.length === 3), true);
  a.send({ type: 'move', direction: 'left', sequence: 1 });
  await a.wait('move_ack', m => m.sequence === 1);
  const state = (await a.wait('match_state', m => m.snapshot.players.some(p => p.playerId === identity.playerId && p.lastSequence === 1))).snapshot;
  // A clean transport close exercises server identity restoration within grace.
  a.socket.close();
  await once(a.socket, 'close');
  const resumed = await connect();
  resumed.send({ type: 'reconnect', roomCode: identity.room.code, reconnectToken: identity.reconnectToken });
  const restoredIdentity = await resumed.wait('room_joined');
  const restored = (await resumed.wait('match_state')).snapshot;
  assert.equal(restoredIdentity.playerId, identity.playerId);
  assert.equal(restored.matchId, start.matchId);
  assert.equal(restored.roundEndsAt, start.roundEndsAt);
  assert.deepEqual(restored.players.find(p => p.playerId === identity.playerId).board, state.players.find(p => p.playerId === identity.playerId).board);
  assert.equal(restored.players.find(p => p.playerId === identity.playerId).lastSequence, 1);
  resumed.send({ type: 'move', direction: 'down', sequence: 2 });
  await resumed.wait('move_ack', m => m.sequence === 2);
  resumed.send({ type: 'leave_room' });
  b.send({ type: 'leave_room' });
  const sentAt = Date.now();
  resumed.send({ type: 'ping', sentAt });
  b.send({ type: 'ping', sentAt });
  await Promise.all([resumed.wait('pong', m => m.sentAt === sentAt), b.wait('pong', m => m.sentAt === sentAt)]);
  resumed.socket.close();
  b.socket.close();
  console.log(`PASS ${mode}: two players, move, reconnect identity/board/sequence/deadline`);
}

try {
  const response = await fetch(healthUrl, { signal: AbortSignal.timeout(10_000) });
  assert.equal(response.status, 200);
  const health = await response.json();
  assert.equal(health.ok, true);
  assert.equal(health.service, 'doublefight-game-server');
  console.log('PASS health and trusted transport');
  await runPair('quick');
  await runPair('private');
  console.log('Real phones and Wi-Fi/5G handover still require human validation.');
} finally {
  clearTimeout(deadline);
  for (const socket of sockets) socket.terminate();
}
