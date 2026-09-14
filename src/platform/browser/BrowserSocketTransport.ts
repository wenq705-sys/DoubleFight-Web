import type { SocketConnection, SocketState, SocketTransport } from '../types';

const STATES: SocketState[] = ['connecting', 'open', 'closing', 'closed'];

export class BrowserSocketTransport implements SocketTransport {
  constructor(private readonly createSocket: (url: string) => WebSocket = url => new WebSocket(url)) {}
  connect(url: string): SocketConnection {
    const socket = this.createSocket(url);
    return {
      get readyState() { return STATES[socket.readyState] ?? 'closed'; },
      onOpen: listener => socket.addEventListener('open', listener),
      onMessage: listener => socket.addEventListener('message', event => { if (typeof event.data === 'string') listener(event.data); }),
      onError: listener => socket.addEventListener('error', listener),
      onClose: listener => socket.addEventListener('close', listener),
      send: data => socket.send(data),
      close: () => socket.close(),
    };
  }
}
