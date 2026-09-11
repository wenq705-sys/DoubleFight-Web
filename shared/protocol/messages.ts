import type { BoardPublicState, Direction, MoveResult } from '../game/types';

export const PROTOCOL_VERSION = 2;

export type NetworkThemeId = 'kingdom' | 'palace';
export type RoomPhase = 'lobby' | 'playing' | 'finished';

export interface RoomPlayerState {
  id: string;
  name: string;
  theme: NetworkThemeId;
  ready: boolean;
  connected: boolean;
  isHost: boolean;
}

export interface RoomState {
  code: string;
  phase: RoomPhase;
  players: RoomPlayerState[];
  matchId: string | null;
}

export interface MatchPlayerState {
  playerId: string;
  name: string;
  theme: NetworkThemeId;
  board: BoardPublicState;
  energy: number;
  maxEnergy: number;
  lastSequence: number;
  connected: boolean;
}

export interface MatchSnapshot {
  matchId: string;
  roomCode: string;
  phase: 'playing' | 'finished';
  players: MatchPlayerState[];
  winnerId: string | null;
  endReason: 'board_locked' | 'opponent_left' | null;
}

export type ClientMessage =
  | { type: 'hello'; protocolVersion: number }
  | { type: 'create_room'; playerName: string; theme: NetworkThemeId }
  | { type: 'join_room'; roomCode: string; playerName: string; theme: NetworkThemeId }
  | { type: 'reconnect'; roomCode: string; reconnectToken: string }
  | { type: 'set_theme'; theme: NetworkThemeId }
  | { type: 'set_ready'; ready: boolean }
  | { type: 'move'; direction: Direction; sequence: number }
  | { type: 'leave_room' }
  | { type: 'ping'; sentAt: number };

export type ServerMessage =
  | {
      type: 'welcome';
      connectionId: string;
      protocolVersion: number;
    }
  | {
      type: 'room_joined';
      playerId: string;
      reconnectToken: string;
      room: RoomState;
    }
  | { type: 'room_state'; room: RoomState }
  | { type: 'match_start'; snapshot: MatchSnapshot }
  | { type: 'match_state'; snapshot: MatchSnapshot }
  | {
      type: 'move_ack';
      sequence: number;
      playerId: string;
      result: MoveResult;
      board: BoardPublicState;
      energy: number;
      energyGain: number;
    }
  | {
      type: 'match_end';
      snapshot: MatchSnapshot;
    }
  | {
      type: 'error';
      code:
        | 'BAD_MESSAGE'
        | 'PROTOCOL_MISMATCH'
        | 'ROOM_NOT_FOUND'
        | 'ROOM_FULL'
        | 'ROOM_ALREADY_PLAYING'
        | 'NOT_IN_ROOM'
        | 'NOT_PLAYING'
        | 'NOT_READY'
        | 'INVALID_RECONNECT'
        | 'STALE_SEQUENCE';
      message: string;
    }
  | { type: 'pong'; sentAt: number; serverAt: number };

export function isNetworkThemeId(value: unknown): value is NetworkThemeId {
  return value === 'kingdom' || value === 'palace';
}

export function isDirection(value: unknown): value is Direction {
  return value === 'left' || value === 'right' || value === 'up' || value === 'down';
}

export function parseClientMessage(raw: string): ClientMessage | null {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }

  if (!value || typeof value !== 'object') return null;
  const message = value as Record<string, unknown>;
  const type = message.type;

  if (type === 'hello' && Number.isInteger(message.protocolVersion)) {
    return { type, protocolVersion: Number(message.protocolVersion) };
  }

  if (type === 'create_room' && typeof message.playerName === 'string' && isNetworkThemeId(message.theme)) {
    return { type, playerName: message.playerName, theme: message.theme };
  }

  if (
    type === 'join_room' &&
    typeof message.roomCode === 'string' &&
    typeof message.playerName === 'string' &&
    isNetworkThemeId(message.theme)
  ) {
    return { type, roomCode: message.roomCode, playerName: message.playerName, theme: message.theme };
  }

  if (type === 'reconnect' && typeof message.roomCode === 'string' && typeof message.reconnectToken === 'string') {
    return { type, roomCode: message.roomCode, reconnectToken: message.reconnectToken };
  }

  if (type === 'set_theme' && isNetworkThemeId(message.theme)) {
    return { type, theme: message.theme };
  }

  if (type === 'set_ready' && typeof message.ready === 'boolean') {
    return { type, ready: message.ready };
  }

  if (type === 'move' && isDirection(message.direction) && Number.isInteger(message.sequence)) {
    return { type, direction: message.direction, sequence: Number(message.sequence) };
  }

  if (type === 'leave_room') return { type };

  if (type === 'ping' && typeof message.sentAt === 'number' && Number.isFinite(message.sentAt)) {
    return { type, sentAt: message.sentAt };
  }

  return null;
}
