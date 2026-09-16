import type { Platform } from '../../../src/platform/types';
import type { DouyinApi } from './api';
import { DOUYIN_PRODUCT_CONFIG } from './config';

export interface PublicPlayerDailyState {
  day: string;
  loginClaimed: boolean;
  adClaimed: boolean;
  tasks: { solo: boolean; pvp: boolean; ad: boolean };
  streak: number;
}

export interface PublicPlayerSeason {
  seasonId: string;
  rating: number;
  wins: number;
  losses: number;
  draws: number;
  matches: number;
  endsAt: number;
}

export interface PublicPlayer {
  id: string;
  displayName: string;
  solo: { bestKingdom: number; highestKingdom: number; bestPalace: number; highestPalace: number };
  pvp: { wins: number; losses: number; draws: number; rating: number };
  rewards: { currency: number; lastSidebarRewardDay?: string; daily?: PublicPlayerDailyState };
  season?: PublicPlayerSeason;
  themes?: { owned: string[] };
}

export interface PvpLeaderboardEntry {
  rank: number;
  displayName: string;
  rating: number;
  wins: number;
  losses: number;
  draws: number;
  matches: number;
}

export interface PvpLeaderboard {
  season: { id: string; startsAt: number; endsAt: number };
  entries: PvpLeaderboardEntry[];
}

export interface ThemeCatalogueEntry {
  id: string;
  free: boolean;
  cost: number;
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
    private readonly onSessionToken: (token: string | null) => void = () => {},
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

  /** Pull the latest server-owned profile after PvP/reward mutations. */
  async refresh(): Promise<AuthState> {
    if (!this.token) return this.start();
    try {
      const payload = await this.call('GET', '/me');
      if (this.isPlayer(payload.player)) this.updatePlayer(payload.player);
    } catch (error) {
      this.handleSessionFailure(error);
    }
    return this.state;
  }

  private async initialize(): Promise<AuthState> {
    const stored = this.platform.storage.getItem(TOKEN_KEY);
    if (stored) {
      this.setToken(stored);
      try {
        const restored = await this.call('GET', '/me');
        if (this.isPlayer(restored.player)) {
          this.state = { status: 'authenticated', player: restored.player };
          this.restoreSoloCache(restored.player);
          return this.state;
        }
      } catch (error) {
        if (!(error instanceof HttpError) || error.status !== 401) return this.state;
      }
      this.setToken(null);
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
      this.setToken(payload.token);
      this.platform.storage.setItem(TOKEN_KEY, payload.token);
      this.state = { status: 'authenticated', player: payload.player };
      this.restoreSoloCache(payload.player);
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
    } catch (error) {
      this.handleSessionFailure(error);
      return 'unavailable';
    }
  }

  async claimAd(claimId: string): Promise<'granted' | 'duplicate' | 'unavailable'> {
    if (!this.token) return 'unavailable';
    try {
      const data = await this.call('POST', '/rewards/ad', { kind: 'solo_skill_refill', claimId });
      this.updatePlayer(data.player);
      return data.granted === true ? 'granted' : 'duplicate';
    } catch (error) {
      this.handleSessionFailure(error);
      return 'unavailable';
    }
  }

  async claimDailySCoin(claimId: string): Promise<'granted' | 'duplicate' | 'unavailable'> {
    if (!this.token) return 'unavailable';
    try {
      const data = await this.call('POST', '/rewards/ad', { kind: 'daily_s_coin', claimId });
      this.updatePlayer(data.player);
      return data.granted === true ? 'granted' : 'duplicate';
    } catch (error) {
      this.handleSessionFailure(error);
      return 'unavailable';
    }
  }

  async fetchPvpLeaderboard(limit = 20): Promise<PvpLeaderboard | null> {
    const safeLimit = Math.max(1, Math.min(50, Math.floor(limit)));
    try {
      const data = await this.call('GET', `/leaderboards/pvp?limit=${safeLimit}`);
      if (!this.isLeaderboard(data)) return null;
      return data;
    } catch (error) {
      this.handleSessionFailure(error);
      return null;
    }
  }

  async fetchThemes(): Promise<ThemeCatalogueEntry[] | null> {
    if (!this.token) return null;
    try {
      const data = await this.call('GET', '/themes');
      this.updatePlayer(data.player);
      if (!Array.isArray(data.themes)) return null;
      const themes = data.themes.filter((value): value is ThemeCatalogueEntry => this.isTheme(value));
      return themes.length === data.themes.length ? themes : null;
    } catch (error) {
      this.handleSessionFailure(error);
      return null;
    }
  }

  async syncSoloProgress(theme: 'kingdom' | 'palace', best: number, highest: number): Promise<boolean> {
    await this.start();
    if (!this.token) return false;
    try {
      const data = await this.call('POST', '/progress/solo', { theme, best, highest });
      this.updatePlayer(data.player);
      return this.isPlayer(data.player);
    } catch (error) {
      this.handleSessionFailure(error);
      return false;
    }
  }

  private handleSessionFailure(error: unknown): void {
    if (!(error instanceof HttpError) || error.status !== 401) return;
    this.setToken(null);
    this.platform.storage.removeItem(TOKEN_KEY);
    this.state = { status: 'local' };
    this.platform.account.reset?.();
  }

  private setToken(token: string | null): void {
    this.token = token;
    this.onSessionToken(token);
  }

  private restoreSoloCache(player: PublicPlayer): void {
    for (const theme of ['kingdom', 'palace'] as const) {
      const best = theme === 'kingdom' ? player.solo.bestKingdom : player.solo.bestPalace;
      const highest = theme === 'kingdom' ? player.solo.highestKingdom : player.solo.highestPalace;
      const bestKey = `doublefight-best-${theme}`;
      const highestKey = `doublefight-highest-${theme}`;
      if (Number.isSafeInteger(best) && best > Number(this.platform.storage.getItem(bestKey) ?? 0)) {
        this.platform.storage.setItem(bestKey, String(best));
      }
      if (Number.isSafeInteger(highest) && highest > Number(this.platform.storage.getItem(highestKey) ?? 2)) {
        this.platform.storage.setItem(highestKey, String(highest));
      }
    }
  }

  private updatePlayer(value: unknown): void {
    if (this.isPlayer(value)) {
      this.state = { status: 'authenticated', player: value };
      this.restoreSoloCache(value);
    }
  }

  private isPlayer(value: unknown): value is PublicPlayer {
    return Boolean(value && typeof value === 'object'
      && typeof (value as PublicPlayer).id === 'string'
      && typeof (value as PublicPlayer).displayName === 'string'
      && typeof (value as PublicPlayer).solo?.bestKingdom === 'number'
      && typeof (value as PublicPlayer).solo?.highestKingdom === 'number'
      && typeof (value as PublicPlayer).solo?.bestPalace === 'number'
      && typeof (value as PublicPlayer).solo?.highestPalace === 'number'
      && typeof (value as PublicPlayer).rewards?.currency === 'number');
  }

  private isLeaderboard(value: unknown): value is PvpLeaderboard {
    if (!value || typeof value !== 'object') return false;
    const candidate = value as PvpLeaderboard;
    return Boolean(candidate.season
      && typeof candidate.season.id === 'string'
      && typeof candidate.season.startsAt === 'number'
      && typeof candidate.season.endsAt === 'number'
      && Array.isArray(candidate.entries)
      && candidate.entries.every(entry => entry
        && Number.isInteger(entry.rank)
        && typeof entry.displayName === 'string'
        && typeof entry.rating === 'number'
        && typeof entry.wins === 'number'
        && typeof entry.losses === 'number'
        && typeof entry.draws === 'number'
        && typeof entry.matches === 'number'));
  }

  private isTheme(value: unknown): value is ThemeCatalogueEntry {
    return Boolean(value && typeof value === 'object'
      && typeof (value as ThemeCatalogueEntry).id === 'string'
      && typeof (value as ThemeCatalogueEntry).free === 'boolean'
      && typeof (value as ThemeCatalogueEntry).cost === 'number');
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
