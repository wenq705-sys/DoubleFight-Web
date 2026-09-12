import {
  PROTOCOL_VERSION,
  type ClientMessage,
  type MatchSnapshot,
  type MatchmakingState,
  type NetworkThemeId,
  type RoomState,
  type ServerMessage,
  type SkillId,
  type SkillLoadout,
} from '../../shared/index';

export type OnlineStatus = 'idle' | 'connecting' | 'connected' | 'reconnecting' | 'closed';

export interface OnlineClientState {
  status: OnlineStatus;
  connectionId: string | null;
  playerId: string | null;
  reconnectToken: string | null;
  room: RoomState | null;
  match: MatchSnapshot | null;
  matchmaking: MatchmakingState;
  latencyMs: number | null;
  lastError: string | null;
}

type Listener = (state: Readonly<OnlineClientState>, message?: ServerMessage) => void;

export class OnlineClient {
  private socket: WebSocket | null = null;
  private listeners = new Set<Listener>();
  private reconnectAttempts = 0;
  private reconnectTimer: number | null = null;
  private intentionalClose = false;
  private sequence = 0;
  private skillSequence = 0;

  private state: OnlineClientState = {
    status: 'idle',
    connectionId: null,
    playerId: null,
    reconnectToken: null,
    room: null,
    match: null,
    matchmaking: {
      status: 'idle',
      joinedAt: null,
      queueSize: 0,
    },
    latencyMs: null,
    lastError: null,
  };

  constructor(private readonly endpoint: string) {}

  snapshot(): Readonly<OnlineClientState> {
    return { ...this.state };
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    listener(this.snapshot());
    return () => this.listeners.delete(listener);
  }

  connect(): void {
    if (!this.endpoint) {
      this.patch({ lastError: '联机服务器尚未配置。', status: 'closed' });
      return;
    }
    if (this.socket?.readyState === WebSocket.OPEN || this.socket?.readyState === WebSocket.CONNECTING) return;

    this.intentionalClose = false;
    this.patch({ status: this.reconnectAttempts > 0 ? 'reconnecting' : 'connecting', lastError: null });

    const socket = new WebSocket(this.endpoint);
    this.socket = socket;

    socket.addEventListener('open', () => {
      this.reconnectAttempts = 0;
      this.patch({ status: 'connected' });
      this.send({ type: 'hello', protocolVersion: PROTOCOL_VERSION });

      const roomCode = this.state.room?.code;
      const reconnectToken = this.state.reconnectToken;
      if (roomCode && reconnectToken) {
        this.send({ type: 'reconnect', roomCode, reconnectToken });
      }
    });

    socket.addEventListener('message', (event) => {
      if (typeof event.data !== 'string') return;
      let message: ServerMessage;
      try {
        message = JSON.parse(event.data) as ServerMessage;
      } catch {
        this.patch({ lastError: '服务器返回了无法解析的数据。' });
        return;
      }
      this.consume(message);
    });

    socket.addEventListener('close', () => {
      this.socket = null;
      if (this.state.matchmaking.status === 'searching') {
        this.patch({
          matchmaking: {
            status: 'idle',
            joinedAt: null,
            queueSize: 0,
          },
        });
      }
      if (this.intentionalClose) {
        this.patch({ status: 'closed' });
        return;
      }
      this.scheduleReconnect();
    });

    socket.addEventListener('error', () => {
      this.patch({ lastError: '无法连接联机服务器。' });
    });
  }

  close(): void {
    this.intentionalClose = true;
    if (this.reconnectTimer !== null) window.clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    this.socket?.close();
    this.socket = null;
    this.patch({ status: 'closed' });
  }

  createRoom(playerName: string, theme: NetworkThemeId, loadout: SkillLoadout): void {
    this.send({ type: 'create_room', playerName, theme, loadout });
  }

  joinRoom(roomCode: string, playerName: string, theme: NetworkThemeId, loadout: SkillLoadout): void {
    this.send({ type: 'join_room', roomCode, playerName, theme, loadout });
  }

  joinMatchmaking(playerName: string, theme: NetworkThemeId, loadout: SkillLoadout): void {
    this.send({ type: 'join_matchmaking', playerName, theme, loadout });
  }

  cancelMatchmaking(): void {
    this.send({ type: 'cancel_matchmaking' });
  }

  setTheme(theme: NetworkThemeId): void {
    this.send({ type: 'set_theme', theme });
  }

  setLoadout(loadout: SkillLoadout): void {
    this.send({ type: 'set_loadout', loadout });
  }

  setReady(ready: boolean): void {
    this.send({ type: 'set_ready', ready });
  }

  setRematchReady(ready: boolean): void {
    this.send({ type: 'set_rematch_ready', ready });
  }

  move(direction: 'left' | 'right' | 'up' | 'down'): number {
    const sequence = this.sequence++;
    this.send({ type: 'move', direction, sequence });
    return sequence;
  }

  castSkill(skillId: SkillId): number {
    const sequence = this.skillSequence++;
    this.send({ type: 'cast_skill', skillId, sequence });
    return sequence;
  }

  leaveRoom(): void {
    this.send({ type: 'leave_room' });
    this.sequence = 0;
    this.skillSequence = 0;
    this.patch({
      playerId: null,
      reconnectToken: null,
      room: null,
      match: null,
      matchmaking: {
        status: 'idle',
        joinedAt: null,
        queueSize: 0,
      },
    });
  }

  ping(): void {
    this.send({ type: 'ping', sentAt: Date.now() });
  }

  private send(message: ClientMessage): void {
    if (this.socket?.readyState !== WebSocket.OPEN) {
      this.patch({ lastError: '当前未连接联机服务器。' });
      return;
    }
    this.socket.send(JSON.stringify(message));
  }

  private consume(message: ServerMessage): void {
    switch (message.type) {
      case 'welcome':
        this.patch({ connectionId: message.connectionId, status: 'connected' }, message);
        break;
      case 'room_joined':
        this.patch({
          playerId: message.playerId,
          reconnectToken: message.reconnectToken,
          room: message.room,
          matchmaking: {
            status: 'idle',
            joinedAt: null,
            queueSize: 0,
          },
          lastError: null,
        }, message);
        break;
      case 'room_state':
        this.patch({ room: message.room }, message);
        break;
      case 'matchmaking_state':
        this.patch({ matchmaking: message.state, lastError: null }, message);
        break;
      case 'match_start':
      case 'match_state':
      case 'match_end':
        this.patch({ match: message.snapshot }, message);
        break;
      case 'move_ack':
      case 'skill_event':
        this.emit(message);
        break;
      case 'error':
        this.patch({ lastError: message.message }, message);
        break;
      case 'pong':
        this.patch({ latencyMs: Math.max(0, Date.now() - message.sentAt) }, message);
        break;
    }
  }

  private scheduleReconnect(): void {
    this.reconnectAttempts += 1;
    const delay = Math.min(8_000, 500 * 2 ** Math.min(this.reconnectAttempts - 1, 4));
    this.patch({ status: 'reconnecting' });
    this.reconnectTimer = window.setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delay);
  }

  private patch(partial: Partial<OnlineClientState>, message?: ServerMessage): void {
    this.state = { ...this.state, ...partial };
    this.emit(message);
  }

  private emit(message?: ServerMessage): void {
    const snapshot = this.snapshot();
    this.listeners.forEach((listener) => listener(snapshot, message));
  }
}
