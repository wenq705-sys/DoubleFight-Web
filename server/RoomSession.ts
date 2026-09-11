import { randomBytes, randomUUID } from 'node:crypto';
import {
  Board2048,
  SeededRandom,
  randomUint32,
  MAX_BATTLE_ENERGY,
  SKILL_DEFINITIONS,
  clampBattleEnergy,
  emptySkillCooldowns,
  energyForMerges,
  type Direction,
  type MatchSnapshot,
  type NetworkThemeId,
  type RoomPlayerState,
  type RoomState,
  type ServerMessage,
  type SkillCooldowns,
  type SkillEvent,
  type SkillId,
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
  energy: number;
  shieldActive: boolean;
  petrifyExpiresAt: number;
  skillCooldowns: SkillCooldowns;
  lastSequence: number;
  lastSkillSequence: number;
}

type Send = (connectionId: string, message: ServerMessage) => void;

export interface SkillCastResult {
  event: SkillEvent;
  timedEffectExpiresAt: number;
}

export class RoomSession {
  readonly players = new Map<string, RoomPlayerRecord>();
  phase: 'lobby' | 'playing' | 'finished' = 'lobby';
  matchId: string | null = null;
  winnerId: string | null = null;
  endReason: 'board_locked' | 'opponent_left' | 'petrified_lock' | null = null;

  private hostId: string | null = null;

  constructor(
    readonly code: string,
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
      energy: 0,
      shieldActive: false,
      petrifyExpiresAt: 0,
      skillCooldowns: emptySkillCooldowns(),
      lastSequence: -1,
      lastSkillSequence: -1,
    };
    this.players.set(player.id, player);
    if (!this.hostId) this.hostId = player.id;
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
    energyGain: number;
  } {
    if (this.phase !== 'playing') throw new Error('NOT_PLAYING');
    this.expireTimedEffects(Date.now());

    const player = this.requirePlayer(playerId);
    if (!player.board) throw new Error('NOT_PLAYING');
    if (sequence <= player.lastSequence) throw new Error('STALE_SEQUENCE');

    player.lastSequence = sequence;
    const result = player.board.move(direction);
    const breakdown = energyForMerges(result.merges);
    const beforeEnergy = player.energy;
    player.energy = clampBattleEnergy(player.energy + breakdown.total);
    const energyGain = player.energy - beforeEnergy;

    if (result.gameOver) {
      const opponent = this.opponentOf(player.id);
      this.phase = 'finished';
      this.winnerId = opponent?.id ?? null;
      this.endReason = 'board_locked';
    }

    return { player, result, energyGain };
  }

  castSkill(playerId: string, skillId: SkillId, sequence: number, now = Date.now()): SkillCastResult {
    if (this.phase !== 'playing') throw new Error('NOT_PLAYING');
    this.expireTimedEffects(now);

    const caster = this.requirePlayer(playerId);
    const target = skillId === 'petrify' ? this.opponentOf(playerId) : caster;
    if (!caster.board || !target?.board) throw new Error('NOT_PLAYING');
    if (sequence <= caster.lastSkillSequence) throw new Error('STALE_SKILL_SEQUENCE');

    const definition = SKILL_DEFINITIONS[skillId];
    if (caster.energy < definition.cost) throw new Error('INSUFFICIENT_ENERGY');
    if (caster.skillCooldowns[skillId] > now) throw new Error('SKILL_COOLDOWN');
    if (skillId === 'shield' && caster.shieldActive) throw new Error('SKILL_ALREADY_ACTIVE');

    const event: SkillEvent = {
      sequence,
      skillId,
      casterId: caster.id,
      targetId: target.id,
      outcome: 'applied',
      energySpent: definition.cost,
      removedTiles: [],
      blockedCell: null,
      petrifyExpiresAt: 0,
    };

    let timedEffectExpiresAt = 0;

    if (skillId === 'random_clear') {
      if (caster.board.tiles().length === 0) throw new Error('SKILL_NO_TARGET');
      const clear = caster.board.clearRandom(2);
      event.removedTiles = clear.removed;
    }

    if (skillId === 'shield') {
      caster.shieldActive = true;
    }

    if (skillId === 'petrify') {
      if (target.shieldActive) {
        target.shieldActive = false;
        event.outcome = 'shielded';
      } else {
        const blockedCell = target.board.blockRandomEmpty();
        if (!blockedCell) throw new Error('SKILL_NO_TARGET');

        const expiresAt = now + (definition.petrifyDurationMs ?? 0);
        target.petrifyExpiresAt = expiresAt;
        event.blockedCell = blockedCell;
        event.petrifyExpiresAt = expiresAt;
        timedEffectExpiresAt = expiresAt;

        if (!target.board.canMove()) {
          this.phase = 'finished';
          this.winnerId = caster.id;
          this.endReason = 'petrified_lock';
        }
      }
    }

    caster.energy = clampBattleEnergy(caster.energy - definition.cost);
    caster.skillCooldowns[skillId] = now + definition.cooldownMs;
    caster.lastSkillSequence = sequence;

    return { event, timedEffectExpiresAt };
  }

  expireTimedEffects(now = Date.now()): boolean {
    let changed = false;

    for (const player of this.players.values()) {
      if (
        player.board &&
        player.petrifyExpiresAt > 0 &&
        player.petrifyExpiresAt <= now
      ) {
        player.board.clearBlockedCells();
        player.petrifyExpiresAt = 0;
        changed = true;
      }
    }

    return changed;
  }

  disconnect(playerId: string): void {
    const player = this.players.get(playerId);
    if (!player) return;
    player.connected = false;
    player.connectionId = null;
  }

  removePlayer(playerId: string): void {
    this.players.delete(playerId);
    if (this.hostId === playerId) {
      this.hostId = this.players.keys().next().value ?? null;
    }
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

  matchSnapshot(now = Date.now()): MatchSnapshot {
    if (!this.matchId) throw new Error('NOT_PLAYING');
    this.expireTimedEffects(now);

    return {
      matchId: this.matchId,
      roomCode: this.code,
      phase: this.phase === 'finished' ? 'finished' : 'playing',
      serverTime: now,
      winnerId: this.winnerId,
      endReason: this.endReason,
      players: [...this.players.values()].map((player) => {
        if (!player.board) throw new Error('NOT_PLAYING');
        return {
          playerId: player.id,
          name: player.name,
          theme: player.theme,
          board: player.board.publicState(),
          energy: player.energy,
          maxEnergy: MAX_BATTLE_ENERGY,
          shieldActive: player.shieldActive,
          petrifyExpiresAt: player.petrifyExpiresAt,
          skillCooldowns: { ...player.skillCooldowns },
          lastSequence: player.lastSequence,
          lastSkillSequence: player.lastSkillSequence,
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
      player.energy = 0;
      player.shieldActive = false;
      player.petrifyExpiresAt = 0;
      player.skillCooldowns = emptySkillCooldowns();
      player.lastSequence = -1;
      player.lastSkillSequence = -1;
    });
    return true;
  }

  private opponentOf(playerId: string): RoomPlayerRecord | null {
    return [...this.players.values()].find((entry) => entry.id !== playerId) ?? null;
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
