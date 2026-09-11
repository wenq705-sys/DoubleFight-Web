import { randomBytes, randomUUID } from 'node:crypto';
import {
  Board2048,
  SeededRandom,
  randomUint32,
  type Direction,
  type MatchSnapshot,
  type NetworkThemeId,
  type RoomPlayerState,
  type RoomState,
  type ServerMessage,
} from '../shared/index';

export interface RoomPlayerRecord {
  id: string;
  name: string;
  theme: NetworkThemeId;
  ready: boolean;
  connected: boolean;
  reconnectToken: string;
  connectionId: string | null;
  board: Board2048 | null;
  lastSequence: number;
}

type Send = (connectionId: string, message: ServerMessage) => void;

export class RoomSession {
  readonly players = new Map<string, RoomPlayerRecord>();
  phase: 'lobby' | 'playing' | 'finished' = 'lobby';
  matchId: string | null = null;
  winnerId: string | null = null;
  endReason: 'board_locked' | 'opponent_left' | null = null;

  constructor(
    readonly code: string,
    private readonly hostId: string,
    private readonly send: Send,
  ) {}

  addPlayer(connectionId: string, name: string, theme: NetworkThemeId): RoomPlayerRecord {
    if (this.phase !== 'lobby') throw new Error('ROOM_ALREADY_PLAYING');
    if (this.players.size >= 2) throw new Error('ROOM_FULL');

    const player: RoomPlayerRecord = {
      id: randomUUID(),
      name: sanitizeName(name),
      theme,
      ready: false,
      connected: true,
      reconnectToken: randomBytes(24).toString('base64url'),
      connectionId,
      board: null,
      lastSequence: -1,
    };
    this.players.set(player.id, player);
    return player;
  }

  reconnect(connectionId: string, reconnectToken: string): RoomPlayerRecord | null {
    const player = [...this.players.values()].find((entry) => entry.reconnectToken === reconnectToken);
    if (!player) return null;
    player.connectionId = connectionId;
    player.connected = true;
    return player;
  }

  setTheme(playerId: string, theme: NetworkThemeId): void {
    const player = this.requirePlayer(playerId);
    if (this.phase !== 'lobby') throw new Error('ROOM_ALREADY_PLAYING');
    player.theme = theme;
    player.ready = false;
  }

  setReady(playerId: string, ready: boolean): boolean {
    const player = this.requirePlayer(playerId);
    if (this.phase !== 'lobby') throw new Error('ROOM_ALREADY_PLAYING');
    player.ready = ready;
    return this.tryStart();
  }

  move(playerId: string, direction: Direction, sequence: number): {
    player: RoomPlayerRecord;
    result: ReturnType<Board2048['move']>;
  } {
    if (this.phase !== 'playing') throw new Error('NOT_PLAYING');
    const player = this.requirePlayer(playerId);
    if (!player.board) throw new Error('NOT_PLAYING');
    if (sequence <= player.lastSequence) throw new Error('STALE_SEQUENCE');

    player.lastSequence = sequence;
    const result = player.board.move(direction);

    if (result.gameOver) {
      const opponent = [...this.players.values()].find((entry) => entry.id !== player.id);
      this.phase = 'finished';
      this.winnerId = opponent?.id ?? null;
      this.endReason = 'board_locked';
    }

    return { player, result };
  }

  disconnect(playerId: string): void {
    const player = this.players.get(playerId);
    if (!player) return;
    player.connected = false;
    player.connectionId = null;
  }

  removePlayer(playerId: string): void {
    this.players.delete(playerId);
    if (this.phase === 'playing' && this.players.size < 2) {
      const survivor = [...this.players.values()][0];
      this.phase = 'finished';
      this.winnerId = survivor?.id ?? null;
      this.endReason = 'opponent_left';
    }
  }

  isEmpty(): boolean {
    return this.players.size === 0;
  }

  state(): RoomState {
    return {
      code: this.code,
      phase: this.phase,
      matchId: this.matchId,
      players: [...this.players.values()].map((player): RoomPlayerState => ({
        id: player.id,
        name: player.name,
        theme: player.theme,
        ready: player.ready,
        connected: player.connected,
        isHost: player.id === this.hostId,
      })),
    };
  }

  matchSnapshot(): MatchSnapshot {
    if (!this.matchId) throw new Error('NOT_PLAYING');
    return {
      matchId: this.matchId,
      roomCode: this.code,
      phase: this.phase === 'finished' ? 'finished' : 'playing',
      winnerId: this.winnerId,
      endReason: this.endReason,
      players: [...this.players.values()].map((player) => {
        if (!player.board) throw new Error('NOT_PLAYING');
        return {
          playerId: player.id,
          name: player.name,
          theme: player.theme,
          board: player.board.publicState(),
          lastSequence: player.lastSequence,
          connected: player.connected,
        };
      }),
    };
  }

  broadcast(message: ServerMessage): void {
    for (const player of this.players.values()) {
      if (player.connected && player.connectionId) this.send(player.connectionId, message);
    }
  }

  sendTo(playerId: string, message: ServerMessage): void {
    const player = this.players.get(playerId);
    if (player?.connected && player.connectionId) this.send(player.connectionId, message);
  }

  private tryStart(): boolean {
    if (this.players.size !== 2) return false;
    if ([...this.players.values()].some((player) => !player.ready || !player.connected)) return false;

    this.phase = 'playing';
    this.matchId = randomUUID();
    this.winnerId = null;
    this.endReason = null;

    const baseSeed = randomUint32();
    [...this.players.values()].forEach((player, index) => {
      const seed = (baseSeed ^ Math.imul(index + 1, 0x9e3779b1)) >>> 0;
      player.board = new Board2048(new SeededRandom(seed));
      player.board.reset();
      player.lastSequence = -1;
    });
    return true;
  }

  private requirePlayer(playerId: string): RoomPlayerRecord {
    const player = this.players.get(playerId);
    if (!player) throw new Error('NOT_IN_ROOM');
    return player;
  }
}

function sanitizeName(value: string): string {
  const trimmed = value.trim().replace(/\s+/g, ' ');
  return (trimmed || '玩家').slice(0, 16);
}
