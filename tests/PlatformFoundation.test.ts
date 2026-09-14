import { afterEach, describe, expect, it, vi } from 'vitest';
import { PROTOCOL_VERSION } from '../shared/protocol/messages';
import { OnlineClient } from '../src/network/OnlineClient';
import type { SocketConnection, SocketState, SocketTransport } from '../src/platform/types';
import { BrowserHaptics, BrowserLifecycle, BrowserPlatform, BrowserStorage } from '../src/platform/browser/BrowserPlatform';
import { BrowserSocketTransport } from '../src/platform/browser/BrowserSocketTransport';
import { DouyinAccountBootstrap, DouyinHaptics, DouyinLifecycleAdapter, DouyinStorage, normalizeDouyinSystemInfo } from '../src/platform/douyin/DouyinPlatform';
import { DouyinRenderLoop } from '../src/platform/douyin/DouyinRenderLoop';
import { DouyinSocketTransport } from '../src/platform/douyin/DouyinSocketTransport';
import type { DouyinApi, DouyinSocketTask } from '../platform/douyin/src/api';

class FakeSocket implements SocketConnection {
  readyState: SocketState = 'connecting';
  readonly sent: string[] = [];
  readonly callbacks = { open: [] as Array<() => void>, message: [] as Array<(data: string) => void>, error: [] as Array<(error: unknown) => void>, close: [] as Array<() => void> };
  onOpen(callback: () => void) { this.callbacks.open.push(callback); }
  onMessage(callback: (data: string) => void) { this.callbacks.message.push(callback); }
  onError(callback: (error: unknown) => void) { this.callbacks.error.push(callback); }
  onClose(callback: () => void) { this.callbacks.close.push(callback); }
  open() { this.readyState = 'open'; this.callbacks.open.forEach(callback => callback()); }
  message(value: unknown) { this.callbacks.message.forEach(callback => callback(JSON.stringify(value))); }
  error() { this.callbacks.error.forEach(callback => callback(new Error('socket'))); }
  remoteClose() { this.readyState = 'closed'; this.callbacks.close.forEach(callback => callback()); }
  send(data: string) { this.sent.push(data); }
  close() { this.readyState = 'closed'; this.remoteClose(); }
}

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('platform socket contract', () => {
  it('maps native Browser WebSocket events and sends and closes', () => {
    const listeners = new Map<string, Function>();
    const native = { readyState: 0, send: vi.fn(), close: vi.fn(), addEventListener: vi.fn((name: string, fn: Function) => listeners.set(name, fn)) };
    const transport = new BrowserSocketTransport(() => native as unknown as WebSocket);
    const socket = transport.connect('wss://example/ws');
    const open = vi.fn(); const message = vi.fn(); const error = vi.fn(); const close = vi.fn();
    socket.onOpen(open); socket.onMessage(message); socket.onError(error); socket.onClose(close);
    expect(socket.readyState).toBe('connecting');
    native.readyState = 1; listeners.get('open')!(); listeners.get('message')!({ data: 'hello' }); listeners.get('message')!({ data: new ArrayBuffer(1) });
    listeners.get('error')!(new Error('test')); listeners.get('close')!();
    socket.send('ping'); socket.close();
    expect(socket.readyState).toBe('open'); expect(open).toHaveBeenCalledOnce(); expect(message).toHaveBeenCalledExactlyOnceWith('hello');
    expect(error).toHaveBeenCalledOnce(); expect(close).toHaveBeenCalledOnce(); expect(native.send).toHaveBeenCalledWith('ping'); expect(native.close).toHaveBeenCalledOnce();
  });

  it('maps Douyin SocketTask and ignores superseded callbacks', () => {
    const tasks: Array<{ task: DouyinSocketTask; events: Map<string, Function>; send: ReturnType<typeof vi.fn>; close: ReturnType<typeof vi.fn> }> = [];
    const api = { connectSocket: vi.fn(() => {
      const events = new Map<string, Function>(); const send = vi.fn(); const close = vi.fn();
      const task = { send, close, onOpen: (f: Function) => events.set('open', f), onMessage: (f: Function) => events.set('message', f),
        onError: (f: Function) => events.set('error', f), onClose: (f: Function) => events.set('close', f) } as DouyinSocketTask;
      tasks.push({ task, events, send, close }); return task;
    }) };
    const transport = new DouyinSocketTransport(api);
    const first = transport.connect('wss://example/ws'); const firstOpen = vi.fn(); first.onOpen(firstOpen);
    const second = transport.connect('wss://example/ws'); const message = vi.fn(); const error = vi.fn(); const closed = vi.fn();
    second.onMessage(message); second.onError(error); second.onClose(closed);
    tasks[0].events.get('open')!(); tasks[0].events.get('message')!({ data: 'stale' });
    expect(firstOpen).not.toHaveBeenCalled();
    tasks[1].events.get('open')!(); expect(second.readyState).toBe('open');
    tasks[1].events.get('message')!({ data: 'welcome' }); tasks[1].events.get('message')!({ data: new ArrayBuffer(1) });
    tasks[1].events.get('error')!({ errMsg: 'fail' }); second.send('hello');
    expect(message).toHaveBeenCalledExactlyOnceWith('welcome'); expect(error).toHaveBeenCalledOnce(); expect(tasks[1].send).toHaveBeenCalledWith(expect.objectContaining({ data: 'hello' }));
    tasks[1].events.get('close')!(); expect(closed).toHaveBeenCalledOnce(); expect(second.readyState).toBe('closed');
    const third = transport.connect('wss://example/ws'); third.close(); third.close();
    expect(tasks[2].close).toHaveBeenCalledOnce();
    tasks[0].events.get('close')!(); expect(closed).toHaveBeenCalledOnce();
  });

  it('turns Douyin connectSocket fail into a terminal close so OnlineClient retries', async () => {
    vi.useFakeTimers();
    const connectSocket = vi.fn((options: { fail?: (error: { errMsg?: string }) => void }) => {
      options.fail?.({ errMsg: 'connectSocket:fail temporary' });
      return {
        send: vi.fn(), close: vi.fn(),
        onOpen: vi.fn(), onMessage: vi.fn(), onError: vi.fn(), onClose: vi.fn(),
      } as unknown as DouyinSocketTask;
    });
    const client = new OnlineClient('wss://example/ws', new DouyinSocketTransport({ connectSocket }));
    client.connect();
    await Promise.resolve();
    expect(client.snapshot().status).toBe('reconnecting');
    expect(client.snapshot().lastError).toBe('无法连接联机服务器。');
    vi.advanceTimersByTime(500);
    expect(connectSocket).toHaveBeenCalledTimes(2);
    client.close();
  });

  it('keeps OnlineClient backoff, reconnect token, and sequence streams with injected transport', () => {
    vi.useFakeTimers();
    const sockets: FakeSocket[] = [];
    const transport: SocketTransport = { connect: () => { const socket = new FakeSocket(); sockets.push(socket); return socket; } };
    const client = new OnlineClient('wss://example/ws', transport);
    client.connect(); client.connect(); expect(sockets).toHaveLength(1);
    sockets[0].open(); expect(JSON.parse(sockets[0].sent[0])).toEqual({ type: 'hello', protocolVersion: PROTOCOL_VERSION });
    sockets[0].message({ type: 'room_joined', playerId: 'p', reconnectToken: 'token', room: { code: '123456' } });
    expect(client.move('left')).toBe(0); expect(client.castSkill('random_clear')).toBe(0);
    sockets[0].remoteClose(); expect(client.snapshot().status).toBe('reconnecting');
    vi.advanceTimersByTime(499); expect(sockets).toHaveLength(1);
    vi.advanceTimersByTime(1); expect(sockets).toHaveLength(2);
    sockets[1].remoteClose(); vi.advanceTimersByTime(999); expect(sockets).toHaveLength(2);
    vi.advanceTimersByTime(1); expect(sockets).toHaveLength(3);
    sockets[0].message({ type: 'error', message: 'stale' }); expect(client.snapshot().lastError).toBeNull();
    sockets[1].message({ type: 'error', message: 'stale' }); expect(client.snapshot().lastError).toBeNull();
    sockets[2].open();
    expect(sockets[2].sent.map(data => JSON.parse(data))).toEqual([
      { type: 'hello', protocolVersion: PROTOCOL_VERSION }, { type: 'reconnect', roomCode: '123456', reconnectToken: 'token' },
    ]);
    expect(client.move('right')).toBe(1); expect(client.castSkill('random_clear')).toBe(1);
    client.close(); expect(client.snapshot().status).toBe('closed');
  });
});

describe('platform storage, lifecycle, haptics, system, and account', () => {
  it('keeps Browser storage keys and survives denied storage', async () => {
    const data = new Map<string, string>();
    const browser = new BrowserStorage(() => ({ getItem: key => data.get(key) ?? null, setItem: (key, value) => { data.set(key, value); }, removeItem: key => { data.delete(key); } }) as Storage);
    browser.setItem('doublefight-theme', 'kingdom'); expect(browser.getItem('doublefight-theme')).toBe('kingdom'); browser.removeItem('doublefight-theme'); expect(browser.getItem('doublefight-theme')).toBeNull();
    const denied = new BrowserStorage(() => { throw new Error('denied'); }); expect(denied.getItem('x')).toBeNull(); expect(() => denied.setItem('x', 'y')).not.toThrow(); expect(() => denied.removeItem('x')).not.toThrow();
    await expect(new BrowserPlatform().account.bootstrap()).resolves.toMatchObject({ status: 'local', isLoggedIn: false });
  });

  it('round-trips Douyin storage and survives missing or throwing APIs', () => {
    const data = new Map<string, string>();
    const storage = new DouyinStorage({ getStorageSync: key => data.get(key), setStorageSync: (key, value) => { data.set(key, value); }, removeStorageSync: key => { data.delete(key); } });
    storage.setItem('settings', '{}'); expect(storage.getItem('settings')).toBe('{}'); storage.removeItem('settings'); expect(storage.getItem('settings')).toBeNull();
    const denied = new DouyinStorage({ getStorageSync: () => { throw Error('denied'); }, setStorageSync: () => { throw Error('denied'); }, removeStorageSync: () => { throw Error('denied'); } });
    expect(denied.getItem('x')).toBeNull(); expect(() => denied.setItem('x', 'y')).not.toThrow(); expect(() => denied.removeItem('x')).not.toThrow();
  });

  it('keeps lifecycle and render loop idempotent across repeated show/hide', () => {
    const events = new Map<string, Function>(); const api = { onShow: vi.fn((f: Function) => events.set('show', f)), onHide: vi.fn((f: Function) => events.set('hide', f)) };
    const lifecycle = new DouyinLifecycleAdapter(api); const frames = new Map<number, () => void>(); let id = 0;
    const render = vi.fn(); const resume = vi.fn(); const suspend = vi.fn();
    const loop = new DouyinRenderLoop(lifecycle, { request: callback => { frames.set(++id, callback); return id; }, cancel: handle => { frames.delete(handle); } }, render, resume, suspend);
    events.get('show')!(); events.get('show')!(); expect(resume).toHaveBeenCalledOnce(); expect(frames.size).toBe(1);
    for (let i = 0; i < 4; i++) { events.get('hide')!(); events.get('hide')!(); expect(frames.size).toBe(0); events.get('show')!(); events.get('show')!(); expect(frames.size).toBe(1); }
    expect(resume).toHaveBeenCalledTimes(5); expect(suspend).toHaveBeenCalledTimes(4);
    const callback = [...frames.values()][0]; frames.clear(); callback(); expect(render).toHaveBeenCalledOnce(); expect(frames.size).toBe(1);
    loop.dispose(); expect(frames.size).toBe(0); expect(api.onShow).toHaveBeenCalledOnce(); expect(api.onHide).toHaveBeenCalledOnce();
  });

  it('maps Browser visibility/page lifecycle without duplicate dispatch', () => {
    const doc = new EventTarget() as Document; Object.defineProperty(doc, 'hidden', { value: false, configurable: true, writable: true });
    const win = new EventTarget(); vi.stubGlobal('document', doc); vi.stubGlobal('window', win);
    const lifecycle = new BrowserLifecycle(); const show = vi.fn(); const hide = vi.fn(); const dispose = lifecycle.subscribe(show, hide);
    doc.dispatchEvent(new Event('visibilitychange')); win.dispatchEvent(new Event('pagehide')); win.dispatchEvent(new Event('pagehide'));
    expect(hide).toHaveBeenCalledOnce(); win.dispatchEvent(new Event('pageshow')); expect(show).toHaveBeenCalledOnce();
    dispose(); win.dispatchEvent(new Event('pagehide')); expect(hide).toHaveBeenCalledOnce();
  });

  it('falls back safely for haptics and normalizes system insets', () => {
    expect(() => new BrowserHaptics(undefined).trigger('light')).not.toThrow();
    expect(() => new DouyinHaptics({ vibrateShort: () => { throw Error('unsupported'); } }).trigger('success')).not.toThrow();
    const vibrateShort = vi.fn(); new DouyinHaptics({ vibrateShort }).trigger('medium'); expect(vibrateShort).toHaveBeenCalledWith(expect.objectContaining({ fail: expect.any(Function) }));
    expect(normalizeDouyinSystemInfo({ screenWidth: 430, screenHeight: 932, pixelRatio: 3, safeArea: { left: 0, top: 47, right: 430, bottom: 898 } })).toEqual({
      width: 430, height: 932, pixelRatio: 3, runtime: 'douyin', safeArea: { top: 47, right: 0, bottom: 34, left: 0 },
    });
  });

  it.each([
    [{ isLogin: true, code: 'temporary-code', anonymousCode: 'anonymous' }, 'logged_in'],
    [{ isLogin: false, anonymousCode: 'anonymous' }, 'anonymous'],
    [{ isLogin: true }, 'failed'],
  ] as const)('deduplicates cold-start tt.login for %s', async (value, status) => {
    let success: ((value: unknown) => void) | undefined;
    const login = vi.fn((options: { force: boolean; success: (value: unknown) => void }) => { expect(options.force).toBe(false); success = options.success; });
    const account = new DouyinAccountBootstrap({ login: login as DouyinApi['login'] });
    const first = account.bootstrap(); const second = account.bootstrap(); expect(first).toBe(second); expect(login).toHaveBeenCalledOnce();
    success!(value); expect(await first).toMatchObject({ status }); expect(await account.bootstrap()).toMatchObject({ status }); expect(login).toHaveBeenCalledOnce();
  });

  it('returns typed cancellation/failure without throwing', async () => {
    for (const [message, status] of [['login:fail cancel', 'cancelled'], ['login:fail unavailable', 'failed']] as const) {
      const account = new DouyinAccountBootstrap({ login: options => options.fail({ errMsg: message }) });
      expect(await account.bootstrap()).toMatchObject({ status, isLoggedIn: false, error: message });
    }
    expect(await new DouyinAccountBootstrap({ login: () => { throw Error('crash'); } }).bootstrap()).toMatchObject({ status: 'failed' });
  });
});
