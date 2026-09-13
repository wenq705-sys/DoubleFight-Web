import { describe, expect, it, vi } from 'vitest';
import { Board2048 } from '../shared/game/Board2048';
import { PROTOCOL_VERSION } from '../shared/protocol/messages';
import type { DouyinApi, DouyinSocketTask, DouyinTouchEvent } from '../platform/douyin/src/api';
import { DouyinLifecycle } from '../platform/douyin/src/lifecycle';
import { DouyinSocketProbe } from '../platform/douyin/src/socket';
import { DouyinSwipeInput } from '../platform/douyin/src/touch';

function fakeApi() {
  const handlers = new Map<string, Function>();
  const socket = { send: vi.fn(), close: vi.fn(), onOpen: vi.fn((f: Function) => handlers.set('open', f)),
    onMessage: vi.fn((f: Function) => handlers.set('message', f)), onClose: vi.fn((f: Function) => handlers.set('close', f)),
    onError: vi.fn((f: Function) => handlers.set('error', f)) };
  const api = { onTouchStart: vi.fn((f: Function) => handlers.set('start', f)),
    onTouchMove: vi.fn((f: Function) => handlers.set('move', f)), onTouchEnd: vi.fn((f: Function) => handlers.set('end', f)),
    onTouchCancel: vi.fn((f: Function) => handlers.set('cancel', f)), onShow: vi.fn((f: Function) => handlers.set('show', f)),
    onHide: vi.fn((f: Function) => handlers.set('hide', f)), connectSocket: vi.fn((_options: { url: string }) => socket as unknown as DouyinSocketTask) };
  return { api: api as unknown as DouyinApi, handlers, socket, raw: api };
}

describe('Douyin runtime spike adapters', () => {
  it('converts four touch gestures into moves on the existing shared board, and cancels a gesture', () => {
    const { api, handlers, raw } = fakeApi();
    const board = new Board2048(() => 0.42);
    board.load([[2, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]]);
    const directions: string[] = [];
    const touch = new DouyinSwipeInput(api, direction => { directions.push(direction); board.move(direction); });
    touch.setActive(true);
    for (const [x, y, expected] of [[100, 0, 'right'], [-100, 0, 'left'], [0, -100, 'up'], [0, 100, 'down']] as const) {
      const start: DouyinTouchEvent = { touches: [{ identifier: 1, clientX: 100, clientY: 100 }], changedTouches: [{ identifier: 1, clientX: 100, clientY: 100 }] };
      const end: DouyinTouchEvent = { touches: [], changedTouches: [{ identifier: 1, clientX: 100 + x, clientY: 100 + y }] };
      handlers.get('start')!(start); handlers.get('end')!(end);
      expect(directions.at(-1)).toBe(expected);
    }
    handlers.get('start')!({ changedTouches: [{ identifier: 1, clientX: 0, clientY: 0 }], touches: [] });
    handlers.get('cancel')!();
    handlers.get('end')!({ changedTouches: [{ identifier: 1, clientX: 200, clientY: 0 }], touches: [] });
    expect(directions).toEqual(['right', 'left', 'up', 'down']);
    expect(raw.onTouchStart).toHaveBeenCalledTimes(1);
    expect(raw.onTouchEnd).toHaveBeenCalledTimes(1);
    expect(board.tiles().length).toBeGreaterThan(0);
  });

  it('uses protocol v6 hello/welcome/ping/pong and closes without duplicate sockets', () => {
    const { api, handlers, socket, raw } = fakeApi();
    const probe = new DouyinSocketProbe(api);
    probe.connect(); probe.connect();
    expect(raw.connectSocket).toHaveBeenCalledTimes(1);
    expect(raw.connectSocket.mock.calls[0]?.[0].url).toBe('wss://game.whvwayfare.online/ws');
    handlers.get('open')!();
    expect(JSON.parse(socket.send.mock.calls[0]?.[0].data)).toEqual({ type: 'hello', protocolVersion: PROTOCOL_VERSION });
    handlers.get('message')!({ data: JSON.stringify({ type: 'welcome', protocolVersion: PROTOCOL_VERSION }) });
    const ping = JSON.parse(socket.send.mock.calls[1]?.[0].data);
    expect(ping.type).toBe('ping');
    handlers.get('message')!({ data: JSON.stringify({ type: 'pong', sentAt: ping.sentAt }) });
    expect(probe.log.some(line => line.startsWith('pong '))).toBe(true);
    handlers.get('error')!({ errMsg: 'test error' });
    expect(probe.log).toContain('socket error: test error');
    probe.close(); probe.close();
    expect(socket.close).toHaveBeenCalledTimes(1);
  });

  it('does not duplicate render frames, lifecycle listeners, or sockets across hide/show', () => {
    const { api, handlers, raw, socket } = fakeApi();
    let nextId = 0;
    const pending = new Map<number, () => void>();
    const render = vi.fn(); const resume = vi.fn(); const suspend = vi.fn();
    const probe = new DouyinSocketProbe(api);
    const lifecycle = new DouyinLifecycle(api, {
      request: callback => { const id = ++nextId; pending.set(id, callback); return id; },
      cancel: id => { pending.delete(id); },
    }, render, () => { resume(); probe.connect(); }, () => { suspend(); probe.close(); });
    lifecycle.show(); lifecycle.show();
    expect(pending.size).toBe(1);
    expect(raw.connectSocket).toHaveBeenCalledTimes(1);
    const firstId = pending.keys().next().value!;
    const firstFrame = pending.get(firstId)!;
    pending.delete(firstId);
    firstFrame();
    expect(render).toHaveBeenCalledTimes(1);
    expect(pending.size).toBe(1);
    handlers.get('hide')!(); handlers.get('hide')!();
    expect(suspend).toHaveBeenCalledTimes(1);
    expect(socket.close).toHaveBeenCalledTimes(1);
    handlers.get('show')!(); handlers.get('show')!();
    expect(resume).toHaveBeenCalledTimes(2);
    expect(raw.connectSocket).toHaveBeenCalledTimes(2);
    expect(raw.onShow).toHaveBeenCalledTimes(1);
    expect(raw.onHide).toHaveBeenCalledTimes(1);
  });
});
