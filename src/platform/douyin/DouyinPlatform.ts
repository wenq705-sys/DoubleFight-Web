import type { AccountBootstrap, AccountBootstrapResult, AccountProfileResult, HapticsAdapter, LifecycleAdapter, Platform, StorageAdapter, SystemInfo } from '../types';
import type { DouyinApi, DouyinCanvas, DouyinImage } from '../../../platform/douyin/src/api';
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
  private enabled = true;
  constructor(private readonly api: Pick<DouyinApi, 'vibrateShort'>) {}
  setEnabled(enabled: boolean): void { this.enabled = enabled; }
  trigger(_intent: 'light' | 'medium' | 'success' | 'error'): void {
    if (!this.enabled) return;
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
  constructor(private readonly api: Pick<DouyinApi, 'login' | 'getSetting' | 'authorize' | 'openSetting' | 'getUserInfo' | 'getUserProfile'>) {}
  reset(): void { this.result = null; }
  requestProfile(): Promise<AccountProfileResult> {
    return new Promise(resolve => {
      let settled = false;
      const finish = (result: AccountProfileResult) => {
        if (settled) return;
        settled = true;
        resolve(result);
      };
      const success = (result: { userInfo?: { nickName?: string; avatarUrl?: string } }) => {
        const nickName = result.userInfo?.nickName?.trim();
        const avatarUrl = result.userInfo?.avatarUrl?.trim();
        if (!nickName) { finish({ status: 'failed', error: 'profile missing nickname' }); return; }
        finish({ status: 'granted', nickName, ...(avatarUrl ? { avatarUrl } : {}) });
      };
      const failure = (error: { errMsg?: string; errNo?: number; errorCode?: number }) => {
        const code = error.errNo ?? error.errorCode;
        const message = `${code ?? ''} ${error.errMsg ?? 'Douyin user profile failed'}`.trim();
        finish({
          status: /deny|cancel|not authorized|privacy permission|permission disabled|21102|21103/i.test(message)
            ? 'cancelled'
            : 'failed',
          error: message,
        });
      };
      const requestUserInfo = () => {
        if (settled) return;
        try {
          if (this.api.getUserInfo) {
            this.api.getUserInfo({ withCredentials: false, success, fail: failure });
            return;
          }
          if (this.api.getUserProfile) {
            this.api.getUserProfile({ force: true, success, fail: failure });
            return;
          }
          finish({ status: 'unavailable', error: 'Douyin user profile API unavailable' });
        } catch (error) {
          finish({ status: 'failed', error: String(error) });
        }
      };
      const openUserInfoSetting = () => {
        if (!this.api.openSetting) {
          finish({ status: 'cancelled', error: '10201 scope.userInfo permission disabled' });
          return;
        }
        try {
          this.api.openSetting({
            success: result => {
              if (result.authSetting?.['scope.userInfo'] === true) requestUserInfo();
              else finish({ status: 'cancelled', error: '10201 scope.userInfo permission disabled' });
            },
            fail: failure,
          });
        } catch (error) {
          finish({ status: 'failed', error: String(error) });
        }
      };
      const requestUserInfoPermission = () => {
        if (!this.api.authorize) {
          requestUserInfo();
          return;
        }
        try {
          this.api.authorize({
            scope: 'scope.userInfo',
            success: result => {
              const granted = result.data?.['scope.userInfo'];
              if (granted === false || granted === 'fail') {
                openUserInfoSetting();
                return;
              }
              requestUserInfo();
            },
            fail: error => {
              const message = `${error.errNo ?? ''} ${error.errMsg ?? ''}`.trim();
              if (/deny|21102|21103/i.test(message)) openUserInfoSetting();
              else failure(error);
            },
          });
        } catch (error) {
          finish({ status: 'failed', error: String(error) });
        }
      };
      const ensureUserInfoPermission = () => {
        if (!this.api.getSetting) {
          requestUserInfoPermission();
          return;
        }
        try {
          this.api.getSetting({
            success: result => {
              const granted = result.authSetting?.['scope.userInfo'];
              if (granted === true) requestUserInfo();
              else if (granted === false) openUserInfoSetting();
              else requestUserInfoPermission();
            },
            fail: () => requestUserInfoPermission(),
          });
        } catch {
          requestUserInfoPermission();
        }
      };

      if (!this.api.login) {
        finish({ status: 'unavailable', error: 'tt.login unavailable' });
        return;
      }

      try {
        this.api.login({
          force: true,
          success: result => {
            if (!result.isLogin) {
              finish({ status: 'cancelled', error: '10601 user not login' });
              return;
            }
            ensureUserInfoPermission();
          },
          fail: error => {
            const message = error.errMsg ?? 'tt.login failed';
            finish({ status: /cancel|deny/i.test(message) ? 'cancelled' : 'failed', error: message });
          },
        });
      } catch (error) {
        finish({ status: 'failed', error: String(error) });
      }
    });
  }
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

export function normalizeDouyinSystemInfo(
  raw: ReturnType<DouyinApi['getSystemInfoSync']>,
  menuButton?: ReturnType<NonNullable<DouyinApi['getMenuButtonLayout']>>,
): SystemInfo {
  const width = Math.max(0, raw.windowWidth ?? raw.screenWidth);
  const height = Math.max(0, raw.windowHeight ?? raw.screenHeight);
  const safe = raw.safeArea;
  return { width, height, pixelRatio: Math.max(1, raw.pixelRatio || 1), runtime: 'douyin', safeArea: {
    top: Math.max(0, safe?.top ?? 0),
    left: Math.max(0, safe?.left ?? 0),
    right: Math.max(0, raw.screenWidth - (safe?.right ?? raw.screenWidth)),
    bottom: Math.max(0, raw.screenHeight - (safe?.bottom ?? raw.screenHeight)),
  }, ...(menuButton ? { menuButton } : {}) };
}

export class DouyinPlatform implements Platform {
  readonly socket: DouyinSocketTransport;
  readonly storage: DouyinStorage;
  readonly haptics: DouyinHaptics;
  readonly lifecycle: DouyinLifecycleAdapter;
  readonly account: DouyinAccountBootstrap;
  private systemInfo: SystemInfo | null = null;
  private stableViewport: { width: number; height: number } | null = null;

  constructor(private readonly api: DouyinApi) {
    this.socket = new DouyinSocketTransport(api);
    this.storage = new DouyinStorage(api);
    this.haptics = new DouyinHaptics(api);
    this.lifecycle = new DouyinLifecycleAdapter(api);
    this.account = new DouyinAccountBootstrap(api);
    this.lifecycle.subscribe(() => this.refreshSystemInfo(), () => {});
  }

  getSystemInfo(): SystemInfo {
    return this.systemInfo ?? this.refreshSystemInfo();
  }

  refreshSystemInfo(): SystemInfo {
    let menuButton: ReturnType<NonNullable<DouyinApi['getMenuButtonLayout']>> | undefined;
    try { menuButton = this.api.getMenuButtonLayout?.(); } catch { /* optional host chrome */ }
    let next = normalizeDouyinSystemInfo(this.api.getSystemInfoSync(), menuButton);

    // Mini-game viewport dimensions should be stable for a session. Some preview/
    // host gesture paths can report browser-like zoomed window dimensions after
    // accidental multi-touch. Keep the original logical viewport unless the
    // orientation actually changes, so HUD/layout can never get "stuck zoomed".
    if (!this.stableViewport) {
      this.stableViewport = { width: next.width, height: next.height };
    } else {
      const stablePortrait = this.stableViewport.height >= this.stableViewport.width;
      const nextPortrait = next.height >= next.width;
      const widthScale = next.width / Math.max(1, this.stableViewport.width);
      const heightScale = next.height / Math.max(1, this.stableViewport.height);
      // Pinch zoom changes both logical axes by essentially the same scale while
      // preserving orientation. Real viewport/layout changes generally alter
      // aspect ratio, so accept those and establish a new stable viewport.
      const proportionalScale = Math.abs(widthScale - heightScale) < 0.035;
      const meaningfulScale = Math.abs(widthScale - 1) > 0.06 || Math.abs(heightScale - 1) > 0.06;
      const looksLikeZoom = stablePortrait === nextPortrait && proportionalScale && meaningfulScale;
      if (looksLikeZoom) {
        next = { ...next, width: this.stableViewport.width, height: this.stableViewport.height };
      } else if (next.width !== this.stableViewport.width || next.height !== this.stableViewport.height) {
        this.stableViewport = { width: next.width, height: next.height };
      }
    }

    this.systemInfo = next;
    return this.systemInfo;
  }

  createCanvas(): DouyinCanvas { return this.api.createCanvas(); }
  createImage(): DouyinImage | null { try { return this.api.createImage?.() ?? null; } catch { return null; } }
  createSwipeInput(
    onDirection: (direction: Direction) => void,
    onTap?: (x: number, y: number) => void,
    onMultiTouchReset?: () => void,
  ): DouyinSwipeInput { return new DouyinSwipeInput(this.api, onDirection, onTap, onMultiTouchReset); }
}
