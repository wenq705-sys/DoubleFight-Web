import { randomInt, randomUUID } from 'node:crypto';
import {
  PROTOCOL_VERSION,
  type ClientMessage,
  type NetworkThemeId,
  type ServerMessage,
} from '../shared/index';
import { RoomSession, type RoomPlayerRecord } from './RoomSession';

type ErrorCode = Extract<ServerMessage, { type: 'error' }>['code'];

export interface ConnectionTransport {
  id: string;
  send(message: ServerMessage): void;
}

interface Membership {
  roomCode: string;
  playerId: string;
}

export class RoomManager {
  private readonly rooms = new Map<string, RoomSession>();
  private readonly connections = new Map<string, ConnectionTransport>();
  private readonly memberships = new Map<string, Membership>();
  private readonly disconnectTimers = new Map<string, ReturnType<typeof setTimeout>>();

  register(send: (message: ServerMessage) => void): ConnectionTransport {
    const connection: ConnectionTransport = { id: randomUUID(), send };
    this.connections.set(connection.id, connection);
    connection.send({
      type: 'welcome',
      connectionId: connection.id,
      protocolVersion: PROTOCOL_VERSION,
    });
    return connection;
  }

  unregister(connectionId: string): void {
    this.connections.delete(connectionId);
    const membership = this.memberships.get(connectionId);
    this.memberships.delete(connectionId);
    if (!membership) return;

    const room = this.rooms.get(membership.roomCode);
    if (!room) return;

    room.disconnect(membership.playerId);
    room.broadcast({ type: 'room_state', room: room.state() });

    const key = this.timerKey(membership.roomCode, membership.playerId);
    const previous = this.disconnectTimers.get(key);
    if (previous) clearTimeout(previous);

    const timer = setTimeout(() => {
      this.disconnectTimers.delete(key);
      const currentRoom = this.rooms.get(membership.roomCode);
      const player = currentRoom?.players.get(membership.playerId);
      if (!currentRoom || !player || player.connected) return;

      currentRoom.removePlayer(membership.playerId);
      if (currentRoom.isEmpty()) {
        this.rooms.delete(currentRoom.code);
        return;
      }

      currentRoom.broadcast({ type: 'room_state', room: currentRoom.state() });
      if (currentRoom.phase === 'finished' && currentRoom.matchId) {
        currentRoom.broadcast({ type: 'match_end', snapshot: currentRoom.matchSnapshot() });
      }
    }, 30_000);
    this.disconnectTimers.set(key, timer);
  }

  handle(connectionId: string, message: ClientMessage): void {
    const connection = this.connections.get(connectionId);
    if (!connection) return;

    try {
      switch (message.type) {
        case 'hello':
          if (message.protocolVersion !== PROTOCOL_VERSION) {
            this.error(connectionId, 'PROTOCOL_MISMATCH', `客户端协议 ${message.protocolVersion} 与服务器 ${PROTOCOL_VERSION} 不一致。`);
          }
          return;
        case 'create_room':
          this.createRoom(connectionId, message.playerName, message.theme);
          return;
        case 'join_room':
          this.joinRoom(connectionId, message.roomCode, message.playerName, message.theme);
          return;
        case 'reconnect':
          this.reconnect(connectionId, message.roomCode, message.reconnectToken);
          return;
        case 'set_theme':
          this.withRoom(connectionId, (room, player) => {
            room.setTheme(player.id, message.theme);
            room.broadcast({ type: 'room_state', room: room.state() });
          });
          return;
        case 'set_ready':
          this.withRoom(connectionId, (room, player) => {
            const started = room.setReady(player.id, message.ready);
            room.broadcast({ type: 'room_state', room: room.state() });
            if (started) room.broadcast({ type: 'match_start', snapshot: room.matchSnapshot() });
          });
          return;
        case 'move':
          this.withRoom(connectionId, (room, player) => {
            const { result } = room.move(player.id, message.direction, message.sequence);
            room.sendTo(player.id, {
              type: 'move_ack',
              playerId: player.id,
              sequence: message.sequence,
              result,
              board: player.board!.publicState(),
            });
            if (room.phase === 'finished') {
              room.broadcast({ type: 'match_end', snapshot: room.matchSnapshot() });
            } else {
              room.broadcast({ type: 'match_state', snapshot: room.matchSnapshot() });
            }
          });
          return;
        case 'leave_room':
          this.leaveRoom(connectionId);
          return;
        case 'ping':
          connection.send({ type: 'pong', sentAt: message.sentAt, serverAt: Date.now() });
          return;
      }
    } catch (error) {
      const code = error instanceof Error ? error.message : 'BAD_MESSAGE';
      this.mapError(connectionId, code);
    }
  }

  stats(): { rooms: number; connections: number; playing: number } {
    return {
      rooms: this.rooms.size,
      connections: this.connections.size,
      playing: [...this.rooms.values()].filter((room) => room.phase === 'playing').length,
    };
  }

  private createRoom(connectionId: string, playerName: string, theme: NetworkThemeId): void {
    this.leaveRoom(connectionId);
    const code = this.generateRoomCode();
    const room = new RoomSession(code, (target, message) => this.send(target, message));
    const host = room.addPlayer(connectionId, playerName, theme);

    this.rooms.set(code, room);
    this.memberships.set(connectionId, { roomCode: code, playerId: host.id });
    this.sendJoined(connectionId, room, host);
  }

  private joinRoom(connectionId: string, roomCode: string, playerName: string, theme: NetworkThemeId): void {
    this.leaveRoom(connectionId);
    const code = normalizeRoomCode(roomCode);
    const room = this.rooms.get(code);
    if (!room) throw new Error('ROOM_NOT_FOUND');
    const player = room.addPlayer(connectionId, playerName, theme);
    this.memberships.set(connectionId, { roomCode: code, playerId: player.id });
    this.sendJoined(connectionId, room, player);
    room.broadcast({ type: 'room_state', room: room.state() });
  }

  private reconnect(connectionId: string, roomCode: string, reconnectToken: string): void {
    this.leaveRoom(connectionId);
    const code = normalizeRoomCode(roomCode);
    const room = this.rooms.get(code);
    if (!room) throw new Error('ROOM_NOT_FOUND');
    const player = room.reconnect(connectionId, reconnectToken);
    if (!player) throw new Error('INVALID_RECONNECT');

    this.memberships.set(connectionId, { roomCode: code, playerId: player.id });
    const timerKey = this.timerKey(code, player.id);
    const timer = this.disconnectTimers.get(timerKey);
    if (timer) clearTimeout(timer);
    this.disconnectTimers.delete(timerKey);

    this.sendJoined(connectionId, room, player);
    room.broadcast({ type: 'room_state', room: room.state() });
    if (room.matchId && room.phase !== 'lobby') {
      this.send(connectionId, { type: 'match_state', snapshot: room.matchSnapshot() });
    }
  }

  private leaveRoom(connectionId: string): void {
    const membership = this.memberships.get(connectionId);
    if (!membership) return;
    this.memberships.delete(connectionId);

    const room = this.rooms.get(membership.roomCode);
    if (!room) return;

    const timerKey = this.timerKey(room.code, membership.playerId);
    const timer = this.disconnectTimers.get(timerKey);
    if (timer) clearTimeout(timer);
    this.disconnectTimers.delete(timerKey);

    room.removePlayer(membership.playerId);
    if (room.isEmpty()) {
      this.rooms.delete(room.code);
      return;
    }

    room.broadcast({ type: 'room_state', room: room.state() });
    if (room.phase === 'finished' && room.matchId) {
      room.broadcast({ type: 'match_end', snapshot: room.matchSnapshot() });
    }
  }

  private withRoom(
    connectionId: string,
    action: (room: RoomSession, player: RoomPlayerRecord) => void,
  ): void {
    const membership = this.memberships.get(connectionId);
    if (!membership) throw new Error('NOT_IN_ROOM');
    const room = this.rooms.get(membership.roomCode);
    const player = room?.players.get(membership.playerId);
    if (!room || !player) throw new Error('NOT_IN_ROOM');
    action(room, player);
  }

  private sendJoined(connectionId: string, room: RoomSession, player: RoomPlayerRecord): void {
    this.send(connectionId, {
      type: 'room_joined',
      playerId: player.id,
      reconnectToken: player.reconnectToken,
      room: room.state(),
    });
  }

  private send(connectionId: string, message: ServerMessage): void {
    this.connections.get(connectionId)?.send(message);
  }

  private error(connectionId: string, code: ErrorCode, message: string): void {
    this.send(connectionId, { type: 'error', code, message });
  }

  private mapError(connectionId: string, code: string): void {
    const known: Record<string, ErrorCode> = {
      ROOM_NOT_FOUND: 'ROOM_NOT_FOUND',
      ROOM_FULL: 'ROOM_FULL',
      ROOM_ALREADY_PLAYING: 'ROOM_ALREADY_PLAYING',
      NOT_IN_ROOM: 'NOT_IN_ROOM',
      NOT_PLAYING: 'NOT_PLAYING',
      NOT_READY: 'NOT_READY',
      INVALID_RECONNECT: 'INVALID_RECONNECT',
      STALE_SEQUENCE: 'STALE_SEQUENCE',
    };
    const mapped = known[code] ?? 'BAD_MESSAGE';
    this.error(connectionId, mapped, errorMessage(mapped));
  }

  private generateRoomCode(): string {
    for (let attempt = 0; attempt < 50; attempt += 1) {
      const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
      if (!this.rooms.has(code)) return code;
    }
    throw new Error('BAD_MESSAGE');
  }

  private timerKey(roomCode: string, playerId: string): string {
    return `${roomCode}:${playerId}`;
  }
}

function normalizeRoomCode(value: string): string {
  return value.replace(/\D/g, '').slice(0, 6);
}

function errorMessage(code: ErrorCode): string {
  const messages: Record<typeof code, string> = {
    BAD_MESSAGE: '请求格式不正确。',
    PROTOCOL_MISMATCH: '客户端与服务器版本不一致，请刷新游戏。',
    ROOM_NOT_FOUND: '房间不存在或已经关闭。',
    ROOM_FULL: '房间已经有两名玩家。',
    ROOM_ALREADY_PLAYING: '该房间已经开始比赛。',
    NOT_IN_ROOM: '当前连接不在房间中。',
    NOT_PLAYING: '比赛尚未开始。',
    NOT_READY: '玩家尚未准备。',
    INVALID_RECONNECT: '重连凭证无效。',
    STALE_SEQUENCE: '该操作序号已经处理过。',
  };
  return messages[code];
}
