import {
  DEFAULT_SKILL_LOADOUT,
  SKILL_DEFINITIONS,
  type SkillId,
  type SkillLoadout,
} from '../../shared/index';
import type { ThemeId } from '../config/themes';
import { THEMES } from '../config/themes';
import { OnlineClient, type OnlineClientState } from '../network/OnlineClient';

const SKILL_ORDER: SkillId[] = ['random_clear', 'shield', 'petrify', 'shuffle', 'purify'];

export class OnlineLobby {
  private readonly root: HTMLElement;
  private readonly status: HTMLElement;
  private readonly matchmakingPanel: HTMLElement;
  private readonly matchmakingTime: HTMLElement;
  private readonly matchmakingQueue: HTMLElement;
  private readonly matchButton: HTMLButtonElement;
  private readonly cancelMatchButton: HTMLButtonElement;
  private readonly roomPanel: HTMLElement;
  private readonly roomCode: HTMLElement;
  private readonly players: HTMLElement;
  private readonly readyButton: HTMLButtonElement;
  private readonly createButton: HTMLButtonElement;
  private readonly joinButton: HTMLButtonElement;
  private readonly joinInput: HTMLInputElement;
  private readonly nameInput: HTMLInputElement;
  private readonly error: HTMLElement;
  private readonly themeButtons: HTMLButtonElement[];
  private readonly loadoutSlots: HTMLButtonElement[];
  private readonly skillCards: HTMLButtonElement[];

  private currentTheme: ThemeId = 'kingdom';
  private loadout: SkillLoadout = [...DEFAULT_SKILL_LOADOUT];
  private activeSlot = 0;
  private onCloseHandler: (() => void) | null = null;

  constructor(
    container: HTMLElement,
    private readonly client: OnlineClient,
    endpointConfigured: boolean,
  ) {
    container.insertAdjacentHTML('beforeend', `
      <section class="online-lobby online-lobby--hidden" id="online-lobby" aria-hidden="true">
        <div class="online-lobby__backdrop"></div>
        <div class="online-lobby__sheet online-lobby__sheet--v27">
          <div class="online-lobby__top">
            <button class="online-lobby__back" id="online-back" type="button">← 主题岛</button>
            <div>
              <div class="online-lobby__eyebrow">DOUBLE FIGHT · ONLINE</div>
              <h2>配置你的对决</h2>
            </div>
            <span class="online-lobby__dot" id="online-dot"></span>
          </div>

          <div class="online-lobby__status" id="online-status">${endpointConfigured ? '准备连接服务器' : '联机服务器尚未配置'}</div>

          <label class="online-lobby__name">
            <span>昵称</span>
            <input id="online-name" maxlength="16" autocomplete="nickname" value="玩家" />
          </label>

          <section class="online-setup">
            <div class="online-setup__head">
              <div><small>THEME</small><strong>选择战场主题</strong></div>
              <span>双方可使用不同主题</span>
            </div>
            <div class="online-theme-grid">
              <button type="button" data-theme-choice="kingdom">
                <i>🏰</i><b>微缩王国</b><small>草地 · 城堡 · 晶能</small>
              </button>
              <button type="button" data-theme-choice="palace">
                <i>🏯</i><b>后宫晋升</b><small>宫廷 · 玉石 · 金漆</small>
              </button>
            </div>
          </section>

          <section class="online-setup online-loadout">
            <div class="online-setup__head">
              <div><small>LOADOUT</small><strong>3 个技能槽</strong></div>
              <span>点槽位，再点下方技能替换</span>
            </div>

            <div class="online-loadout__slots">
              ${[0,1,2].map((index) => `<button type="button" data-loadout-slot="${index}"></button>`).join('')}
            </div>

            <div class="online-loadout__library">
              ${SKILL_ORDER.map((skillId) => skillLibraryHtml(skillId)).join('')}
            </div>
          </section>

          <section class="online-matchmaking">
            <div class="online-matchmaking__hero">
              <span>PUBLIC MATCH</span>
              <strong>快速匹配</strong>
              <small>当前主题 + 当前三技能 · 180 秒实时对决</small>
            </div>
            <button id="online-matchmake" class="online-matchmaking__button" type="button">⚔ 开始匹配</button>

            <div id="online-matchmaking-panel" class="online-matchmaking__search online-matchmaking__search--hidden">
              <div class="online-matchmaking__radar"><i></i><b>VS</b></div>
              <div>
                <strong>正在寻找对手…</strong>
                <span>已等待 <b id="online-matchmaking-time">0.0s</b> · 队列 <b id="online-matchmaking-queue">1</b> 人</span>
              </div>
              <button id="online-matchmaking-cancel" type="button">取消</button>
            </div>
          </section>

          <div class="online-lobby__divider"><span>私人房</span></div>

          <div class="online-lobby__actions">
            <button id="online-create" class="online-lobby__secondary" type="button">创建 6 位房间</button>
            <div class="online-lobby__join">
              <input id="online-code-input" inputmode="numeric" maxlength="6" placeholder="6位房间码" />
              <button id="online-join" type="button">加入</button>
            </div>
          </div>

          <div class="online-lobby__error" id="online-error"></div>

          <div class="online-room online-room--hidden" id="online-room">
            <div class="online-room__code">
              <span>房间码</span>
              <strong id="online-room-code">------</strong>
            </div>
            <div class="online-room__players" id="online-players"></div>
            <button class="online-room__ready" id="online-ready" type="button">准备</button>
            <button class="online-room__leave" id="online-leave" type="button">退出房间</button>
            <p class="online-room__note">修改主题或技能会自动取消准备；双方准备后进入对决。</p>
          </div>
        </div>
      </section>`);

    this.root = container.querySelector('#online-lobby') as HTMLElement;
    this.status = container.querySelector('#online-status') as HTMLElement;
    this.matchmakingPanel = container.querySelector('#online-matchmaking-panel') as HTMLElement;
    this.matchmakingTime = container.querySelector('#online-matchmaking-time') as HTMLElement;
    this.matchmakingQueue = container.querySelector('#online-matchmaking-queue') as HTMLElement;
    this.matchButton = container.querySelector('#online-matchmake') as HTMLButtonElement;
    this.cancelMatchButton = container.querySelector('#online-matchmaking-cancel') as HTMLButtonElement;
    this.roomPanel = container.querySelector('#online-room') as HTMLElement;
    this.roomCode = container.querySelector('#online-room-code') as HTMLElement;
    this.players = container.querySelector('#online-players') as HTMLElement;
    this.readyButton = container.querySelector('#online-ready') as HTMLButtonElement;
    this.createButton = container.querySelector('#online-create') as HTMLButtonElement;
    this.joinButton = container.querySelector('#online-join') as HTMLButtonElement;
    this.joinInput = container.querySelector('#online-code-input') as HTMLInputElement;
    this.nameInput = container.querySelector('#online-name') as HTMLInputElement;
    this.error = container.querySelector('#online-error') as HTMLElement;
    this.themeButtons = [...container.querySelectorAll<HTMLButtonElement>('[data-theme-choice]')];
    this.loadoutSlots = [...container.querySelectorAll<HTMLButtonElement>('[data-loadout-slot]')];
    this.skillCards = [...container.querySelectorAll<HTMLButtonElement>('[data-skill-choice]')];

    const savedName = localStorage.getItem('doublefight-player-name');
    if (savedName) this.nameInput.value = savedName;
    this.loadSavedSetup();

    container.querySelector('#online-back')?.addEventListener('click', () => this.close());
    container.querySelector('#online-leave')?.addEventListener('click', () => this.client.leaveRoom());

    this.themeButtons.forEach((button) => {
      button.addEventListener('click', () => {
        if (this.setupLocked()) return;
        const theme = button.dataset.themeChoice as ThemeId;
        this.setTheme(theme);
        this.persistSetup();
        this.renderSetup();
      });
    });

    this.loadoutSlots.forEach((button, index) => {
      button.addEventListener('click', () => {
        if (this.setupLocked()) return;
        this.activeSlot = index;
        this.renderSetup();
      });
    });

    this.skillCards.forEach((button) => {
      button.addEventListener('click', () => {
        if (this.setupLocked()) return;
        const skillId = button.dataset.skillChoice as SkillId;
        this.assignSkill(skillId);
      });
    });

    this.matchButton.addEventListener('click', () => {
      this.saveName();
      this.ensureConnected(() => {
        this.client.joinMatchmaking(this.playerName(), this.currentTheme, this.loadout);
      });
    });

    this.cancelMatchButton.addEventListener('click', () => this.client.cancelMatchmaking());

    this.createButton.addEventListener('click', () => {
      this.saveName();
      this.ensureConnected(() => this.client.createRoom(this.playerName(), this.currentTheme, this.loadout));
    });

    this.joinButton.addEventListener('click', () => {
      this.saveName();
      const code = this.joinInput.value.replace(/\D/g, '').slice(0, 6);
      if (code.length !== 6) {
        this.error.textContent = '请输入 6 位房间码。';
        return;
      }
      this.ensureConnected(() => this.client.joinRoom(code, this.playerName(), this.currentTheme, this.loadout));
    });

    this.joinInput.addEventListener('input', () => {
      this.joinInput.value = this.joinInput.value.replace(/\D/g, '').slice(0, 6);
    });

    this.readyButton.addEventListener('click', () => {
      const state = this.client.snapshot();
      const me = state.room?.players.find((player) => player.id === state.playerId);
      this.client.setReady(!me?.ready);
    });

    this.client.subscribe((state) => this.render(state));
    window.setInterval(() => {
      const state = this.client.snapshot();
      if (state.matchmaking.status === 'searching') this.renderMatchmaking(state);
    }, 100);

    this.renderSetup();
  }

  show(theme: ThemeId): void {
    if (!localStorage.getItem('doublefight-online-theme')) this.currentTheme = theme;
    this.renderSetup();
    this.root.classList.remove('online-lobby--hidden');
    this.root.setAttribute('aria-hidden', 'false');
    this.client.connect();
  }

  close(): void {
    const state = this.client.snapshot();
    if (state.matchmaking.status === 'searching') this.client.cancelMatchmaking();
    if (state.room && state.match?.phase !== 'playing') this.client.leaveRoom();
    this.hideForMatch();
    this.onCloseHandler?.();
  }

  hideForMatch(): void {
    this.root.classList.add('online-lobby--hidden');
    this.root.setAttribute('aria-hidden', 'true');
  }

  onClose(handler: () => void): void {
    this.onCloseHandler = handler;
  }

  setTheme(theme: ThemeId): void {
    this.currentTheme = theme;
    const state = this.client.snapshot();
    if (state.room?.phase === 'lobby') this.client.setTheme(theme);
  }

  private assignSkill(skillId: SkillId): void {
    const existing = this.loadout.indexOf(skillId);
    const next = [...this.loadout] as SkillLoadout;
    if (existing >= 0) {
      [next[this.activeSlot], next[existing]] = [next[existing], next[this.activeSlot]];
    } else {
      next[this.activeSlot] = skillId;
    }
    this.loadout = next;
    this.activeSlot = (this.activeSlot + 1) % 3;
    this.persistSetup();
    if (this.client.snapshot().room?.phase === 'lobby') this.client.setLoadout(this.loadout);
    this.renderSetup();
  }

  private renderSetup(): void {
    const locked = this.setupLocked();

    this.themeButtons.forEach((button) => {
      const selected = button.dataset.themeChoice === this.currentTheme;
      button.classList.toggle('is-selected', selected);
      button.disabled = locked;
    });

    this.loadoutSlots.forEach((button, index) => {
      const skill = SKILL_DEFINITIONS[this.loadout[index]];
      button.classList.toggle('is-active', index === this.activeSlot);
      button.disabled = locked;
      button.innerHTML = `<span>${index + 1}</span><i>${skill.icon}</i><b>${skill.shortLabel}</b><small>${skill.cost}⚡</small>`;
    });

    this.skillCards.forEach((button) => {
      const skillId = button.dataset.skillChoice as SkillId;
      const equipped = this.loadout.includes(skillId);
      button.classList.toggle('is-equipped', equipped);
      button.disabled = locked;
    });
  }

  private render(state: Readonly<OnlineClientState>): void {
    this.status.textContent = statusText(state);
    this.root.dataset.status = state.status;
    this.error.textContent = state.lastError ?? '';
    this.renderMatchmaking(state);
    this.renderSetup();

    const room = state.room;
    const searching = state.matchmaking.status === 'searching';
    this.roomPanel.classList.toggle('online-room--hidden', !room);

    this.matchButton.disabled = Boolean(room) || searching || state.status !== 'connected';
    this.createButton.disabled = Boolean(room) || searching;
    this.joinButton.disabled = Boolean(room) || searching;
    this.joinInput.disabled = Boolean(room) || searching;
    this.nameInput.disabled = Boolean(room) || searching;

    if (!room) return;

    this.roomCode.textContent = room.code;
    this.players.innerHTML = room.players.map((player) => `
      <div class="online-player ${player.id === state.playerId ? 'online-player--me' : ''}">
        <span class="online-player__avatar">${player.theme === 'palace' ? '🏯' : '🏰'}</span>
        <div>
          <strong>${escapeHtml(player.name)}${player.id === state.playerId ? ' · 我' : ''}</strong>
          <small>${THEMES[player.theme].label} · ${player.loadout.map((id) => SKILL_DEFINITIONS[id].shortLabel).join(' / ')}</small>
        </div>
        <b class="${player.ready ? 'is-ready' : ''}">${player.connected ? (player.ready ? '已准备' : '未准备') : '重连中'}</b>
      </div>
    `).join('');

    const me = room.players.find((player) => player.id === state.playerId);
    this.readyButton.textContent = me?.ready ? '取消准备' : '准备';
    this.readyButton.disabled = room.phase !== 'lobby';

    if (state.match?.phase === 'playing') {
      this.status.textContent = '比赛进行中';
      this.readyButton.textContent = '比赛已开始';
    }
  }

  private renderMatchmaking(state: Readonly<OnlineClientState>): void {
    const matchmaking = state.matchmaking;
    const searching = matchmaking.status === 'searching';
    const matched = matchmaking.status === 'matched';

    this.matchmakingPanel.classList.toggle('online-matchmaking__search--hidden', !searching && !matched);

    if (searching) {
      const elapsed = matchmaking.joinedAt ? Math.max(0, (Date.now() - matchmaking.joinedAt) / 1000) : 0;
      this.matchmakingTime.textContent = `${elapsed.toFixed(1)}s`;
      this.matchmakingQueue.textContent = String(Math.max(1, matchmaking.queueSize));
      this.status.textContent = '正在匹配在线对手';
      this.cancelMatchButton.disabled = false;
    } else if (matched) {
      this.matchmakingTime.textContent = '找到对手';
      this.matchmakingQueue.textContent = '2';
      this.status.textContent = '匹配成功 · 正在创建对局';
      this.cancelMatchButton.disabled = true;
    } else if (matchmaking.status === 'timed_out') {
      this.status.textContent = '暂时没有匹配到对手，可再次尝试';
      this.matchButton.disabled = state.status !== 'connected';
    }
  }

  private setupLocked(): boolean {
    const state = this.client.snapshot();
    return state.matchmaking.status === 'searching'
      || state.matchmaking.status === 'matched'
      || state.room?.phase === 'playing';
  }

  private loadSavedSetup(): void {
    const savedTheme = localStorage.getItem('doublefight-online-theme');
    if (savedTheme === 'kingdom' || savedTheme === 'palace') this.currentTheme = savedTheme;

    try {
      const saved = JSON.parse(localStorage.getItem('doublefight-online-loadout') ?? 'null') as unknown;
      if (
        Array.isArray(saved) &&
        saved.length === 3 &&
        saved.every((value) => typeof value === 'string' && value in SKILL_DEFINITIONS) &&
        new Set(saved).size === 3
      ) {
        this.loadout = [...saved] as SkillLoadout;
      }
    } catch {
      this.loadout = [...DEFAULT_SKILL_LOADOUT];
    }
  }

  private persistSetup(): void {
    localStorage.setItem('doublefight-online-theme', this.currentTheme);
    localStorage.setItem('doublefight-online-loadout', JSON.stringify(this.loadout));
  }

  private ensureConnected(action: () => void): void {
    const state = this.client.snapshot();
    if (state.status === 'connected') {
      action();
      return;
    }

    this.client.connect();
    let unsubscribe: (() => void) | null = null;
    unsubscribe = this.client.subscribe((next) => {
      if (next.status === 'connected') {
        unsubscribe?.();
        action();
      }
      if (next.status === 'closed' && next.lastError) unsubscribe?.();
    });
  }

  private playerName(): string {
    return this.nameInput.value.trim().slice(0, 16) || '玩家';
  }

  private saveName(): void {
    localStorage.setItem('doublefight-player-name', this.playerName());
  }
}

function skillLibraryHtml(skillId: SkillId): string {
  const skill = SKILL_DEFINITIONS[skillId];
  return `
    <button type="button" data-skill-choice="${skillId}">
      <i>${skill.icon}</i>
      <div><b>${skill.shortLabel}</b><small>${skill.description}</small></div>
      <span>${skill.cost}⚡</span>
    </button>`;
}

function statusText(state: Readonly<OnlineClientState>): string {
  if (state.matchmaking.status === 'searching') return '正在匹配在线对手';
  if (state.matchmaking.status === 'matched') return '匹配成功 · 正在创建对局';
  if (state.matchmaking.status === 'timed_out') return '匹配超时，可再次尝试';
  if (state.status === 'connecting') return '正在连接联机服务器…';
  if (state.status === 'reconnecting') return '网络中断，正在尝试重连…';
  if (state.status === 'connected') {
    return state.latencyMs === null ? '服务器已连接' : `服务器已连接 · ${state.latencyMs}ms`;
  }
  if (state.status === 'closed') return state.lastError ?? '连接已关闭';
  return '等待连接';
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;',
  })[char] ?? char);
}
