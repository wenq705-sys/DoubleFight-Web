import type { ThemeId } from '../config/themes';
import { THEMES } from '../config/themes';
import { OnlineClient, type OnlineClientState } from '../network/OnlineClient';

export class OnlineLobby {
  private readonly root: HTMLElement;
  private readonly status: HTMLElement;
  private readonly roomPanel: HTMLElement;
  private readonly roomCode: HTMLElement;
  private readonly players: HTMLElement;
  private readonly readyButton: HTMLButtonElement;
  private readonly createButton: HTMLButtonElement;
  private readonly joinButton: HTMLButtonElement;
  private readonly joinInput: HTMLInputElement;
  private readonly nameInput: HTMLInputElement;
  private readonly themeLabel: HTMLElement;
  private readonly error: HTMLElement;
  private currentTheme: ThemeId = 'kingdom';
  private onCloseHandler: (() => void) | null = null;

  constructor(
    container: HTMLElement,
    private readonly client: OnlineClient,
    endpointConfigured: boolean,
  ) {
    container.insertAdjacentHTML('beforeend', `
      <section class="online-lobby online-lobby--hidden" id="online-lobby" aria-hidden="true">
        <div class="online-lobby__backdrop"></div>
        <div class="online-lobby__sheet">
          <div class="online-lobby__top">
            <button class="online-lobby__back" id="online-back" type="button">← 主题岛</button>
            <div>
              <div class="online-lobby__eyebrow">M2 ONLINE DUEL</div>
              <h2>在线对决</h2>
            </div>
            <span class="online-lobby__dot" id="online-dot"></span>
          </div>

          <div class="online-lobby__status" id="online-status">${endpointConfigured ? '准备连接服务器' : '联机服务器尚未配置'}</div>

          <div class="online-lobby__identity">
            <label>
              <span>昵称</span>
              <input id="online-name" maxlength="16" autocomplete="nickname" value="玩家" />
            </label>
            <div class="online-lobby__theme">
              <span>本局主题</span>
              <strong id="online-theme">微缩王国</strong>
            </div>
          </div>

          <div class="online-lobby__actions">
            <button id="online-create" class="online-lobby__primary" type="button">创建房间</button>
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
            <p class="online-room__note">双方准备后立即进入实时双棋盘对决。每个人只操作自己的棋盘。</p>
          </div>
        </div>
      </section>`);

    this.root = container.querySelector('#online-lobby') as HTMLElement;
    this.status = container.querySelector('#online-status') as HTMLElement;
    this.roomPanel = container.querySelector('#online-room') as HTMLElement;
    this.roomCode = container.querySelector('#online-room-code') as HTMLElement;
    this.players = container.querySelector('#online-players') as HTMLElement;
    this.readyButton = container.querySelector('#online-ready') as HTMLButtonElement;
    this.createButton = container.querySelector('#online-create') as HTMLButtonElement;
    this.joinButton = container.querySelector('#online-join') as HTMLButtonElement;
    this.joinInput = container.querySelector('#online-code-input') as HTMLInputElement;
    this.nameInput = container.querySelector('#online-name') as HTMLInputElement;
    this.themeLabel = container.querySelector('#online-theme') as HTMLElement;
    this.error = container.querySelector('#online-error') as HTMLElement;

    const savedName = localStorage.getItem('doublefight-player-name');
    if (savedName) this.nameInput.value = savedName;

    container.querySelector('#online-back')?.addEventListener('click', () => this.close());
    container.querySelector('#online-leave')?.addEventListener('click', () => this.client.leaveRoom());

    this.createButton.addEventListener('click', () => {
      this.saveName();
      this.ensureConnected(() => this.client.createRoom(this.playerName(), this.currentTheme));
    });

    this.joinButton.addEventListener('click', () => {
      this.saveName();
      const code = this.joinInput.value.replace(/\D/g, '').slice(0, 6);
      if (code.length !== 6) {
        this.error.textContent = '请输入 6 位房间码。';
        return;
      }
      this.ensureConnected(() => this.client.joinRoom(code, this.playerName(), this.currentTheme));
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
  }

  show(theme: ThemeId): void {
    this.currentTheme = theme;
    this.themeLabel.textContent = THEMES[theme].label;
    this.root.classList.remove('online-lobby--hidden');
    this.root.setAttribute('aria-hidden', 'false');
    this.client.connect();
  }

  close(): void {
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
    this.themeLabel.textContent = THEMES[theme].label;
    if (this.client.snapshot().room) this.client.setTheme(theme);
  }

  private render(state: Readonly<OnlineClientState>): void {
    this.status.textContent = statusText(state);
    this.root.dataset.status = state.status;
    this.error.textContent = state.lastError ?? '';

    const room = state.room;
    this.roomPanel.classList.toggle('online-room--hidden', !room);
    this.createButton.disabled = Boolean(room);
    this.joinButton.disabled = Boolean(room);

    if (!room) return;

    this.roomCode.textContent = room.code;
    this.players.innerHTML = room.players.map((player) => `
      <div class="online-player ${player.id === state.playerId ? 'online-player--me' : ''}">
        <span class="online-player__avatar">${player.theme === 'palace' ? '🏯' : '🏰'}</span>
        <div>
          <strong>${escapeHtml(player.name)}${player.id === state.playerId ? ' · 我' : ''}</strong>
          <small>${THEMES[player.theme].label}</small>
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

function statusText(state: Readonly<OnlineClientState>): string {
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
