import { OnlineController } from '../battle/OnlineController';
import type {
  Direction,
  MatchPlayerState,
  MatchResultPlayer,
  MatchSnapshot,
  ServerMessage,
  SkillEvent,
  SkillId,
  SkillLoadout,
} from '../../shared/index';
import {
  MAX_BATTLE_ENERGY,
  SKILL_DEFINITIONS,
} from '../../shared/index';
import { THEMES } from '../config/themes';
import { OnlineClient, type OnlineClientState } from '../network/OnlineClient';
import { DuelScene } from '../rendering/DuelScene';

type SkillButtonView = {
  button: HTMLButtonElement;
  cost: HTMLElement;
  cooldown: HTMLElement;
};

export class DuelScreen {
  private readonly root: HTMLElement;
  private readonly stage: HTMLElement;
  private readonly scene: DuelScene;
  private readonly roundTimer: HTMLElement;
  private readonly localName: HTMLElement;
  private readonly localTheme: HTMLElement;
  private readonly localScore: HTMLElement;
  private readonly localStatus: HTMLElement;
  private readonly remoteName: HTMLElement;
  private readonly remoteTheme: HTMLElement;
  private readonly remoteScore: HTMLElement;
  private readonly remoteStatus: HTMLElement;
  private readonly localEnergy: HTMLElement;
  private readonly localEnergyFill: HTMLElement;
  private readonly localEnergyValue: HTMLElement;
  private readonly localEnergyGain: HTMLElement;
  private readonly remoteEnergy: HTMLElement;
  private readonly remoteEnergyFill: HTMLElement;
  private readonly remoteEnergyValue: HTMLElement;
  private readonly remoteEnergyGain: HTMLElement;
  private readonly latency: HTMLElement;
  private readonly connection: HTMLElement;
  private readonly reconnectOverlay: HTMLElement;
  private readonly result: HTMLElement;
  private readonly resultTitle: HTMLElement;
  private readonly resultDetail: HTMLElement;
  private readonly resultRule: HTMLElement;
  private readonly resultLocalScore: HTMLElement;
  private readonly resultLocalMeta: HTMLElement;
  private readonly resultRemoteScore: HTMLElement;
  private readonly resultRemoteMeta: HTMLElement;
  private readonly rematchButton: HTMLButtonElement;
  private readonly rematchStatus: HTMLElement;
  private readonly inputZone: HTMLElement;
  private readonly skillToast: HTMLElement;
  private readonly skillDock: HTMLElement;
  private readonly skillFx: HTMLElement;
  private readonly skillButtons = new Map<SkillId, SkillButtonView>();

  private readonly controller: OnlineController;
  private pointerStart: { x: number; y: number; at: number } | null = null;
  private currentMatchId: string | null = null;
  private readonly lastEnergyByPlayer = new Map<string, number>();
  private lastRenderedLoadout = '';
  private serverClockOffsetMs = 0;
  private pingTimer: number | null = null;
  private skillUiTimer: number | null = null;
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
          <section class="battle-score battle-score--local" aria-label="我的分数">
            <span id="duel-local-name">玩家</span><strong id="duel-local-score">0</strong>
            <span class="sr-only" id="duel-local-theme"></span>
          </section>
          <b id="duel-round-timer" class="duel__round-timer" aria-label="剩余时间">03:00</b>
          <section class="battle-score battle-score--remote" aria-label="对手分数">
            <span id="duel-remote-name">等待对手</span><strong id="duel-remote-score">0</strong>
            <span class="sr-only" id="duel-remote-theme"></span>
          </section>
        </header>
        <button id="duel-exit" class="duel__exit" type="button" aria-label="退出对局">←</button>
        <details class="duel__net"><summary id="duel-connection" aria-label="网络状态">◉</summary><b id="duel-latency"></b></details>
        <div class="battle-status battle-status--remote" id="duel-remote-status" role="status"></div>
        <div class="battle-status battle-status--local" id="duel-local-status" role="status"></div>

        <div class="duel-energy duel-energy--remote" id="duel-remote-energy">
          <div class="duel-energy__label sr-only"><span>对手能量</span><b id="duel-remote-energy-value">0 / 100</b></div>
          <div class="duel-energy__track"><i id="duel-remote-energy-fill"></i></div>
          <em id="duel-remote-energy-gain"></em>
        </div>

        <footer class="battle-dock">
        <div class="duel-energy duel-energy--local" id="duel-local-energy">
          <div class="duel-energy__label"><span>⚡</span><b id="duel-local-energy-value">0 / 100</b></div>
          <div class="duel-energy__track"><i id="duel-local-energy-fill"></i></div>
          <em id="duel-local-energy-gain"></em>
        </div>

        <div class="duel-skills" id="duel-skills"></div>
        </footer>

        <div class="duel__input-zone" id="duel-input-zone" aria-label="我的棋盘操作区"></div>
        <div class="duel-skill-toast" id="duel-skill-toast"></div>
        <div class="duel-skill-fx" id="duel-skill-fx"><span></span><b></b></div>

        <div class="duel__reconnect duel__reconnect--hidden" id="duel-reconnect">
          <div class="duel__spinner"></div>
          <strong>网络波动</strong>
          <span>对局计时继续 · 正在恢复连接…</span>
        </div>

        <div class="duel-result duel-result--hidden" id="duel-result">
          <div class="duel-result__card">
            <div class="duel-result__crest">⚔</div>
            <h2 id="duel-result-title">对局结束</h2>
            <p id="duel-result-detail"></p>

            <div class="duel-result__stats">
              <div class="duel-result__player duel-result__player--me">
                <span>我</span>
                <strong id="duel-result-local-score">0</strong>
                <small id="duel-result-local-meta">最高 2 · 空格 0</small>
              </div>
              <b>VS</b>
              <div class="duel-result__player">
                <span>对手</span>
                <strong id="duel-result-remote-score">0</strong>
                <small id="duel-result-remote-meta">最高 2 · 空格 0</small>
              </div>
            </div>

            <div class="duel-result__rule" id="duel-result-rule"></div>
            <button id="duel-rematch" class="duel-result__rematch" type="button">再来一局</button>
            <div class="duel-result__rematch-status" id="duel-rematch-status"></div>
            <button id="duel-result-leave" class="duel-result__leave" type="button">离开房间</button>
          </div>
        </div>
      </section>`);

    this.root = container.querySelector('#duel-screen') as HTMLElement;
    this.stage = container.querySelector('#duel-stage') as HTMLElement;
    this.scene = new DuelScene(this.stage);
    this.controller = new OnlineController(this.scene.local, this.scene.remote);
    this.roundTimer = container.querySelector('#duel-round-timer') as HTMLElement;
    this.localName = container.querySelector('#duel-local-name') as HTMLElement;
    this.localTheme = container.querySelector('#duel-local-theme') as HTMLElement;
    this.localScore = container.querySelector('#duel-local-score') as HTMLElement;
    this.localStatus = container.querySelector('#duel-local-status') as HTMLElement;
    this.remoteName = container.querySelector('#duel-remote-name') as HTMLElement;
    this.remoteTheme = container.querySelector('#duel-remote-theme') as HTMLElement;
    this.remoteScore = container.querySelector('#duel-remote-score') as HTMLElement;
    this.remoteStatus = container.querySelector('#duel-remote-status') as HTMLElement;
    this.localEnergy = container.querySelector('#duel-local-energy') as HTMLElement;
    this.localEnergyFill = container.querySelector('#duel-local-energy-fill') as HTMLElement;
    this.localEnergyValue = container.querySelector('#duel-local-energy-value') as HTMLElement;
    this.localEnergyGain = container.querySelector('#duel-local-energy-gain') as HTMLElement;
    this.remoteEnergy = container.querySelector('#duel-remote-energy') as HTMLElement;
    this.remoteEnergyFill = container.querySelector('#duel-remote-energy-fill') as HTMLElement;
    this.remoteEnergyValue = container.querySelector('#duel-remote-energy-value') as HTMLElement;
    this.remoteEnergyGain = container.querySelector('#duel-remote-energy-gain') as HTMLElement;
    this.latency = container.querySelector('#duel-latency') as HTMLElement;
    this.connection = container.querySelector('#duel-connection') as HTMLElement;
    this.reconnectOverlay = container.querySelector('#duel-reconnect') as HTMLElement;
    this.result = container.querySelector('#duel-result') as HTMLElement;
    this.resultTitle = container.querySelector('#duel-result-title') as HTMLElement;
    this.resultDetail = container.querySelector('#duel-result-detail') as HTMLElement;
    this.resultRule = container.querySelector('#duel-result-rule') as HTMLElement;
    this.resultLocalScore = container.querySelector('#duel-result-local-score') as HTMLElement;
    this.resultLocalMeta = container.querySelector('#duel-result-local-meta') as HTMLElement;
    this.resultRemoteScore = container.querySelector('#duel-result-remote-score') as HTMLElement;
    this.resultRemoteMeta = container.querySelector('#duel-result-remote-meta') as HTMLElement;
    this.rematchButton = container.querySelector('#duel-rematch') as HTMLButtonElement;
    this.rematchStatus = container.querySelector('#duel-rematch-status') as HTMLElement;
    this.inputZone = container.querySelector('#duel-input-zone') as HTMLElement;
    this.skillToast = container.querySelector('#duel-skill-toast') as HTMLElement;
    this.skillDock = container.querySelector('#duel-skills') as HTMLElement;
    this.skillFx = container.querySelector('#duel-skill-fx') as HTMLElement;

    this.skillDock.addEventListener('click', (event) => {
      const button = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-skill]');
      if (!button?.dataset.skill) return;
      this.castSkill(button.dataset.skill as SkillId);
    });

    this.rematchButton.addEventListener('click', () => this.toggleRematch());
    container.querySelector('#duel-exit')?.addEventListener('click', () => this.exit());
    container.querySelector('#duel-result-leave')?.addEventListener('click', () => this.exit());

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
    if (this.skillUiTimer !== null) window.clearInterval(this.skillUiTimer);
    this.pingTimer = null;
    this.skillUiTimer = null;
  }

  private show(): void {
    if (this.active) return;

    this.active = true;
    this.root.classList.remove('duel--hidden');
    this.root.setAttribute('aria-hidden', 'false');
    this.scene.setActive(true);
    this.onEnterHandler?.();

    this.pingTimer = window.setInterval(() => {
      if (this.active) this.client.ping();
    }, 3_000);

    this.skillUiTimer = window.setInterval(() => {
      if (!this.active) return;
      this.refreshSkillButtons();
      this.refreshRoundTimer();
      this.refreshRematchState(this.client.snapshot());
    }, 100);

    this.client.ping();
  }

  private consume(state: Readonly<OnlineClientState>, message?: ServerMessage): void {
    this.latency.textContent = state.latencyMs === null ? '-- ms' : `${state.latencyMs} ms`;
    this.latency.classList.toggle('is-warn', state.latencyMs !== null && state.latencyMs >= 160);
    this.latency.classList.toggle('is-bad', state.latencyMs !== null && state.latencyMs >= 260);
    const netState = state.status !== 'connected' || (state.latencyMs ?? 0) >= 260 ? 'bad' : (state.latencyMs ?? 0) >= 160 ? 'warn' : 'ok';
    this.connection.dataset.quality = netState;
    this.connection.setAttribute('aria-label', netState === 'ok' ? '网络正常，查看延迟' : '网络波动，查看延迟');

    const reconnecting = this.active && state.status !== 'connected';
    if (state.status !== 'connected') this.controller.suspend();
    this.reconnectOverlay.classList.toggle('duel__reconnect--hidden', !reconnecting);

    if (message?.type === 'error' && this.active) {
      this.showSkillToast(message.message, true);
    }

    if (message?.type === 'skill_event' && state.playerId) {
      this.controller.skill(message.event, state.playerId);
      this.playSkillEvent(message.event, state.playerId);
    }

    if (!state.match || !state.playerId) {
      this.refreshRematchState(state);
      return;
    }

    const authoritative = message?.type === 'match_start' || message?.type === 'match_state' || message?.type === 'match_end';
    if (authoritative) this.serverClockOffsetMs = state.match.serverTime - Date.now();

    if (state.match.matchId !== this.currentMatchId) {
      this.currentMatchId = state.match.matchId;
      this.controller.reset();
      this.lastEnergyByPlayer.clear();
      this.result.classList.add('duel-result--hidden');
      this.rematchStatus.textContent = '';
      this.scene.clear();
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

    if (authoritative) this.controller.accept(state.match, state.playerId);
    this.renderSnapshot(state.match, state.playerId);
    this.refreshRoundTimer();

    if (state.match.phase === 'finished') {
      this.showResult(state.match, state.playerId);
      this.refreshRematchState(state);
    }
  }

  private renderSnapshot(snapshot: MatchSnapshot, playerId: string): void {
    const me = snapshot.players.find((player) => player.playerId === playerId);
    const opponent = snapshot.players.find((player) => player.playerId !== playerId);
    if (!me) return;

    this.renderSkillDock(me.loadout);
    this.localName.textContent = me.name;
    this.localTheme.textContent = THEMES[me.theme].label;
    this.localScore.textContent = this.controller.predictedScore.toLocaleString('zh-CN');

    if (opponent) {
      this.remoteName.textContent = opponent.name;
      this.remoteTheme.textContent = THEMES[opponent.theme].label;
      this.remoteScore.textContent = opponent.board.score.toLocaleString('zh-CN');
      this.remoteStatus.textContent = statusText(opponent, this.serverNow());
      this.updateEnergy('remote', opponent.playerId, opponent.energy, opponent.maxEnergy);
    }

    this.localStatus.textContent = statusText(me, this.serverNow());
    this.updateEnergy('local', me.playerId, me.energy, me.maxEnergy);


    this.refreshSkillButtons();
  }

  private attemptMove(direction: Direction): void {
    const state = this.client.snapshot();
    if (!this.active || state.status !== 'connected' || state.match?.phase !== 'playing') return;
    if (this.controller.move(direction, move => this.client.move(move))) {
      this.localScore.textContent = this.controller.predictedScore.toLocaleString('zh-CN');
    }
  }

  private castSkill(skillId: SkillId): void {
    if (!this.active) return;
    const state = this.client.snapshot();
    if (state.match?.phase !== 'playing') return;
    const me = state.match.players.find((player) => player.playerId === state.playerId);
    if (!me) return;

    if (!me.loadout.includes(skillId)) return;

    const definition = SKILL_DEFINITIONS[skillId];
    const remaining = Math.max(0, me.skillCooldowns[skillId] - this.serverNow());
    if (remaining > 0) {
      this.showSkillToast(`${definition.shortLabel}冷却中`, true);
      return;
    }
    if (me.energy < definition.cost) {
      this.showSkillToast(`能量不足 · 需要 ${definition.cost}`, true);
      return;
    }
    if (skillId === 'shield' && me.shieldActive) {
      this.showSkillToast('护盾已经激活', true);
      return;
    }
    if (skillId === 'purify' && me.board.blockedCells.length === 0) {
      this.showSkillToast('当前没有需要解除的石化', true);
      return;
    }

    this.controller.previewSkill(skillId, id => this.client.castSkill(id));
    this.showSkillToast(`${definition.shortLabel} · 释放！`);
    navigator.vibrate?.([10, 5, 14]);
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

  private refreshSkillButtons(): void {
    const state = this.client.snapshot();
    const me = state.match?.players.find((player) => player.playerId === state.playerId);
    const opponent = state.match?.players.find((player) => player.playerId !== state.playerId);
    if (!me) return;

    const now = this.serverNow();
    const matchPlaying = state.match?.phase === 'playing';
    this.localStatus.textContent = statusText(me, now);
    this.localStatus.setAttribute('aria-label', statusLabel(me, now));
    if (opponent) {
      this.remoteStatus.textContent = statusText(opponent, now);
      this.remoteStatus.setAttribute('aria-label', statusLabel(opponent, now));
    }

    for (const [skillId, view] of this.skillButtons) {
      const definition = SKILL_DEFINITIONS[skillId];
      const remaining = Math.max(0, me.skillCooldowns[skillId] - now);
      const cooling = remaining > 0;
      const blockedByState = skillId === 'shield' && me.shieldActive;
      const noPurifyTarget = skillId === 'purify' && me.board.blockedCells.length === 0;
      const affordable = me.energy >= definition.cost;

      view.button.disabled =
        !matchPlaying || cooling || blockedByState || noPurifyTarget || !affordable || !me.connected;
      view.button.classList.toggle('duel-skill--ready', !view.button.disabled);
      view.button.classList.toggle('duel-skill--active', blockedByState);
      view.cost.textContent = blockedByState ? '◆' : String(definition.cost);
      view.button.style.setProperty('--cooldown', `${Math.min(1, remaining / definition.cooldownMs) * 100}%`);
      view.button.setAttribute('aria-label', `${definition.shortLabel}，${cooling ? `冷却 ${Math.ceil(remaining / 1000)} 秒` : blockedByState ? '护盾已激活' : !affordable ? '能量不足' : noPurifyTarget ? '无需净化' : '消耗 ' + definition.cost + ' 能量'}`);
      view.cooldown.textContent = cooling ? `${(remaining / 1000).toFixed(1)}s` : '';
    }
  }

  private renderSkillDock(loadout: SkillLoadout): void {
    const signature = loadout.join('|');
    if (signature === this.lastRenderedLoadout) return;
    this.lastRenderedLoadout = signature;
    this.skillButtons.clear();
    this.skillDock.innerHTML = loadout.map((skillId, index) => skillButtonHtml(skillId, index)).join('');

    this.skillDock.querySelectorAll<HTMLButtonElement>('[data-skill]').forEach((button) => {
      const skillId = button.dataset.skill as SkillId;
      this.skillButtons.set(skillId, {
        button,
        cost: button.querySelector('[data-role="cost"]') as HTMLElement,
        cooldown: button.querySelector('[data-role="cooldown"]') as HTMLElement,
      });
    });
  }

  private refreshRoundTimer(): void {
    const snapshot = this.client.snapshot().match;
    if (!snapshot) return;

    const remaining =
      snapshot.phase === 'finished'
        ? 0
        : Math.max(0, snapshot.roundEndsAt - this.serverNow());
    const totalSeconds = Math.ceil(remaining / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;

    this.roundTimer.textContent = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    this.roundTimer.classList.toggle('duel__round-timer--danger', totalSeconds > 0 && totalSeconds <= 10);
  }

  private playSkillEvent(event: SkillEvent, playerId: string): void {
    const casterIsLocal = event.casterId === playerId;
    const targetIsLocal = event.targetId === playerId;
    const definition = SKILL_DEFINITIONS[event.skillId];

    let text = '';
    if (event.skillId === 'petrify') {
      text = event.outcome === 'shielded'
        ? casterIsLocal ? '对方护盾挡住石化！' : '护盾爆裂 · 石化被抵消！'
        : casterIsLocal ? '命中！对手一枚棋子被冻结 6 秒' : '受击！一枚棋子被冻结 6 秒';
    } else if (event.skillId === 'shield') {
      text = casterIsLocal ? '护盾展开 · 可抵消下一次石化' : '对手展开了护盾';
    } else if (event.skillId === 'random_clear') {
      text = casterIsLocal ? '清除成功 · 腾出棋盘空间' : '对手使用了清块';
    } else if (event.skillId === 'shuffle') {
      text = casterIsLocal ? '乾坤挪移 · 棋盘重新排列' : '对手重排了棋盘';
    } else if (event.skillId === 'purify') {
      text = casterIsLocal ? '净化完成 · 石化解除' : '对手解除了石化';
    }

    this.showSkillToast(text);

    const icon = this.skillFx.querySelector('span');
    const caption = this.skillFx.querySelector('b');
    if (icon) icon.textContent = event.outcome === 'shielded' ? '◆' : definition.icon;
    if (caption) caption.textContent = text;

    this.skillFx.className = 'duel-skill-fx';
    void this.skillFx.offsetWidth;
    this.skillFx.classList.add(
      targetIsLocal ? 'duel-skill-fx--impact-local' : 'duel-skill-fx--impact-remote',
    );

    navigator.vibrate?.(
      event.outcome === 'shielded'
        ? [22, 8, 18]
        : targetIsLocal ? [25, 10, 32] : [14, 6, 18],
    );
  }

  private showSkillToast(message: string, error = false): void {
    this.skillToast.textContent = message;
    this.skillToast.classList.toggle('duel-skill-toast--error', error);
    this.skillToast.classList.remove('duel-skill-toast--show');
    void this.skillToast.offsetWidth;
    this.skillToast.classList.add('duel-skill-toast--show');
  }

  private serverNow(): number {
    return Date.now() + this.serverClockOffsetMs;
  }

  private bindInput(): void {
    window.addEventListener('keydown', event => {
      if (!this.active || (event.target instanceof HTMLElement && event.target.matches('input,textarea,[contenteditable="true"]'))) return;
      const direction = ({ ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down', a: 'left', d: 'right', w: 'up', s: 'down' } as Record<string, Direction>)[event.key.length === 1 ? event.key.toLowerCase() : event.key];
      if (direction) { event.preventDefault(); this.attemptMove(direction); }
      const slot = Number(event.key) - 1;
      const state = this.client.snapshot();
      const me = state.match?.players.find(player => player.playerId === state.playerId);
      if (slot >= 0 && slot < 3 && me) { event.preventDefault(); this.castSkill(me.loadout[slot]); }
    });
    this.inputZone.addEventListener('pointerdown', (event) => {
      if (!event.isPrimary || !this.active) return;
      this.pointerStart = { x: event.clientX, y: event.clientY, at: performance.now() };
      this.inputZone.setPointerCapture?.(event.pointerId);
    });

    this.inputZone.addEventListener('pointermove', event => {
      if (this.pointerStart && this.active) this.scene.local.setGesture(event.clientX - this.pointerStart.x, event.clientY - this.pointerStart.y);
    });

    this.inputZone.addEventListener('pointerup', (event) => {
      if (!this.pointerStart || !this.active) return;
      const dx = event.clientX - this.pointerStart.x;
      const dy = event.clientY - this.pointerStart.y;
      const elapsed = performance.now() - this.pointerStart.at;
      this.pointerStart = null;
      this.scene.local.clearGesture();

      const distance = Math.hypot(dx, dy);
      const threshold = elapsed < 180 ? 16 : 22;
      if (distance < threshold) return;

      if (Math.abs(dx) > Math.abs(dy)) this.attemptMove(dx > 0 ? 'right' : 'left');
      else this.attemptMove(dy > 0 ? 'down' : 'up');
    });

    this.inputZone.addEventListener('pointercancel', () => {
      this.pointerStart = null;
      this.scene.local.clearGesture();
    });

    this.inputZone.addEventListener('contextmenu', (event) => event.preventDefault());
  }

  private showResult(snapshot: MatchSnapshot, playerId: string): void {
    const result = snapshot.result;
    const me = result?.players.find((player) => player.playerId === playerId)
      ?? resultPlayerFromSnapshot(snapshot, playerId);
    const opponent = result?.players.find((player) => player.playerId !== playerId)
      ?? resultPlayerFromSnapshot(snapshot, snapshot.players.find((player) => player.playerId !== playerId)?.playerId ?? '');

    const won = snapshot.winnerId === playerId;
    const draw = snapshot.winnerId === null;

    this.resultTitle.textContent = draw ? '平局' : won ? '胜利' : '惜败';
    this.resultDetail.textContent = resultReason(snapshot, playerId);

    this.resultLocalScore.textContent = (me?.score ?? 0).toLocaleString('zh-CN');
    this.resultLocalMeta.textContent =
      `最高 ${me?.highest ?? 2} · 可用空格 ${me?.usableEmptyCells ?? 0}`;
    this.resultRemoteScore.textContent = (opponent?.score ?? 0).toLocaleString('zh-CN');
    this.resultRemoteMeta.textContent =
      `最高 ${opponent?.highest ?? 2} · 可用空格 ${opponent?.usableEmptyCells ?? 0}`;
    this.resultRule.textContent = resultRuleText(snapshot);

    this.result.classList.remove('duel-result--hidden');
  }

  private toggleRematch(): void {
    const state = this.client.snapshot();
    if (state.match?.phase !== 'finished' || !state.room || !state.playerId) return;
    const me = state.room.players.find((player) => player.id === state.playerId);
    if (!me) return;
    this.client.setRematchReady(!me.rematchReady);
  }

  private refreshRematchState(state: Readonly<OnlineClientState>): void {
    if (!this.active || state.match?.phase !== 'finished' || !state.room || !state.playerId) return;

    const me = state.room.players.find((player) => player.id === state.playerId);
    const opponent = state.room.players.find((player) => player.id !== state.playerId);

    if (!me || !opponent) {
      this.rematchButton.disabled = true;
      this.rematchButton.textContent = '对手已离开';
      this.rematchStatus.textContent = '需要两名玩家才能再来一局';
      return;
    }

    this.rematchButton.disabled = state.status !== 'connected';
    this.rematchButton.textContent = me.rematchReady ? '取消再来一局' : '再来一局';

    if (me.rematchReady && opponent.rematchReady) {
      this.rematchStatus.textContent = '双方已准备 · 正在开始新对局…';
    } else if (me.rematchReady) {
      this.rematchStatus.textContent = '已准备 · 等待对手';
    } else if (opponent.rematchReady) {
      this.rematchStatus.textContent = '对手想再来一局';
    } else {
      this.rematchStatus.textContent = '双方确认后直接在当前房间开下一局';
    }
  }

  private exit(): void {
    this.client.leaveRoom();
    this.currentMatchId = null;
    this.controller.reset();
    this.lastEnergyByPlayer.clear();
    this.scene.clear();
    this.hide();
    this.result.classList.add('duel-result--hidden');
    this.onExitHandler?.();
  }
}

function skillButtonHtml(skillId: SkillId, index: number): string {
  const definition = SKILL_DEFINITIONS[skillId];
  return `
    <button class="duel-skill" data-skill="${skillId}" type="button" aria-label="${definition.shortLabel}" aria-keyshortcuts="${index + 1}">
      <span class="duel-skill__icon">${definition.icon}</span>
      <strong>${definition.shortLabel}</strong>
      <small data-role="cost">${definition.cost}⚡</small>
      <b data-role="cooldown"></b>
    </button>`;
}

function statusText(player: MatchPlayerState, now: number): string {
  const labels: string[] = [];
  if (player.shieldActive) labels.push('◆');
  if (player.petrifyExpiresAt > now) {
    labels.push(`❄ ${Math.ceil(Math.max(0, (player.petrifyExpiresAt - now) / 1000))}s`);
  }
  return labels.join(' · ');
}

function statusLabel(player: MatchPlayerState, now: number): string {
  return [player.shieldActive ? '护盾已激活' : '', player.petrifyExpiresAt > now ? `石化剩余 ${Math.ceil((player.petrifyExpiresAt - now) / 1000)} 秒` : ''].filter(Boolean).join('，');
}

function resultPlayerFromSnapshot(
  snapshot: MatchSnapshot,
  playerId: string,
): MatchResultPlayer | null {
  const player = snapshot.players.find((entry) => entry.playerId === playerId);
  if (!player) return null;
  return {
    playerId: player.playerId,
    name: player.name,
    theme: player.theme,
    score: player.board.score,
    highest: player.board.highest,
    usableEmptyCells: Math.max(
      0,
      16 - player.board.tiles.length - player.board.blockedCells.length,
    ),
  };
}

function resultReason(snapshot: MatchSnapshot, playerId: string): string {
  const won = snapshot.winnerId === playerId;

  if (snapshot.endReason === 'board_locked') {
    return won ? '对手棋盘无法继续移动，你提前获胜。' : '你的棋盘无法继续移动，对局提前结束。';
  }
  if (snapshot.endReason === 'petrified_lock') {
    return won ? '石化封死了对手最后的可用空间。' : '最后的可用空间被石化封锁。';
  }
  if (snapshot.endReason === 'opponent_left') {
    return '对手离开房间，对局结束。';
  }
  if (snapshot.endReason === 'time_limit') {
    if (snapshot.result?.tieBreaker === 'draw') return '180 秒结束，所有判定项完全相同。';
    return won ? '180 秒结束，你在最终判定中领先。' : '180 秒结束，对手在最终判定中领先。';
  }
  return '对局已经结束。';
}

function resultRuleText(snapshot: MatchSnapshot): string {
  if (snapshot.endReason !== 'time_limit') {
    return '提前结束：棋盘锁死 / 石化击杀 / 对手离开';
  }

  const tieBreaker = snapshot.result?.tieBreaker;
  if (tieBreaker === 'score') return '时间到 · 按 SCORE 判胜';
  if (tieBreaker === 'highest') return 'SCORE 相同 · 按最高棋子判胜';
  if (tieBreaker === 'usable_space') return 'SCORE 与最高棋子相同 · 按可用空格判胜';
  if (tieBreaker === 'draw') return 'SCORE / 最高棋子 / 可用空格全部相同 · 平局';
  return '时间到 · 服务器结算';
}
