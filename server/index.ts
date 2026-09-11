import { createServer } from 'node:http';
import process from 'node:process';
import { WebSocket, WebSocketServer } from 'ws';
import {
  PROTOCOL_VERSION,
  parseClientMessage,
  type ServerMessage,
} from '../shared/index';
import { RoomManager } from './RoomManager';

const port = readPort(process.env.PORT, 8787);
const host = process.env.HOST?.trim() || '0.0.0.0';
const manager = new RoomManager();

const httpServer = createServer((request, response) => {
  if (request.url === '/health' || request.url === '/healthz') {
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

websocketServer.on('connection', (socket) => {
  alive.set(socket, true);

  const connection = manager.register((message) => {
    send(socket, message);
  });

  socket.on('pong', () => alive.set(socket, true));

  socket.on('message', (data, isBinary) => {
    if (isBinary) {
      send(socket, {
        type: 'error',
        code: 'BAD_MESSAGE',
        message: '服务器仅接受 JSON 文本消息。',
      });
      return;
    }

    const raw = data.toString('utf8');
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
  });

  socket.on('close', () => manager.unregister(connection.id));
  socket.on('error', (error) => {
    console.warn('[ws] connection error', connection.id, error.message);
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
