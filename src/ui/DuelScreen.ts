import type { BoardTile, Direction, MatchSnapshot, ServerMessage } from '../../shared/index';
import { MAX_BATTLE_ENERGY, predictMoveTiles } from '../../shared/index';
import { THEMES, type ThemeId } from '../config/themes';
import { OnlineClient, type OnlineClientState } from '../network/OnlineClient';
import { DuelScene } from '../rendering/DuelScene';

interface PendingMove {
  sequence: number;
  direction: Direction;
}

export class DuelScreen {
  private readonly root: HTMLElement;
  private readonly stage: HTMLElement;
  private readonly scene: DuelScene;
  private readonly localName: HTMLElement;
  private readonly localTheme: HTMLElement;
  private readonly localScore: HTMLElement;
  private readonly remoteName: HTMLElement;
  private readonly remoteTheme: HTMLElement;
  private readonly remoteScore: HTMLElement;
  private readonly localEnergy: HTMLElement;
  private readonly localEnergyFill: HTMLElement;
  private readonly localEnergyValue: HTMLElement;
  private readonly localEnergyGain: HTMLElement;
  private readonly remoteEnergy: HTMLElement;
  private readonly remoteEnergyFill: HTMLElement;
  private readonly remoteEnergyValue: HTMLElement;
  private readonly remoteEnergyGain: HTMLElement;
  private readonly roomCode: HTMLElement;
  private readonly latency: HTMLElement;
  private readonly connection: HTMLElement;
  private readonly reconnectOverlay: HTMLElement;
  private readonly result: HTMLElement;
  private readonly resultTitle: HTMLElement;
  private readonly resultDetail: HTMLElement;
  private readonly inputZone: HTMLElement;

  private pending: PendingMove[] = [];
  private predictedTiles: BoardTile[] = [];
  private predictedScore = 0;
  private pointerStart: { x: number; y: number; at: number } | null = null;
  private currentMatchId: string | null = null;
  private readonly lastEnergyByPlayer = new Map<string, number>();
  private pingTimer: number | null = null;
  private active = false;

  private onEnterHandler: (() => void) | null = null;
  private onExitHandler: (() => void) | null = null;

  constructor(
    container: HTMLElement,
    private readonly client: OnlineClient,
  ) {
    container.insertAdjacentHTML('beforeend', `
      <section class="duel duel--hidden" id="duel-screen" aria-hidden="true">
        <div class="duel__background"></div>
        <div class="duel__stage" id="duel-stage"></div>

        <header class="duel__header">
          <button id="duel-exit" class="duel__exit" type="button">← 退出</button>
          <div class="duel__brand">
            <strong>双数对决</strong>
            <span>ONLINE DUEL</span>
          </div>
          <div class="duel__net">
            <span id="duel-connection">在线</span>
            <b id="duel-latency">-- ms</b>
          </div>
        </header>

        <section class="duel-player duel-player--remote">
          <div>
            <small>对手</small>
            <strong id="duel-remote-name">等待对手</strong>
            <span id="duel-remote-theme">--</span>
          </div>
          <b><small>SCORE</small><strong id="duel-remote-score">0</strong></b>
        </section>

        <div class="duel-energy duel-energy--remote" id="duel-remote-energy">
          <div class="duel-energy__label"><span>ENERGY</span><b id="duel-remote-energy-value">0 / 100</b></div>
          <div class="duel-energy__track"><i id="duel-remote-energy-fill"></i></div>
          <em id="duel-remote-energy-gain"></em>
        </div>

        <div class="duel__versus">
          <i></i>
          <strong>VS</strong>
          <span>房间 <b id="duel-room-code">------</b></span>
          <i></i>
        </div>

        <section class="duel-player duel-player--local">
          <div>
            <small>我</small>
            <strong id="duel-local-name">玩家</strong>
            <span id="duel-local-theme">--</span>
          </div>
          <b><small>SCORE</small><strong id="duel-local-score">0</strong></b>
        </section>

        <div class="duel-energy duel-energy--local" id="duel-local-energy">
          <div class="duel-energy__label"><span>BATTLE ENERGY</span><b id="duel-local-energy-value">0 / 100</b></div>
          <div class="duel-energy__track"><i id="duel-local-energy-fill"></i></div>
          <em id="duel-local-energy-gain"></em>
        </div>

        <div class="duel__input-zone" id="duel-input-zone" aria-label="我的棋盘操作区"></div>
        <div class="duel__hint">在下方自己的棋盘滑动 · 对手棋盘实时同步</div>

        <div class="duel__reconnect duel__reconnect--hidden" id="duel-reconnect">
          <div class="duel__spinner"></div>
          <strong>网络波动</strong>
          <span>正在恢复对局…</span>
        </div>

        <div class="duel-result duel-result--hidden" id="duel-result">
          <div class="duel-result__card">
            <div class="duel-result__crest">⚔</div>
            <h2 id="duel-result-title">对局结束</h2>
            <p id="duel-result-detail"></p>
            <button id="duel-result-exit" type="button">返回房间</button>
          </div>
        </div>
      </section>`);

    this.root = container.querySelector('#duel-screen') as HTMLElement;
    this.stage = container.querySelector('#duel-stage') as HTMLElement;
    this.scene = new DuelScene(this.stage);
    this.localName = container.querySelector('#duel-local-name') as HTMLElement;
    this.localTheme = container.querySelector('#duel-local-theme') as HTMLElement;
    this.localScore = container.querySelector('#duel-local-score') as HTMLElement;
    this.remoteName = container.querySelector('#duel-remote-name') as HTMLElement;
    this.remoteTheme = container.querySelector('#duel-remote-theme') as HTMLElement;
    this.remoteScore = container.querySelector('#duel-remote-score') as HTMLElement;
    this.localEnergy = container.querySelector('#duel-local-energy') as HTMLElement;
    this.localEnergyFill = container.querySelector('#duel-local-energy-fill') as HTMLElement;
    this.localEnergyValue = container.querySelector('#duel-local-energy-value') as HTMLElement;
    this.localEnergyGain = container.querySelector('#duel-local-energy-gain') as HTMLElement;
    this.remoteEnergy = container.querySelector('#duel-remote-energy') as HTMLElement;
    this.remoteEnergyFill = container.querySelector('#duel-remote-energy-fill') as HTMLElement;
    this.remoteEnergyValue = container.querySelector('#duel-remote-energy-value') as HTMLElement;
    this.remoteEnergyGain = container.querySelector('#duel-remote-energy-gain') as HTMLElement;
    this.roomCode = container.querySelector('#duel-room-code') as HTMLElement;
    this.latency = container.querySelector('#duel-latency') as HTMLElement;
    this.connection = container.querySelector('#duel-connection') as HTMLElement;
    this.reconnectOverlay = container.querySelector('#duel-reconnect') as HTMLElement;
    this.result = container.querySelector('#duel-result') as HTMLElement;
    this.resultTitle = container.querySelector('#duel-result-title') as HTMLElement;
    this.resultDetail = container.querySelector('#duel-result-detail') as HTMLElement;
    this.inputZone = container.querySelector('#duel-input-zone') as HTMLElement;

    container.querySelector('#duel-exit')?.addEventListener('click', () => this.exit());
    container.querySelector('#duel-result-exit')?.addEventListener('click', () => this.exit());

    this.bindInput();
    this.client.subscribe((state, message) => this.consume(state, message));
  }

  onEnter(handler: () => void): void {
    this.onEnterHandler = handler;
  }

  onExit(handler: () => void): void {
    this.onExitHandler = handler;
  }

  hide(): void {
    this.active = false;
    this.root.classList.add('duel--hidden');
    this.root.setAttribute('aria-hidden', 'true');
    this.scene.setActive(false);
    if (this.pingTimer !== null) window.clearInterval(this.pingTimer);
    this.pingTimer = null;
  }

  private show(): void {
    if (!this.active) {
      this.active = true;
      this.root.classList.remove('duel--hidden');
      this.root.setAttribute('aria-hidden', 'false');
      this.scene.setActive(true);
      this.onEnterHandler?.();

      this.pingTimer = window.setInterval(() => {
        if (this.active) this.client.ping();
      }, 3_000);
      this.client.ping();
    }
  }

  private consume(state: Readonly<OnlineClientState>, message?: ServerMessage): void {
    this.latency.textContent = state.latencyMs === null ? '-- ms' : `${state.latencyMs} ms`;
    this.connection.textContent =
      state.status === 'connected' ? '在线' :
      state.status === 'reconnecting' ? '重连中' :
      state.status === 'connecting' ? '连接中' :
      '离线';

    const reconnecting = this.active && state.status !== 'connected';
    this.reconnectOverlay.classList.toggle('duel__reconnect--hidden', !reconnecting);

    if (!state.match || !state.playerId) return;

    if (state.match.matchId !== this.currentMatchId) {
      this.currentMatchId = state.match.matchId;
      this.pending = [];
      this.predictedTiles = [];
      this.lastEnergyByPlayer.clear();
      this.result.classList.add('duel-result--hidden');
    }

    if (message?.type === 'match_start' || state.match.phase === 'playing') {
      this.show();
    }

    if (message?.type === 'move_ack' && message.playerId === state.playerId) {
      this.updateEnergy(
        'local',
        message.playerId,
        message.energy,
        MAX_BATTLE_ENERGY,
        message.energyGain,
      );
    }

    this.reconcile(state.match, state.playerId);

    if (state.match.phase === 'finished') {
      this.showResult(state.match, state.playerId);
    }
  }

  private reconcile(snapshot: MatchSnapshot, playerId: string): void {
    const me = snapshot.players.find((player) => player.playerId === playerId);
    const opponent = snapshot.players.find((player) => player.playerId !== playerId);
    if (!me || !opponent) return;

    this.pending = this.pending.filter((move) => move.sequence > me.lastSequence);

    let predicted = me.board.tiles.map((tile) => ({ ...tile }));
    let predictedScore = me.board.score;

    for (const pending of this.pending) {
      const result = predictMoveTiles(predicted, pending.direction);
      if (!result.changed) continue;
      predicted = result.tiles;
      predictedScore += result.scoreDelta;
    }

    this.predictedTiles = predicted;
    this.predictedScore = predictedScore;

    this.localName.textContent = me.name;
    this.localTheme.textContent = THEMES[me.theme].label;
    this.localScore.textContent = predictedScore.toLocaleString('zh-CN');

    this.remoteName.textContent = opponent.name;
    this.remoteTheme.textContent = THEMES[opponent.theme].label;
    this.remoteScore.textContent = opponent.board.score.toLocaleString('zh-CN');

    this.updateEnergy('local', me.playerId, me.energy, me.maxEnergy);
    this.updateEnergy('remote', opponent.playerId, opponent.energy, opponent.maxEnergy);

    this.roomCode.textContent = snapshot.roomCode;

    this.scene.setBoard('local', predicted, me.theme as ThemeId);
    this.scene.setBoard('remote', opponent.board.tiles, opponent.theme as ThemeId);
  }

  private attemptMove(direction: Direction): void {
    if (!this.active || this.pending.length >= 3) return;

    const prediction = predictMoveTiles(this.predictedTiles, direction);
    if (!prediction.changed) {
      this.scene.nudge(direction);
      navigator.vibrate?.(6);
      return;
    }

    const sequence = this.client.move(direction);
    this.pending.push({ sequence, direction });
    this.predictedTiles = prediction.tiles;
    this.predictedScore += prediction.scoreDelta;

    const state = this.client.snapshot();
    const me = state.match?.players.find((player) => player.playerId === state.playerId);
    if (me) {
      this.localScore.textContent = this.predictedScore.toLocaleString('zh-CN');
      this.scene.setBoard('local', this.predictedTiles, me.theme as ThemeId);
    }

    navigator.vibrate?.(8);
  }

  private updateEnergy(
    role: 'local' | 'remote',
    playerId: string,
    energy: number,
    maxEnergy: number,
    explicitGain?: number,
  ): void {
    const safeMax = Math.max(1, maxEnergy);
    const clamped = Math.max(0, Math.min(safeMax, energy));
    const previous = this.lastEnergyByPlayer.get(playerId);
    const inferredGain = previous === undefined ? 0 : Math.max(0, clamped - previous);
    const gain = explicitGain ?? inferredGain;
    this.lastEnergyByPlayer.set(playerId, clamped);

    const root = role === 'local' ? this.localEnergy : this.remoteEnergy;
    const fill = role === 'local' ? this.localEnergyFill : this.remoteEnergyFill;
    const value = role === 'local' ? this.localEnergyValue : this.remoteEnergyValue;
    const gainLabel = role === 'local' ? this.localEnergyGain : this.remoteEnergyGain;
    const ratio = clamped / safeMax;

    fill.style.width = `${(ratio * 100).toFixed(1)}%`;
    value.textContent = `${clamped} / ${safeMax}`;
    root.classList.toggle('duel-energy--full', clamped >= safeMax);

    if (gain > 0 && this.active) {
      gainLabel.textContent = `+${gain}`;
      gainLabel.classList.remove('duel-energy__gain--show');
      void gainLabel.offsetWidth;
      gainLabel.classList.add('duel-energy__gain--show');

      root.classList.remove('duel-energy--pulse');
      void root.offsetWidth;
      root.classList.add('duel-energy--pulse');
      this.scene.pulseEnergy(role, gain);
      navigator.vibrate?.(gain >= 20 ? [10, 8, 18] : gain >= 8 ? 12 : 7);
    }
  }

  private bindInput(): void {
    this.inputZone.addEventListener('pointerdown', (event) => {
      if (!event.isPrimary || !this.active) return;
      this.pointerStart = { x: event.clientX, y: event.clientY, at: performance.now() };
      this.inputZone.setPointerCapture?.(event.pointerId);
    });

    this.inputZone.addEventListener('pointerup', (event) => {
      if (!this.pointerStart || !this.active) return;
      const dx = event.clientX - this.pointerStart.x;
      const dy = event.clientY - this.pointerStart.y;
      const elapsed = performance.now() - this.pointerStart.at;
      this.pointerStart = null;

      const distance = Math.hypot(dx, dy);
      const threshold = elapsed < 180 ? 22 : 30;
      if (distance < threshold) return;

      if (Math.abs(dx) > Math.abs(dy)) this.attemptMove(dx > 0 ? 'right' : 'left');
      else this.attemptMove(dy > 0 ? 'down' : 'up');
    });

    this.inputZone.addEventListener('pointercancel', () => {
      this.pointerStart = null;
    });

    this.inputZone.addEventListener('contextmenu', (event) => event.preventDefault());
  }

  private showResult(snapshot: MatchSnapshot, playerId: string): void {
    const me = snapshot.players.find((player) => player.playerId === playerId);
    const opponent = snapshot.players.find((player) => player.playerId !== playerId);
    const won = snapshot.winnerId === playerId;
    const draw = snapshot.winnerId === null;

    this.resultTitle.textContent = draw ? '平局' : won ? '胜利' : '惜败';
    const reason =
      snapshot.endReason === 'board_locked'
        ? (won ? '对手棋盘已无法移动。' : '你的棋盘已无法移动。')
        : snapshot.endReason === 'opponent_left'
          ? '对手已离开房间。'
          : '对局已经结束。';

    this.resultDetail.textContent = `${reason} 你 ${me?.board.score ?? 0} · 对手 ${opponent?.board.score ?? 0}`;
    this.result.classList.remove('duel-result--hidden');
  }

  private exit(): void {
    this.client.leaveRoom();
    this.currentMatchId = null;
    this.pending = [];
    this.predictedTiles = [];
    this.lastEnergyByPlayer.clear();
    this.scene.clear();
    this.hide();
    this.result.classList.add('duel-result--hidden');
    this.onExitHandler?.();
  }
}
