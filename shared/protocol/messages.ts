import type { BoardPublicState, BoardTile, CellPosition, Direction, MoveResult } from '../game/types';
import type { TimeLimitTieBreaker } from '../battle/match';
import type { SkillCooldowns, SkillId, SkillLoadout } from '../battle/skills';
import { DEFAULT_SKILL_LOADOUT, isSkillId, isSkillLoadout } from '../battle/skills';

export const PROTOCOL_VERSION = 6;

export type NetworkThemeId = 'kingdom' | 'palace';
export type RoomPhase = 'lobby' | 'playing' | 'finished';
export type MatchEndReason = 'board_locked' | 'opponent_left' | 'petrified_lock' | 'time_limit';
export type MatchmakingStatus = 'idle' | 'searching' | 'matched' | 'timed_out';

export interface MatchmakingState {
  status: MatchmakingStatus;
  joinedAt: number | null;
  queueSize: number;
}

export interface RoomPlayerState {
  id: string;
  name: string;
  theme: NetworkThemeId;
  loadout: SkillLoadout;
  ready: boolean;
  rematchReady: boolean;
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
  loadout: SkillLoadout;
  board: BoardPublicState;
  energy: number;
  maxEnergy: number;
  shieldActive: boolean;
  petrifyExpiresAt: number;
  skillCooldowns: SkillCooldowns;
  lastSequence: number;
  lastSkillSequence: number;
  connected: boolean;
}

export interface MatchResultPlayer {
  playerId: string;
  name: string;
  theme: NetworkThemeId;
  score: number;
  highest: number;
  usableEmptyCells: number;
}

export interface MatchResult {
  winnerId: string | null;
  reason: MatchEndReason;
  tieBreaker: TimeLimitTieBreaker | null;
  finishedAt: number;
  players: MatchResultPlayer[];
}

export interface MatchSnapshot {
  matchId: string;
  roomCode: string;
  phase: 'playing' | 'finished';
  serverTime: number;
  roundStartedAt: number;
  roundEndsAt: number;
  durationMs: number;
  players: MatchPlayerState[];
  winnerId: string | null;
  endReason: MatchEndReason | null;
  result: MatchResult | null;
}

export type SkillOutcome = 'applied' | 'shielded';

export interface SkillEvent {
  sequence: number;
  skillId: SkillId;
  casterId: string;
  targetId: string;
  outcome: SkillOutcome;
  energySpent: number;
  removedTiles: BoardTile[];
  blockedCell: CellPosition | null;
  clearedBlockedCells: CellPosition[];
  petrifyExpiresAt: number;
}

export type ClientMessage =
  | { type: 'hello'; protocolVersion: number }
  | { type: 'create_room'; playerName: string; theme: NetworkThemeId; loadout: SkillLoadout }
  | { type: 'join_room'; roomCode: string; playerName: string; theme: NetworkThemeId; loadout: SkillLoadout }
  | { type: 'join_matchmaking'; playerName: string; theme: NetworkThemeId; loadout: SkillLoadout }
  | { type: 'cancel_matchmaking' }
  | { type: 'reconnect'; roomCode: string; reconnectToken: string }
  | { type: 'set_theme'; theme: NetworkThemeId }
  | { type: 'set_loadout'; loadout: SkillLoadout }
  | { type: 'set_ready'; ready: boolean }
  | { type: 'set_rematch_ready'; ready: boolean }
  | { type: 'move'; direction: Direction; sequence: number }
  | { type: 'cast_skill'; skillId: SkillId; sequence: number }
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
  | { type: 'matchmaking_state'; state: MatchmakingState }
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
  | { type: 'skill_event'; event: SkillEvent }
  | { type: 'match_end'; snapshot: MatchSnapshot }
  | {
      type: 'error';
      code:
        | 'BAD_MESSAGE'
        | 'PROTOCOL_MISMATCH'
        | 'ROOM_NOT_FOUND'
        | 'ROOM_FULL'
        | 'ROOM_ALREADY_PLAYING'
        | 'ALREADY_MATCHMAKING'
        | 'NOT_MATCHMAKING'
        | 'NOT_IN_ROOM'
        | 'NOT_PLAYING'
        | 'NOT_READY'
        | 'REMATCH_NOT_AVAILABLE'
        | 'INVALID_RECONNECT'
        | 'STALE_SEQUENCE'
        | 'STALE_SKILL_SEQUENCE'
        | 'INSUFFICIENT_ENERGY'
        | 'SKILL_COOLDOWN'
        | 'SKILL_ALREADY_ACTIVE'
        | 'SKILL_NO_TARGET'
        | 'SKILL_NOT_EQUIPPED';
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

  if (
    type === 'create_room'
    && typeof message.playerName === 'string'
    && isNetworkThemeId(message.theme)
  ) {
    const loadout = parseLoadout(message.loadout);
    if (!loadout) return null;
    return { type, playerName: message.playerName, theme: message.theme, loadout };
  }

  if (
    type === 'join_room'
    && typeof message.roomCode === 'string'
    && typeof message.playerName === 'string'
    && isNetworkThemeId(message.theme)
  ) {
    const loadout = parseLoadout(message.loadout);
    if (!loadout) return null;
    return {
      type,
      roomCode: message.roomCode,
      playerName: message.playerName,
      theme: message.theme,
      loadout,
    };
  }

  if (
    type === 'join_matchmaking'
    && typeof message.playerName === 'string'
    && isNetworkThemeId(message.theme)
  ) {
    const loadout = parseLoadout(message.loadout);
    if (!loadout) return null;
    return { type, playerName: message.playerName, theme: message.theme, loadout };
  }

  if (type === 'cancel_matchmaking') return { type };

  if (type === 'reconnect' && typeof message.roomCode === 'string' && typeof message.reconnectToken === 'string') {
    return { type, roomCode: message.roomCode, reconnectToken: message.reconnectToken };
  }

  if (type === 'set_theme' && isNetworkThemeId(message.theme)) {
    return { type, theme: message.theme };
  }

  if (type === 'set_loadout' && isSkillLoadout(message.loadout)) {
    return { type, loadout: message.loadout };
  }

  if (type === 'set_ready' && typeof message.ready === 'boolean') {
    return { type, ready: message.ready };
  }

  if (type === 'set_rematch_ready' && typeof message.ready === 'boolean') {
    return { type, ready: message.ready };
  }

  if (type === 'move' && isDirection(message.direction) && Number.isInteger(message.sequence)) {
    return { type, direction: message.direction, sequence: Number(message.sequence) };
  }

  if (type === 'cast_skill' && isSkillId(message.skillId) && Number.isInteger(message.sequence)) {
    return { type, skillId: message.skillId, sequence: Number(message.sequence) };
  }

  if (type === 'leave_room') return { type };

  if (type === 'ping' && typeof message.sentAt === 'number' && Number.isFinite(message.sentAt)) {
    return { type, sentAt: message.sentAt };
  }

  return null;
}


/** Protocol-v5 clients did not send a loadout. Keep the production rollout compatible
 * while v6 clients gain explicit three-slot selection. Invalid explicit values still fail. */
function parseLoadout(value: unknown): SkillLoadout | null {
  if (value === undefined) return [...DEFAULT_SKILL_LOADOUT];
  return isSkillLoadout(value) ? [...value] as SkillLoadout : null;
}
