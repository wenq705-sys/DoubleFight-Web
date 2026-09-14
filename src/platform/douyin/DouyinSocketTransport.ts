import type { SocketConnection, SocketState, SocketTransport } from '../types';
import type { DouyinApi, DouyinSocketTask } from '../../../platform/douyin/src/api';

class TaskConnection implements SocketConnection {
  private state: SocketState = 'connecting';
  private active = true;
  private openListeners: Array<() => void> = [];
  private messageListeners: Array<(data: string) => void> = [];
  private errorListeners: Array<(error: unknown) => void> = [];
  private closeListeners: Array<() => void> = [];
  get readyState(): SocketState { return this.state; }
  constructor(private readonly task: DouyinSocketTask, private readonly isCurrent: () => boolean) {
    task.onOpen(() => { if (!this.valid()) return; this.state = 'open'; this.openListeners.forEach(listener => listener()); });
    task.onMessage(event => { const data = event.data; if (!this.valid() || typeof data !== 'string') return; this.messageListeners.forEach(listener => listener(data)); });
    task.onError(error => { if (!this.valid()) return; this.errorListeners.forEach(listener => listener(error)); });
    task.onClose(() => { if (!this.valid()) return; this.state = 'closed'; this.active = false; this.closeListeners.forEach(listener => listener()); });
  }
  onOpen(listener: () => void): void { this.openListeners.push(listener); }
  onMessage(listener: (data: string) => void): void { this.messageListeners.push(listener); }
  onError(listener: (error: unknown) => void): void { this.errorListeners.push(listener); }
  onClose(listener: () => void): void { this.closeListeners.push(listener); }
  reportError(error: unknown): void { if (this.valid()) this.errorListeners.forEach(listener => listener(error)); }
  send(data: string): void { if (this.valid() && this.state === 'open') this.task.send({ data, fail: error => { if (this.valid()) this.errorListeners.forEach(listener => listener(error)); } }); }
  close(): void {
    if (!this.active) return;
    this.active = false;
    this.state = 'closed';
    this.task.close({ code: 1000, reason: 'client closed' });
  }
  private valid(): boolean { return this.active && this.isCurrent(); }
}

export class DouyinSocketTransport implements SocketTransport {
  private generation = 0;
  private current: TaskConnection | null = null;
  constructor(private readonly api: Pick<DouyinApi, 'connectSocket'>) {}
  connect(url: string): SocketConnection {
    this.current?.close();
    const generation = ++this.generation;
    let connection: TaskConnection | null = null;
    let pendingError: unknown = null;
    const task = this.api.connectSocket({ url, fail: error => {
      if (generation !== this.generation) return;
      if (connection) connection.reportError(error);
      else pendingError = error;
    } });
    connection = new TaskConnection(task, () => generation === this.generation);
    this.current = connection;
    if (pendingError) queueMicrotask(() => connection?.reportError(pendingError));
    return connection;
  }
}
