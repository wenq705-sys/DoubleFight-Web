import type { AccountBootstrap, AccountBootstrapResult, HapticsAdapter, LifecycleAdapter, Platform, StorageAdapter, SystemInfo } from '../types';
import type { DouyinApi, DouyinCanvas } from '../../../platform/douyin/src/api';
import type { Direction } from '../../../shared/game/types';
import { DouyinSwipeInput } from '../../../platform/douyin/src/touch';
import { DouyinSocketTransport } from './DouyinSocketTransport';

export class DouyinStorage implements StorageAdapter {
  constructor(private readonly api: Pick<DouyinApi, 'getStorageSync' | 'setStorageSync' | 'removeStorageSync'>) {}
  getItem(key: string): string | null {
    try { const value = this.api.getStorageSync?.(key); return value === undefined || value === null || value === '' ? null : String(value); }
    catch { return null; }
  }
  setItem(key: string, value: string): void { try { this.api.setStorageSync?.(key, value); } catch { /* optional local cache */ } }
  removeItem(key: string): void { try { this.api.removeStorageSync?.(key); } catch { /* optional local cache */ } }
}

export class DouyinHaptics implements HapticsAdapter {
  constructor(private readonly api: Pick<DouyinApi, 'vibrateShort'>) {}
  trigger(_intent: 'light' | 'medium' | 'success' | 'error'): void {
    try { this.api.vibrateShort?.({ fail: () => { /* unsupported host */ } }); }
    catch { /* PC and unsupported hosts are silent */ }
  }
}

export class DouyinLifecycleAdapter implements LifecycleAdapter {
  private listeners = new Set<{ show: () => void; hide: () => void }>();
  private currentVisible = false;
  get visible(): boolean { return this.currentVisible; }
  constructor(api: Pick<DouyinApi, 'onShow' | 'onHide'>) {
    api.onShow(() => this.change(true));
    api.onHide(() => this.change(false));
  }
  subscribe(onShow: () => void, onHide: () => void): () => void {
    const entry = { show: onShow, hide: onHide };
    this.listeners.add(entry);
    return () => { this.listeners.delete(entry); };
  }
  show(): void { this.change(true); }
  hide(): void { this.change(false); }
  private change(visible: boolean): void {
    if (this.currentVisible === visible) return;
    this.currentVisible = visible;
    for (const listener of this.listeners) (visible ? listener.show : listener.hide)();
  }
}

export class DouyinAccountBootstrap implements AccountBootstrap {
  private result: Promise<AccountBootstrapResult> | null = null;
  constructor(private readonly api: Pick<DouyinApi, 'login'>) {}
  bootstrap(): Promise<AccountBootstrapResult> {
    if (this.result) return this.result;
    this.result = new Promise(resolve => {
      if (!this.api.login) { resolve({ status: 'failed', isLoggedIn: false, error: 'tt.login unavailable' }); return; }
      try {
        this.api.login({ force: false, success: value => {
          if (value.isLogin && value.code) resolve({ status: 'logged_in', isLoggedIn: true, code: value.code, anonymousCode: value.anonymousCode });
          else if (value.anonymousCode) resolve({ status: 'anonymous', isLoggedIn: false, anonymousCode: value.anonymousCode });
          else resolve({ status: 'failed', isLoggedIn: false, error: 'tt.login returned no code' });
        }, fail: error => {
          const message = error.errMsg ?? 'tt.login failed';
          resolve({ status: /cancel/i.test(message) ? 'cancelled' : 'failed', isLoggedIn: false, error: message });
        } });
      } catch (error) { resolve({ status: 'failed', isLoggedIn: false, error: String(error) }); }
    });
    return this.result;
  }
}

export function normalizeDouyinSystemInfo(raw: ReturnType<DouyinApi['getSystemInfoSync']>): SystemInfo {
  const width = Math.max(0, raw.windowWidth ?? raw.screenWidth);
  const height = Math.max(0, raw.windowHeight ?? raw.screenHeight);
  const safe = raw.safeArea;
  return { width, height, pixelRatio: Math.max(1, raw.pixelRatio || 1), runtime: 'douyin', safeArea: {
    top: Math.max(0, safe?.top ?? 0),
    left: Math.max(0, safe?.left ?? 0),
    right: Math.max(0, raw.screenWidth - (safe?.right ?? raw.screenWidth)),
    bottom: Math.max(0, raw.screenHeight - (safe?.bottom ?? raw.screenHeight)),
  } };
}

export class DouyinPlatform implements Platform {
  readonly socket: DouyinSocketTransport;
  readonly storage: DouyinStorage;
  readonly haptics: DouyinHaptics;
  readonly lifecycle: DouyinLifecycleAdapter;
  readonly account: DouyinAccountBootstrap;
  constructor(private readonly api: DouyinApi) {
    this.socket = new DouyinSocketTransport(api);
    this.storage = new DouyinStorage(api);
    this.haptics = new DouyinHaptics(api);
    this.lifecycle = new DouyinLifecycleAdapter(api);
    this.account = new DouyinAccountBootstrap(api);
  }
  getSystemInfo(): SystemInfo { return normalizeDouyinSystemInfo(this.api.getSystemInfoSync()); }
  createCanvas(): DouyinCanvas { return this.api.createCanvas(); }
  createSwipeInput(onDirection: (direction: Direction) => void): DouyinSwipeInput { return new DouyinSwipeInput(this.api, onDirection); }
}
