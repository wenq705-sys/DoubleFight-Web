import type { AccountBootstrap, HapticsAdapter, LifecycleAdapter, Platform, StorageAdapter, SystemInfo } from '../types';
import { BrowserSocketTransport } from './BrowserSocketTransport';

export class BrowserStorage implements StorageAdapter {
  constructor(private readonly access: () => Storage = () => window.localStorage) {}
  getItem(key: string): string | null { try { return this.access().getItem(key); } catch { return null; } }
  setItem(key: string, value: string): void { try { this.access().setItem(key, value); } catch { /* storage is optional */ } }
  removeItem(key: string): void { try { this.access().removeItem(key); } catch { /* storage is optional */ } }
}

export class BrowserHaptics implements HapticsAdapter {
  constructor(private readonly vibrate: ((pattern: number | number[]) => unknown) | undefined =
    typeof navigator === 'undefined' ? undefined : navigator.vibrate?.bind(navigator)) {}
  trigger(intent: 'light' | 'medium' | 'success' | 'error'): void {
    const pattern = { light: 8, medium: 16, success: [18, 8, 25], error: [24, 9, 30] }[intent];
    try { this.vibrate?.(pattern); } catch { /* unsupported device */ }
  }
}

export class BrowserLifecycle implements LifecycleAdapter {
  private listeners = new Set<{ show: () => void; hide: () => void }>();
  private attached = false;
  private currentVisible = typeof document === 'undefined' || !document.hidden;
  get visible(): boolean { return this.currentVisible; }
  private show = (): void => this.change(true);
  private hide = (): void => this.change(false);
  private visibility = (): void => this.change(!document.hidden);
  subscribe(onShow: () => void, onHide: () => void): () => void {
    const entry = { show: onShow, hide: onHide };
    this.listeners.add(entry);
    if (!this.attached && typeof window !== 'undefined' && typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', this.visibility);
      window.addEventListener('pageshow', this.show);
      window.addEventListener('pagehide', this.hide);
      this.attached = true;
    }
    return () => {
      this.listeners.delete(entry);
      if (this.attached && this.listeners.size === 0) {
        document.removeEventListener('visibilitychange', this.visibility);
        window.removeEventListener('pageshow', this.show);
        window.removeEventListener('pagehide', this.hide);
        this.attached = false;
      }
    };
  }
  private change(visible: boolean): void {
    if (this.currentVisible === visible) return;
    this.currentVisible = visible;
    for (const listener of this.listeners) (visible ? listener.show : listener.hide)();
  }
}

export class BrowserAccountBootstrap implements AccountBootstrap {
  bootstrap() { return Promise.resolve({ status: 'local' as const, isLoggedIn: false as const, identity: 'browser-anonymous' as const }); }
}

export class BrowserPlatform implements Platform {
  readonly socket = new BrowserSocketTransport();
  readonly storage = new BrowserStorage();
  readonly haptics = new BrowserHaptics();
  readonly lifecycle = new BrowserLifecycle();
  readonly account = new BrowserAccountBootstrap();
  getSystemInfo(): SystemInfo {
    return {
      width: typeof window === 'undefined' ? 0 : window.innerWidth,
      height: typeof window === 'undefined' ? 0 : window.innerHeight,
      pixelRatio: typeof window === 'undefined' ? 1 : Math.max(1, window.devicePixelRatio || 1),
      runtime: 'browser',
      // CSS env(safe-area-inset-*) remains the browser layout authority.
      safeArea: { top: 0, right: 0, bottom: 0, left: 0 },
    };
  }
}

export const browserPlatform = new BrowserPlatform();
