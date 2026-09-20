import {
  DEFAULT_SKILL_LOADOUT,
  SKILL_DEFINITIONS,
  type Direction,
  type MatchPlayerState,
  type MatchSnapshot,
  type NetworkThemeId,
  type ServerMessage,
  type SkillId,
  type SkillLoadout,
} from '../../../shared/index';
import type { ThemeId } from '../../../src/config/themes';
import { OnlineController } from '../../../src/battle/OnlineController';
import { BattleBoardView } from '../../../src/rendering/battle/BattleBoardView';
import { OnlineClient, type OnlineClientState } from '../../../src/network/OnlineClient';
import type { DouyinPlatform } from '../../../src/platform/douyin/DouyinPlatform';
import type { PresentationEvent } from '../../../src/battle/PresentationEvents';

export type DouyinOnlineMode = 'lobby' | 'matching' | 'room' | 'playing' | 'result';

const SKILL_ORDER: SkillId[] = ['random_clear', 'shield', 'petrify', 'shuffle', 'purify'];

export interface DouyinOnlineSnapshot {
  mode: DouyinOnlineMode;
  state: Readonly<OnlineClientState>;
  me: MatchPlayerState | null;
  opponent: MatchPlayerState | null;
  selectedTheme: NetworkThemeId;
  loadout: SkillLoadout;
  playerName: string;
}

export class DouyinOnlineFlow {
  readonly local: BattleBoardView;
  readonly remote: BattleBoardView;
  readonly controller: OnlineController;

  private selectedTheme: NetworkThemeId;
  private loadout: SkillLoadout;
  private playerName: string;
  private opened = false;
  private unsubscribe: (() => void) | null = null;
  private changeListeners = new Set<() => void>();
  private currentMatchId: string | null = null;
  private pendingJoinCode: string | null = null;
  private serverClockOffsetMs = 0;
  private lastMessage: ServerMessage | undefined;

  constructor(
    private readonly platform: DouyinPlatform,
    readonly client: OnlineClient,
    initialTheme: ThemeId,
    onPresentation?: (event: PresentationEvent) => void,
  ) {
    this.local = new BattleBoardView('kingdom', 'board', undefined, onPresentation, true);
    this.remote = new BattleBoardView('kingdom', 'board', undefined, onPresentation, true);
    this.controller = new OnlineController(this.local, this.remote);
    this.selectedTheme = initialTheme === 'palace' ? 'palace' : 'kingdom';
    // The mini-game has no unreviewed free-text nickname entry. Authenticated
    // connections receive their profile name from the server instead.
    this.playerName = '玩家';
    this.loadout = this.loadLoadout();
    const savedTheme = platform.storage.getItem('doublefight-online-theme');
    if (savedTheme === 'kingdom' || savedTheme === 'palace') this.selectedTheme = savedTheme;
    this.unsubscribe = client.subscribe((state, message) => this.consume(state, message));
  }

  subscribe(listener: () => void): () => void {
    this.changeListeners.add(listener);
    listener();
    return () => this.changeListeners.delete(listener);
  }

  open(theme: ThemeId): void {
    this.opened = true;
    if (!this.platform.storage.getItem('doublefight-online-theme')) this.selectedTheme = theme === 'palace' ? 'palace' : 'kingdom';
    this.client.connect();
    this.emit();
  }

  close(): void {
    const state = this.client.snapshot();
    if (state.matchmaking.status === 'searching') this.client.cancelMatchmaking();
    if (state.room) this.client.leaveRoom();
    this.controller.reset();
    this.currentMatchId = null;
    this.pendingJoinCode = null;
    this.opened = false;
    this.emit();
  }

  dispose(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.changeListeners.clear();
    this.local.dispose();
    this.remote.dispose();
  }

  snapshot(): DouyinOnlineSnapshot {
    const state = this.client.snapshot();
    const me = state.match?.players.find(player => player.playerId === state.playerId) ?? null;
    const opponent = state.match?.players.find(player => player.playerId !== state.playerId) ?? null;
    return {
      mode: this.resolveMode(state),
      state,
      me,
      opponent,
      selectedTheme: this.selectedTheme,
      loadout: [...this.loadout] as SkillLoadout,
      playerName: this.playerName,
    };
  }

  setPlayerName(displayName: string | undefined): void {
    const next = displayName?.trim();
    this.playerName = next || '玩家';
    this.emit();
  }

  setTheme(theme: ThemeId): void {
    const state = this.client.snapshot();
    if (state.matchmaking.status === 'searching' || state.match?.phase === 'playing') return;
    const networkTheme: NetworkThemeId = theme === 'palace' ? 'palace' : 'kingdom';
    this.selectedTheme = networkTheme;
    this.platform.storage.setItem('doublefight-online-theme', networkTheme);
    if (state.room?.phase === 'lobby') this.client.setTheme(networkTheme);
    this.emit();
  }

  cycleSkill(slot: number): void {
    if (slot < 0 || slot > 2) return;
    const state = this.client.snapshot();
    if (state.matchmaking.status === 'searching' || state.match?.phase === 'playing') return;

    const current = this.loadout[slot];
    const start = SKILL_ORDER.indexOf(current);
    let replacement = current;
    for (let offset = 1; offset <= SKILL_ORDER.length; offset++) {
      const candidate = SKILL_ORDER[(start + offset) % SKILL_ORDER.length];
      if (!this.loadout.includes(candidate)) {
        replacement = candidate;
        break;
      }
    }
    if (replacement === current) return;
    const next = [...this.loadout] as SkillLoadout;
    next[slot] = replacement;
    this.loadout = next;
    this.persistSetup();
    if (state.room?.phase === 'lobby') this.client.setLoadout(this.loadout);
    this.platform.haptics.trigger('light');
    this.emit();
  }

  quickMatch(): void {
    const state = this.client.snapshot();
    if (state.status !== 'connected' || state.room || state.matchmaking.status === 'searching') return;
    this.client.joinMatchmaking(this.playerName, this.selectedTheme, this.loadout);
  }

  cancelMatch(): void {
    if (this.client.snapshot().matchmaking.status === 'searching') this.client.cancelMatchmaking();
  }

  createRoom(): void {
    const state = this.client.snapshot();
    if (state.status !== 'connected' || state.room || state.matchmaking.status === 'searching') return;
    this.client.createRoom(this.playerName, this.selectedTheme, this.loadout);
  }

  joinRoom(code: string): void {
    const normalized = code.replace(/\D/g, '').slice(0, 6);
    if (normalized.length !== 6) return;
    const state = this.client.snapshot();
    if (state.room) return;
    if (state.status !== 'connected') {
      this.pendingJoinCode = normalized;
      this.client.connect();
      return;
    }
    this.pendingJoinCode = null;
    this.client.joinRoom(normalized, this.playerName, this.selectedTheme, this.loadout);
  }

  toggleReady(): void {
    const state = this.client.snapshot();
    const me = state.room?.players.find(player => player.id === state.playerId);
    if (!me || state.room?.phase !== 'lobby') return;
    this.client.setReady(!me.ready);
  }

  leaveRoom(): void {
    this.client.leaveRoom();
    this.controller.reset();
    this.currentMatchId = null;
  }

  setRematchReady(): void {
    const state = this.client.snapshot();
    if (state.match?.phase !== 'finished') return;
    const me = state.room?.players.find(player => player.id === state.playerId);
    if (!me) return;
    this.client.setRematchReady(!me.rematchReady);
  }

  move(direction: Direction): boolean {
    const state = this.client.snapshot();
    if (!this.opened || state.status !== 'connected' || state.match?.phase !== 'playing') return false;
    const moved = this.controller.move(direction, move => this.client.move(move));
    if (moved) this.platform.haptics.trigger('light');
    return moved;
  }

  castSkill(skillId: SkillId): { ok: boolean; reason?: string } {
    const snap = this.snapshot();
    const me = snap.me;
    if (!me || snap.state.match?.phase !== 'playing') return { ok: false, reason: '比赛尚未开始' };
    if (!me.loadout.includes(skillId)) return { ok: false, reason: '技能未装备' };

    const definition = SKILL_DEFINITIONS[skillId];
    const now = this.serverNow();
    const remaining = Math.max(0, me.skillCooldowns[skillId] - now);
    if (remaining > 0) return { ok: false, reason: `${definition.shortLabel}冷却中` };
    if (me.energy < definition.cost) return { ok: false, reason: `需要 ${definition.cost} 能量` };
    if (skillId === 'shield' && me.shieldActive) return { ok: false, reason: '护盾已激活' };
    if (skillId === 'purify' && me.board.blockedCells.length === 0) return { ok: false, reason: '当前无需净化' };

    this.controller.previewSkill(skillId, id => this.client.castSkill(id));
    this.platform.haptics.trigger('medium');
    return { ok: true };
  }

  serverNow(): number { return Date.now() + this.serverClockOffsetMs; }

  remainingMs(): number {
    const match = this.client.snapshot().match;
    if (!match || match.phase === 'finished') return 0;
    return Math.max(0, match.roundEndsAt - this.serverNow());
  }

  resultReason(): string {
    const state = this.client.snapshot();
    const match = state.match;
    if (!match || match.phase !== 'finished') return '';
    const won = match.winnerId === state.playerId;
    if (match.endReason === 'opponent_left') return won ? '对手退出' : '已退出对局';
    if (match.endReason === 'board_locked') return won ? '对手棋盘锁死' : '棋盘锁死';
    if (match.endReason === 'petrified_lock') return '石化封锁';
    const tie = match.result?.tieBreaker;
    if (tie === 'score') return '时间结束 · 分数判定';
    if (tie === 'highest') return '时间结束 · 最高棋子判定';
    if (tie === 'usable_space') return '时间结束 · 可用空间判定';
    if (tie === 'draw') return '判定完全相同';
    return '对局结束';
  }

  lastServerMessage(): ServerMessage | undefined { return this.lastMessage; }

  private consume(state: Readonly<OnlineClientState>, message?: ServerMessage): void {
    this.lastMessage = message;
    if (state.status === 'connected' && this.pendingJoinCode && !state.room) {
      const code = this.pendingJoinCode;
      this.pendingJoinCode = null;
      this.client.joinRoom(code, this.playerName, this.selectedTheme, this.loadout);
    }
    if (message?.type === 'skill_event' && state.playerId) {
      this.controller.skill(message.event, state.playerId);
      if (message.event.targetId === state.playerId) this.platform.haptics.trigger('error');
    }

    if (state.match && state.playerId) {
      const authoritative = message?.type === 'match_start'
        || message?.type === 'match_state'
        || message?.type === 'match_end';
      if (state.match.matchId !== this.currentMatchId) {
        this.currentMatchId = state.match.matchId;
        this.controller.reset();
      }
      if (authoritative) {
        this.serverClockOffsetMs = state.match.serverTime - Date.now();
        this.controller.accept(state.match, state.playerId);
      }
    }

    if (state.status !== 'connected' && state.match?.phase === 'playing') this.controller.suspend();
    if (this.opened) this.emit();
  }

  private resolveMode(state: Readonly<OnlineClientState>): DouyinOnlineMode {
    if (state.match?.phase === 'finished') return 'result';
    if (state.match?.phase === 'playing') return 'playing';
    if (state.room) return 'room';
    if (state.matchmaking.status === 'searching' || state.matchmaking.status === 'matched') return 'matching';
    return 'lobby';
  }

  private loadLoadout(): SkillLoadout {
    try {
      const value = JSON.parse(this.platform.storage.getItem('doublefight-online-loadout') ?? 'null') as unknown;
      if (
        Array.isArray(value)
        && value.length === 3
        && value.every(item => typeof item === 'string' && item in SKILL_DEFINITIONS)
        && new Set(value).size === 3
      ) return [...value] as SkillLoadout;
    } catch { /* fall through */ }
    return [...DEFAULT_SKILL_LOADOUT];
  }

  private persistSetup(): void {
    this.platform.storage.setItem('doublefight-online-theme', this.selectedTheme);
    this.platform.storage.setItem('doublefight-online-loadout', JSON.stringify(this.loadout));
  }

  private emit(): void {
    this.changeListeners.forEach(listener => listener());
  }
}
