import type { Platform } from '../../../src/platform/types';
import type { DouyinApi } from './api';
import { DOUYIN_PRODUCT_CONFIG } from './config';

interface PublicPlayer {
  id: string;
  displayName: string;
  solo: { bestKingdom: number; highestKingdom: number; bestPalace: number; highestPalace: number };
  pvp: { wins: number; losses: number; draws: number; rating: number };
  rewards: { currency: number; lastSidebarRewardDay?: string };
}

type AuthState = { status: 'authenticated'; player: PublicPlayer } | { status: 'local' };
const TOKEN_KEY = 'doublefight-session-token';

export class DouyinAuthClient {
  private token: string | null = null;
  private state: AuthState = { status: 'local' };
  private starting: Promise<AuthState> | null = null;

  constructor(
    private readonly api: Pick<DouyinApi, 'request'>,
    private readonly platform: Pick<Platform, 'account' | 'storage'>,
    private readonly baseUrl: string = DOUYIN_PRODUCT_CONFIG.apiUrl,
  ) {}

  get current(): AuthState { return this.state; }
  get requiresServerLedger(): boolean { return this.token !== null; }

  start(): Promise<AuthState> {
    if (this.state.status === 'authenticated') return Promise.resolve(this.state);
    if (this.starting) return this.starting;
    const attempt = this.initialize();
    this.starting = attempt;
    void attempt.finally(() => {
      if (this.starting === attempt) this.starting = null;
    });
    return attempt;
  }

  private async initialize(): Promise<AuthState> {
    const stored = this.platform.storage.getItem(TOKEN_KEY);
    if (stored) {
      this.token = stored;
      try {
        const restored = await this.call('GET', '/me');
        if (this.isPlayer(restored.player)) {
          this.state = { status: 'authenticated', player: restored.player };
          return this.state;
        }
      } catch (error) {
        if (!(error instanceof HttpError) || error.status !== 401) return this.state;
      }
      this.token = null;
      this.platform.storage.removeItem(TOKEN_KEY);
    }

    const login = await Promise.race([
      this.platform.account.bootstrap(),
      new Promise<{ status: 'failed'; isLoggedIn: false }>(resolve => setTimeout(() => resolve({ status: 'failed', isLoggedIn: false }), 5000)),
    ]);
    if (login.status !== 'logged_in' && login.status !== 'anonymous') {
      this.platform.account.reset?.();
      return this.state;
    }
    try {
      const payload = await this.call('POST', '/auth/douyin', {
        ...(login.status === 'logged_in' ? { code: login.code } : {}),
        ...(login.anonymousCode ? { anonymousCode: login.anonymousCode } : {}),
      });
      if (typeof payload.token !== 'string' || !this.isPlayer(payload.player)) {
        this.platform.account.reset?.();
        return this.state;
      }
      this.token = payload.token;
      this.platform.storage.setItem(TOKEN_KEY, payload.token);
      this.state = { status: 'authenticated', player: payload.player };
    } catch (error) {
      // A provider 401 means the one-use code was consumed/rejected. Allow the
      // next foreground/reward attempt to obtain a fresh tt.login credential.
      if (error instanceof HttpError && error.status === 401) this.platform.account.reset?.();
      // Transient failures keep the cached login result for one retry.
    }
    return this.state;
  }

  async claimSidebar(): Promise<'granted' | 'duplicate' | 'unavailable'> {
    if (!this.token) return 'unavailable';
    try {
      const data = await this.call('POST', '/rewards/sidebar', { source: 'sidebar_return' });
      this.updatePlayer(data.player);
      return data.granted === true ? 'granted' : 'duplicate';
    } catch { return 'unavailable'; }
  }

  async claimAd(claimId: string): Promise<'granted' | 'duplicate' | 'unavailable'> {
    if (!this.token) return 'unavailable';
    try {
      const data = await this.call('POST', '/rewards/ad', { kind: 'solo_skill_refill', claimId });
      this.updatePlayer(data.player);
      return data.granted === true ? 'granted' : 'duplicate';
    } catch { return 'unavailable'; }
  }

  private updatePlayer(value: unknown): void {
    if (this.isPlayer(value)) this.state = { status: 'authenticated', player: value };
  }

  private isPlayer(value: unknown): value is PublicPlayer {
    return Boolean(value && typeof value === 'object'
      && typeof (value as PublicPlayer).id === 'string'
      && typeof (value as PublicPlayer).displayName === 'string'
      && typeof (value as PublicPlayer).rewards?.currency === 'number');
  }

  private call(method: 'GET' | 'POST', path: string, data?: Record<string, unknown>): Promise<Record<string, unknown>> {
    if (!this.api.request || !this.baseUrl.startsWith('https://')) return Promise.reject(new Error('HTTPS request unavailable'));
    return new Promise((resolve, reject) => {
      let settled = false;
      const complete = (result: unknown, error?: Error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        if (error) reject(error);
        else resolve(result as Record<string, unknown>);
      };
      const timeout = setTimeout(() => complete(null, new Error('request timeout')), 5000);
      try {
        this.api.request?.({
          url: `${this.baseUrl}${path}`, method, data, dataType: 'json',
          header: { 'content-type': 'application/json', ...(this.token ? { authorization: `Bearer ${this.token}` } : {}) },
          success: result => {
            const body = typeof result.data === 'string' ? safeJson(result.data) : result.data;
            if (result.statusCode < 200 || result.statusCode >= 300 || !body || typeof body !== 'object') {
              complete(null, new HttpError(result.statusCode));
            } else complete(body);
          },
          fail: () => complete(null, new Error('request failed')),
        });
      } catch { complete(null, new Error('request failed')); }
    });
  }
}

class HttpError extends Error {
  constructor(readonly status: number) { super(`HTTP ${status}`); }
}

function safeJson(raw: string): unknown {
  try { return JSON.parse(raw); } catch { return null; }
}
