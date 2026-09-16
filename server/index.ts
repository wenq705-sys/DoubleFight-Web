import { createServer } from 'node:http';
import process from 'node:process';
import { join } from 'node:path';
import { WebSocket, WebSocketServer } from 'ws';
import {
  PROTOCOL_VERSION,
  parseClientMessage,
  type ServerMessage,
} from '../shared/index';
import { RoomManager, type ConnectionTransport } from './RoomManager';
import { JsonAccountRepository } from './auth/AccountRepository';
import { createAuthHandler } from './auth/AuthHttp';
import { OfficialDouyinProvider } from './auth/DouyinProvider';
import { SessionToken } from './auth/SessionToken';
import { resolveSocketIdentity } from './auth/SocketIdentity';
import { productionReadiness } from './ops/Readiness';

const port = readPort(process.env.PORT, 8787);
const host = process.env.HOST?.trim() || '0.0.0.0';
const dataDirectory = process.env.DOUBLEFIGHT_DATA_DIR || '.doublefight-data';
const accountRepository = await JsonAccountRepository.open(join(dataDirectory, 'accounts.json'));
const manager = new RoomManager(result => {
  void accountRepository.recordMatch(result).catch(() => {
    console.error(JSON.stringify({ area: 'account', event: 'match_record_failure' }));
  });
});
const sessions = new SessionToken(process.env.DOUBLEFIGHT_SESSION_SECRET, process.env.DOUBLEFIGHT_SESSION_SECRET_PREVIOUS);
const authHandler = createAuthHandler({
  repository: accountRepository,
  provider: new OfficialDouyinProvider(process.env.DOUYIN_APP_ID, process.env.DOUYIN_APP_SECRET),
  sessions,
});

const httpServer = createServer(async (request, response) => {
  if (await authHandler(request, response)) return;
  const path = request.url?.split('?')[0];
  if (path === '/ready') {
    response.setHeader('cache-control', 'no-store');
    response.setHeader('content-type', 'application/json; charset=utf-8');
    if (request.method !== 'GET') {
      response.writeHead(405).end(JSON.stringify({ error: 'method_not_allowed' }));
      return;
    }
    const status = await productionReadiness(process.env, dataDirectory, PROTOCOL_VERSION);
    response.writeHead(status.ready ? 200 : 503).end(JSON.stringify(status));
    return;
  }
  if (path === '/health' || path === '/healthz') {
    response.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
    response.end(JSON.stringify({
      ok: true,
      service: 'doublefight-game-server',
      protocolVersion: PROTOCOL_VERSION,
      uptimeSeconds: Math.floor(process.uptime()),
      ...manager.stats(),
    }));
    return;
  }

  response.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify({
    service: 'doublefight-game-server',
    websocket: '/ws',
    protocolVersion: PROTOCOL_VERSION,
  }));
});

const websocketServer = new WebSocketServer({
  server: httpServer,
  path: '/ws',
  maxPayload: 64 * 1024,
  perMessageDeflate: false,
});

const alive = new WeakMap<WebSocket, boolean>();

websocketServer.on('connection', (socket, request) => {
  alive.set(socket, true);
  let connection: ConnectionTransport | null = null;
  let closed = false;
  const buffered: Array<{ raw: string; isBinary: boolean }> = [];

  socket.on('pong', () => alive.set(socket, true));

  const handleMessage = (raw: string, isBinary: boolean) => {
    if (!connection) {
      if (buffered.length >= 32) { socket.close(1008, 'message limit'); return; }
      buffered.push({ raw, isBinary });
      return;
    }
    if (isBinary) {
      send(socket, {
        type: 'error',
        code: 'BAD_MESSAGE',
        message: '服务器仅接受 JSON 文本消息。',
      });
      return;
    }

    const message = parseClientMessage(raw);
    if (!message) {
      send(socket, {
        type: 'error',
        code: 'BAD_MESSAGE',
        message: '无法识别该联机消息。',
      });
      return;
    }
    manager.handle(connection.id, message);
  };
  socket.on('message', (data, isBinary) => handleMessage(data.toString('utf8'), isBinary));

  socket.on('close', () => { closed = true; if (connection) manager.unregister(connection.id); });
  socket.on('error', () => {
    console.warn(JSON.stringify({ area: 'ws', event: 'connection_error', connection: connection?.id ?? 'pending' }));
  });
  void resolveSocketIdentity(request.headers, sessions, accountRepository).then(identity => {
    if (closed || socket.readyState !== WebSocket.OPEN) return;
    connection = manager.register(message => send(socket, message), identity);
    for (const entry of buffered) handleMessage(entry.raw, entry.isBinary);
    buffered.length = 0;
  });
});

const heartbeat = setInterval(() => {
  for (const socket of websocketServer.clients) {
    if (alive.get(socket) === false) {
      socket.terminate();
      continue;
    }
    alive.set(socket, false);
    socket.ping();
  }
}, 15_000);
heartbeat.unref();

httpServer.listen(port, host, () => {
  console.log(`[doublefight] game server listening on http://${host}:${port}`);
  console.log(`[doublefight] websocket endpoint ws://${host}:${port}/ws`);
});

function send(socket: WebSocket, message: ServerMessage): void {
  if (socket.readyState !== WebSocket.OPEN) return;
  socket.send(JSON.stringify(message));
}

function readPort(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 && parsed <= 65_535 ? parsed : fallback;
}

function shutdown(signal: string): void {
  console.log(`[doublefight] received ${signal}; shutting down`);
  clearInterval(heartbeat);
  websocketServer.close(() => {
    httpServer.close(() => process.exit(0));
  });

  setTimeout(() => process.exit(1), 5_000).unref();
}

process.once('SIGINT', () => shutdown('SIGINT'));
process.once('SIGTERM', () => shutdown('SIGTERM'));
