import { PROTOCOL_VERSION, type ClientMessage, type ServerMessage } from '../../../shared/protocol/messages';
import type { DouyinApi, DouyinSocketTask } from './api';

export const SPIKE_ENDPOINT = 'wss://game.whvwayfare.online/ws';

/** Only transports the existing v6 hello/ping messages; no alternate protocol or game authority. */
export class DouyinSocketProbe {
  private task: DouyinSocketTask | null = null;
  private generation = 0;
  private sentAt: number | null = null;
  readonly log: string[] = [];
  reconnectIdentity: { roomCode: string; reconnectToken: string } | null = null;

  constructor(private readonly api: DouyinApi, private readonly endpoint = SPIKE_ENDPOINT) {}

  connect(): void {
    if (this.task) return;
    const generation = ++this.generation;
    this.record(`connect ${this.endpoint}`);
    let task: DouyinSocketTask;
    try { task = this.api.connectSocket({ url: this.endpoint, fail: error => {
      if (generation === this.generation) this.record(`connectSocket fail: ${error.errMsg ?? JSON.stringify(error)}`);
    } }); }
    catch (error) { this.record(`connectSocket exception: ${String(error)}`); return; }
    this.task = task;
    try {
    task.onOpen(() => {
      if (generation !== this.generation) return;
      this.record('open');
      this.send({ type: 'hello', protocolVersion: PROTOCOL_VERSION });
      this.record(`hello v${PROTOCOL_VERSION}`);
    });
    task.onMessage(event => {
      if (generation !== this.generation) return;
      let message: ServerMessage;
      try {
        if (typeof event.data !== 'string') { this.record('message error: expected JSON text'); return; }
        message = JSON.parse(event.data) as ServerMessage;
      } catch { this.record('message error: invalid JSON'); return; }
      if (message.type === 'welcome') {
        if (message.protocolVersion !== PROTOCOL_VERSION) {
          this.record(`protocol mismatch: server v${message.protocolVersion}`);
          return;
        }
        this.record(`welcome v${message.protocolVersion}`);
        this.sentAt = Date.now();
        this.send({ type: 'ping', sentAt: this.sentAt });
      } else if (message.type === 'pong' && message.sentAt === this.sentAt) {
        this.record(`pong ${Date.now() - message.sentAt}ms`);
      } else if (message.type === 'error') {
        this.record(`protocol error: ${message.code} ${message.message}`);
      }
    });
    task.onClose(event => {
      if (generation !== this.generation) return;
      this.record(`close ${event.code ?? ''} ${event.reason ?? ''}`.trim());
      this.task = null;
    });
    task.onError(error => {
      if (generation !== this.generation) return;
      this.record(`socket error: ${error.errMsg ?? JSON.stringify(error)}`);
    });
    } catch (error) {
      this.record(`SocketTask listener error: ${String(error)}`);
      this.task = null;
    }
  }

  close(): void {
    ++this.generation;
    const task = this.task;
    this.task = null;
    if (task) { task.close({ code: 1000, reason: 'spike suspended' }); this.record('close requested'); }
  }
  isConnectedOrConnecting(): boolean { return this.task !== null; }
  private send(message: ClientMessage): void {
    this.task?.send({ data: JSON.stringify(message), fail: error => this.record(`send fail: ${error.errMsg ?? JSON.stringify(error)}`) });
  }
  private record(line: string): void { this.log.push(line); console.log(`[M2.9 socket] ${line}`); }
}
