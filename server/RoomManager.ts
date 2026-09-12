import { randomInt, randomUUID } from 'node:crypto';
import {
  PROTOCOL_VERSION,
  type ClientMessage,
  type NetworkThemeId,
  type ServerMessage,
  type SkillLoadout,
} from '../shared/index';
import { MatchmakingQueue } from './MatchmakingQueue';
import { RoomSession, type RoomPlayerRecord } from './RoomSession';

export const MATCHMAKING_TIMEOUT_MS = 60_000;

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
  private readonly matchTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly matchmaking = new MatchmakingQueue();
  private readonly matchmakingTimers = new Map<string, ReturnType<typeof setTimeout>>();

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
    this.removeFromMatchmaking(connectionId, true);
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
        this.clearMatchTimer(currentRoom.code);
        this.rooms.delete(currentRoom.code);
        return;
      }

      currentRoom.broadcast({ type: 'room_state', room: currentRoom.state() });
      if (currentRoom.phase === 'finished' && currentRoom.matchId) {
        this.clearMatchTimer(currentRoom.code);
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
          this.createRoom(connectionId, message.playerName, message.theme, message.loadout);
          return;
        case 'join_room':
          this.joinRoom(connectionId, message.roomCode, message.playerName, message.theme, message.loadout);
          return;
        case 'join_matchmaking':
          this.joinMatchmaking(connectionId, message.playerName, message.theme, message.loadout);
          return;
        case 'cancel_matchmaking':
          this.cancelMatchmaking(connectionId);
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
        case 'set_loadout':
          this.withRoom(connectionId, (room, player) => {
            room.setLoadout(player.id, message.loadout);
            room.broadcast({ type: 'room_state', room: room.state() });
          });
          return;
        case 'set_ready':
          this.withRoom(connectionId, (room, player) => {
            const started = room.setReady(player.id, message.ready);
            room.broadcast({ type: 'room_state', room: room.state() });
            if (started) {
              this.scheduleMatchDeadline(room);
              room.broadcast({ type: 'match_start', snapshot: room.matchSnapshot() });
            }
          });
          return;
        case 'set_rematch_ready':
          this.withRoom(connectionId, (room, player) => {
            const started = room.setRematchReady(player.id, message.ready);
            room.broadcast({ type: 'room_state', room: room.state() });
            if (started) {
              this.scheduleMatchDeadline(room);
              room.broadcast({ type: 'match_start', snapshot: room.matchSnapshot() });
            }
          });
          return;
        case 'move':
          this.withRoom(connectionId, (room, player) => {
            if (room.resolveTimeLimit(Date.now())) {
              this.clearMatchTimer(room.code);
              room.broadcast({ type: 'match_end', snapshot: room.matchSnapshot() });
              room.broadcast({ type: 'room_state', room: room.state() });
              return;
            }
            const { result, energyGain } = room.move(player.id, message.direction, message.sequence);
            room.sendTo(player.id, {
              type: 'move_ack',
              playerId: player.id,
              sequence: message.sequence,
              result,
              board: player.board!.publicState(),
              energy: player.energy,
              energyGain,
            });
            if (room.phase === 'finished') {
              this.clearMatchTimer(room.code);
              room.broadcast({ type: 'match_end', snapshot: room.matchSnapshot() });
              room.broadcast({ type: 'room_state', room: room.state() });
            } else {
              room.broadcast({ type: 'match_state', snapshot: room.matchSnapshot() });
            }
          });
          return;
        case 'cast_skill':
          this.withRoom(connectionId, (room, player) => {
            if (room.resolveTimeLimit(Date.now())) {
              this.clearMatchTimer(room.code);
              room.broadcast({ type: 'match_end', snapshot: room.matchSnapshot() });
              room.broadcast({ type: 'room_state', room: room.state() });
              return;
            }
            const cast = room.castSkill(player.id, message.skillId, message.sequence);
            room.broadcast({ type: 'skill_event', event: cast.event });

            if (room.phase === 'finished') {
              this.clearMatchTimer(room.code);
              room.broadcast({ type: 'match_end', snapshot: room.matchSnapshot() });
              room.broadcast({ type: 'room_state', room: room.state() });
            } else {
              room.broadcast({ type: 'match_state', snapshot: room.matchSnapshot() });
            }

            if (cast.timedEffectExpiresAt > 0) {
              this.scheduleEffectExpiry(room, cast.timedEffectExpiresAt);
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

  stats(): { rooms: number; connections: number; playing: number; queued: number } {
    return {
      rooms: this.rooms.size,
      connections: this.connections.size,
      playing: [...this.rooms.values()].filter((room) => room.phase === 'playing').length,
      queued: this.matchmaking.size,
    };
  }

  private createRoom(
    connectionId: string,
    playerName: string,
    theme: NetworkThemeId,
    loadout: SkillLoadout,
  ): void {
    this.removeFromMatchmaking(connectionId, true);
    this.leaveRoom(connectionId);
    const code = this.generateRoomCode();
    const room = new RoomSession(code, (target, message) => this.send(target, message));
    const host = room.addPlayer(connectionId, playerName, theme, loadout);

    this.rooms.set(code, room);
    this.memberships.set(connectionId, { roomCode: code, playerId: host.id });
    this.sendJoined(connectionId, room, host);
  }

  private joinRoom(
    connectionId: string,
    roomCode: string,
    playerName: string,
    theme: NetworkThemeId,
    loadout: SkillLoadout,
  ): void {
    this.removeFromMatchmaking(connectionId, true);
    this.leaveRoom(connectionId);
    const code = normalizeRoomCode(roomCode);
    const room = this.rooms.get(code);
    if (!room) throw new Error('ROOM_NOT_FOUND');
    const player = room.addPlayer(connectionId, playerName, theme, loadout);
    this.memberships.set(connectionId, { roomCode: code, playerId: player.id });
    this.sendJoined(connectionId, room, player);
    room.broadcast({ type: 'room_state', room: room.state() });
  }

  private reconnect(connectionId: string, roomCode: string, reconnectToken: string): void {
    this.removeFromMatchmaking(connectionId, true);
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
    this.removeFromMatchmaking(connectionId, true);
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
      this.clearMatchTimer(room.code);
      this.rooms.delete(room.code);
      return;
    }

    room.broadcast({ type: 'room_state', room: room.state() });
    if (room.phase === 'finished' && room.matchId) {
      this.clearMatchTimer(room.code);
      room.broadcast({ type: 'match_end', snapshot: room.matchSnapshot() });
    }
  }

  private joinMatchmaking(
    connectionId: string,
    playerName: string,
    theme: NetworkThemeId,
    loadout: SkillLoadout,
  ): void {
    if (this.matchmaking.has(connectionId)) throw new Error('ALREADY_MATCHMAKING');

    if (this.memberships.has(connectionId)) {
      this.leaveRoom(connectionId);
    }

    const entry = {
      connectionId,
      playerName: sanitizeQueueName(playerName),
      theme,
      loadout: [...loadout] as SkillLoadout,
      joinedAt: Date.now(),
    };
    this.matchmaking.enqueue(entry);
    this.scheduleMatchmakingTimeout(connectionId);
    this.notifyMatchmakingQueue();
    this.tryMatchmake();
  }

  private cancelMatchmaking(connectionId: string): void {
    if (!this.matchmaking.has(connectionId)) throw new Error('NOT_MATCHMAKING');
    this.removeFromMatchmaking(connectionId, false);
    this.send(connectionId, {
      type: 'matchmaking_state',
      state: {
        status: 'idle',
        joinedAt: null,
        queueSize: this.matchmaking.size,
      },
    });
    this.notifyMatchmakingQueue();
  }

  private tryMatchmake(): void {
    while (this.matchmaking.size >= 2) {
      const pair = this.matchmaking.takePair();
      if (!pair) return;

      const [first, second] = pair;
      this.clearMatchmakingTimer(first.connectionId);
      this.clearMatchmakingTimer(second.connectionId);

      const firstLive = this.connections.has(first.connectionId);
      const secondLive = this.connections.has(second.connectionId);

      if (!firstLive || !secondLive) {
        if (firstLive) {
          this.matchmaking.enqueue(first);
          this.scheduleMatchmakingTimeout(first.connectionId);
        }
        if (secondLive) {
          this.matchmaking.enqueue(second);
          this.scheduleMatchmakingTimeout(second.connectionId);
        }
        continue;
      }

      const code = this.generateRoomCode();
      const room = new RoomSession(code, (target, message) => this.send(target, message));
      const firstPlayer = room.addPlayer(first.connectionId, first.playerName, first.theme, first.loadout);
      const secondPlayer = room.addPlayer(second.connectionId, second.playerName, second.theme, second.loadout);

      this.rooms.set(code, room);
      this.memberships.set(first.connectionId, { roomCode: code, playerId: firstPlayer.id });
      this.memberships.set(second.connectionId, { roomCode: code, playerId: secondPlayer.id });

      const matchedState = {
        status: 'matched' as const,
        joinedAt: null,
        queueSize: this.matchmaking.size,
      };
      this.send(first.connectionId, { type: 'matchmaking_state', state: matchedState });
      this.send(second.connectionId, { type: 'matchmaking_state', state: matchedState });

      this.sendJoined(first.connectionId, room, firstPlayer);
      this.sendJoined(second.connectionId, room, secondPlayer);

      room.setReady(firstPlayer.id, true);
      const started = room.setReady(secondPlayer.id, true);

      room.broadcast({ type: 'room_state', room: room.state() });
      if (started) {
        this.scheduleMatchDeadline(room);
        room.broadcast({ type: 'match_start', snapshot: room.matchSnapshot() });
      }
    }

    this.notifyMatchmakingQueue();
  }

  private notifyMatchmakingQueue(): void {
    const queueSize = this.matchmaking.size;
    for (const entry of this.matchmaking.snapshot()) {
      this.send(entry.connectionId, {
        type: 'matchmaking_state',
        state: {
          status: 'searching',
          joinedAt: entry.joinedAt,
          queueSize,
        },
      });
    }
  }

  private scheduleMatchmakingTimeout(connectionId: string): void {
    this.clearMatchmakingTimer(connectionId);
    const timer = setTimeout(() => {
      const entry = this.matchmaking.remove(connectionId);
      this.matchmakingTimers.delete(connectionId);
      if (!entry) return;

      this.send(connectionId, {
        type: 'matchmaking_state',
        state: {
          status: 'timed_out',
          joinedAt: entry.joinedAt,
          queueSize: this.matchmaking.size,
        },
      });
      this.notifyMatchmakingQueue();
    }, MATCHMAKING_TIMEOUT_MS);
    timer.unref?.();
    this.matchmakingTimers.set(connectionId, timer);
  }

  private removeFromMatchmaking(connectionId: string, notifyQueue: boolean): void {
    const removed = this.matchmaking.remove(connectionId);
    this.clearMatchmakingTimer(connectionId);
    if (removed && notifyQueue) this.notifyMatchmakingQueue();
  }

  private clearMatchmakingTimer(connectionId: string): void {
    const timer = this.matchmakingTimers.get(connectionId);
    if (timer) clearTimeout(timer);
    this.matchmakingTimers.delete(connectionId);
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
      ALREADY_MATCHMAKING: 'ALREADY_MATCHMAKING',
      NOT_MATCHMAKING: 'NOT_MATCHMAKING',
      NOT_IN_ROOM: 'NOT_IN_ROOM',
      NOT_PLAYING: 'NOT_PLAYING',
      NOT_READY: 'NOT_READY',
      REMATCH_NOT_AVAILABLE: 'REMATCH_NOT_AVAILABLE',
      INVALID_RECONNECT: 'INVALID_RECONNECT',
      STALE_SEQUENCE: 'STALE_SEQUENCE',
      STALE_SKILL_SEQUENCE: 'STALE_SKILL_SEQUENCE',
      INSUFFICIENT_ENERGY: 'INSUFFICIENT_ENERGY',
      SKILL_COOLDOWN: 'SKILL_COOLDOWN',
      SKILL_ALREADY_ACTIVE: 'SKILL_ALREADY_ACTIVE',
      SKILL_NO_TARGET: 'SKILL_NO_TARGET',
      SKILL_NOT_EQUIPPED: 'SKILL_NOT_EQUIPPED',
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

  private scheduleMatchDeadline(room: RoomSession): void {
    this.clearMatchTimer(room.code);
    const expectedMatchId = room.matchId;
    const delay = Math.max(0, room.roundEndsAt - Date.now()) + 30;

    const timer = setTimeout(() => {
      this.matchTimers.delete(room.code);
      if (room.phase !== 'playing' || room.matchId !== expectedMatchId) return;
      if (!room.resolveTimeLimit(Date.now())) return;

      room.broadcast({ type: 'match_end', snapshot: room.matchSnapshot() });
      room.broadcast({ type: 'room_state', room: room.state() });
    }, delay);
    timer.unref?.();
    this.matchTimers.set(room.code, timer);
  }

  private clearMatchTimer(roomCode: string): void {
    const timer = this.matchTimers.get(roomCode);
    if (timer) clearTimeout(timer);
    this.matchTimers.delete(roomCode);
  }

  private scheduleEffectExpiry(room: RoomSession, expiresAt: number): void {
    const delay = Math.max(0, expiresAt - Date.now()) + 40;
    const timer = setTimeout(() => {
      if (room.phase !== 'playing') return;
      if (!room.expireTimedEffects(Date.now())) return;
      room.broadcast({ type: 'match_state', snapshot: room.matchSnapshot() });
    }, delay);
    timer.unref?.();
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
    ALREADY_MATCHMAKING: '你已经在匹配队列中。',
    NOT_MATCHMAKING: '当前没有正在进行的匹配。',
    NOT_IN_ROOM: '当前连接不在房间中。',
    NOT_PLAYING: '比赛尚未开始。',
    NOT_READY: '玩家尚未准备。',
    REMATCH_NOT_AVAILABLE: '当前还不能发起再来一局。',
    INVALID_RECONNECT: '重连凭证无效。',
    STALE_SEQUENCE: '该移动操作已经处理过。',
    STALE_SKILL_SEQUENCE: '该技能操作已经处理过。',
    INSUFFICIENT_ENERGY: '战斗能量不足。',
    SKILL_COOLDOWN: '技能仍在冷却中。',
    SKILL_ALREADY_ACTIVE: '该技能效果已经处于激活状态。',
    SKILL_NO_TARGET: '当前没有可用的技能目标。',
    SKILL_NOT_EQUIPPED: '这个技能没有装备到当前三个技能槽。',
  };
  return messages[code];
}


function sanitizeQueueName(value: string): string {
  const trimmed = value.trim().replace(/\s+/g, ' ');
  return (trimmed || '玩家').slice(0, 16);
}
