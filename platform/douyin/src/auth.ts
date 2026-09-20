import { THEME_UNLOCK_ECONOMY } from '../../../shared/index';
import type { Platform } from '../../../src/platform/types';
import { THEME_IDS, type ThemeId } from '../../../src/config/themes';
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
  avatarUrl?: string;
  solo: { bestKingdom: number; highestKingdom: number; bestPalace: number; highestPalace: number };
  soloByTheme?: Record<string, { best: number; highest: number }>;
  pvp: { wins: number; losses: number; draws: number; rating: number };
  rewards: { currency: number; lastSidebarRewardDay?: string; daily?: PublicPlayerDailyState };
  season?: PublicPlayerSeason;
  themes?: { owned: string[]; adUnlockProgress?: Record<string, number>; adViewsToday?: number; adDailyRemaining?: number };
}

export interface PvpLeaderboardEntry {
  rank: number;
  displayName: string;
  avatarUrl?: string;
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
  adViews?: number;
}

export interface ThemeAdUnlockResult {
  status: 'granted' | 'duplicate' | 'limited' | 'unavailable';
  unlocked: boolean;
  progress: number;
  required: number;
  dailyRemaining: number;
}

export interface AuthoritativeRewardResult {
  status: 'granted' | 'duplicate' | 'unavailable';
  amount: number;
  taskAmount: number;
}

export interface DailyLoginGrant {
  amount: number;
  streakAmount: number;
}

export interface SoloProgressSyncResult {
  synced: boolean;
  discoveryAmount: number;
  taskAmount: number;
}

type AuthState = { status: 'authenticated'; player: PublicPlayer } | { status: 'local' };
const TOKEN_KEY = 'doublefight-session-token';

export class DouyinAuthClient {
  private token: string | null = null;
  private state: AuthState = { status: 'local' };
  private starting: Promise<AuthState> | null = null;
  private pendingDailyLoginGrant: DailyLoginGrant | null = null;
  private dailyLoginListeners = new Set<(grant: DailyLoginGrant) => void>();

  constructor(
    private readonly api: Pick<DouyinApi, 'request'>,
    private readonly platform: Pick<Platform, 'account' | 'storage'>,
    private readonly baseUrl: string = DOUYIN_PRODUCT_CONFIG.apiUrl,
    private readonly onSessionToken: (token: string | null) => void = () => {},
  ) {}

  get current(): AuthState { return this.state; }
  get requiresServerLedger(): boolean { return this.token !== null; }

  consumeDailyLoginGrant(): DailyLoginGrant | null {
    const grant = this.pendingDailyLoginGrant;
    this.pendingDailyLoginGrant = null;
    return grant;
  }

  subscribeDailyLoginGrant(listener: (grant: DailyLoginGrant) => void): () => void {
    this.dailyLoginListeners.add(listener);
    return () => { this.dailyLoginListeners.delete(listener); };
  }

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
      this.captureDailyLoginGrant(payload.dailyLogin);
      if (this.isPlayer(payload.player)) this.updatePlayer(payload.player);
    } catch (error) {
      const unauthorized = error instanceof HttpError && error.status === 401;
      this.handleSessionFailure(error);
      if (unauthorized) return this.start();
    }
    return this.state;
  }

  private async initialize(): Promise<AuthState> {
    const stored = this.platform.storage.getItem(TOKEN_KEY);
    if (stored) {
      this.setToken(stored);
      try {
        const restored = await this.call('GET', '/me');
        this.captureDailyLoginGrant(restored.dailyLogin);
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
      this.captureDailyLoginGrant(payload.dailyLogin);
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

  async bindDouyinProfile(): Promise<'updated' | 'cancelled' | 'failed' | 'unavailable'> {
    if (!this.token || !this.platform.account.requestProfile) return 'unavailable';
    const profile = await this.platform.account.requestProfile();
    if (profile.status !== 'granted') return profile.status === 'cancelled' ? 'cancelled' : profile.status === 'unavailable' ? 'unavailable' : 'failed';
    try {
      const data = await this.call('POST', '/profile', {
        displayName: profile.nickName,
        ...(profile.avatarUrl ? { avatarUrl: profile.avatarUrl } : {}),
      });
      if (!this.isPlayer(data.player)) return 'failed';
      this.updatePlayer(data.player);
      return 'updated';
    } catch (error) {
      this.handleSessionFailure(error);
      return 'failed';
    }
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

  async claimDailySCoinDetailed(claimId: string): Promise<AuthoritativeRewardResult> {
    if (!this.token) return { status: 'unavailable', amount: 0, taskAmount: 0 };
    try {
      const data = await this.call('POST', '/rewards/ad', { kind: 'daily_s_coin', claimId });
      this.updatePlayer(data.player);
      return {
        status: data.granted === true ? 'granted' : 'duplicate',
        amount: safeAmount(data.amount),
        taskAmount: safeAmount(data.taskAmount),
      };
    } catch (error) {
      this.handleSessionFailure(error);
      return { status: 'unavailable', amount: 0, taskAmount: 0 };
    }
  }

  async claimDailySCoin(claimId: string): Promise<'granted' | 'duplicate' | 'unavailable'> {
    return (await this.claimDailySCoinDetailed(claimId)).status;
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

  isThemeOwned(theme: ThemeId): boolean {
    if (THEME_UNLOCK_ECONOMY[theme].free) return true;
    if (this.state.status === 'authenticated' && this.state.player.themes?.owned.includes(theme)) return true;
    try {
      const cached = JSON.parse(this.platform.storage.getItem('doublefight-owned-themes') ?? '[]') as unknown;
      return Array.isArray(cached) && cached.includes(theme);
    } catch {
      return false;
    }
  }

  themeUnlockProgress(theme: ThemeId): { progress: number; required: number; dailyRemaining: number } {
    const required = THEME_UNLOCK_ECONOMY[theme].adViewsRequired;
    const themes = this.state.status === 'authenticated' ? this.state.player.themes : undefined;
    return {
      progress: Math.min(required, Math.max(0, Math.floor(themes?.adUnlockProgress?.[theme] ?? 0))),
      required,
      dailyRemaining: Math.max(0, Math.floor(themes?.adDailyRemaining ?? 0)),
    };
  }

  async purchaseTheme(theme: ThemeId): Promise<'unlocked' | 'owned' | 'insufficient' | 'unavailable'> {
    await this.start();
    if (!this.token || this.state.status !== 'authenticated') return 'unavailable';
    if (this.isThemeOwned(theme)) return 'owned';
    if (this.state.player.rewards.currency < THEME_UNLOCK_ECONOMY[theme].coinCost) return 'insufficient';
    const requestId = `theme_${theme}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
    try {
      const data = await this.call('POST', '/themes/unlock', { themeId: theme, requestId });
      this.updatePlayer(data.player);
      return data.unlocked === true ? 'unlocked' : 'insufficient';
    } catch (error) {
      if (error instanceof HttpError && error.status === 409) return 'insufficient';
      this.handleSessionFailure(error);
      return 'unavailable';
    }
  }

  async claimThemeUnlockAd(theme: ThemeId, claimId: string): Promise<ThemeAdUnlockResult> {
    await this.start();
    const required = THEME_UNLOCK_ECONOMY[theme].adViewsRequired;
    if (!this.token) return { status: 'unavailable', unlocked: false, progress: 0, required, dailyRemaining: 0 };
    try {
      const data = await this.call('POST', '/themes/unlock/ad', { themeId: theme, claimId });
      this.updatePlayer(data.player);
      return {
        status: data.limited === true ? 'limited' : data.granted === true ? 'granted' : 'duplicate',
        unlocked: data.unlocked === true,
        progress: safeCount(data.progress, required),
        required: safeCount(data.required, required) || required,
        dailyRemaining: safeCount(data.dailyRemaining, 2),
      };
    } catch (error) {
      this.handleSessionFailure(error);
      return { status: 'unavailable', unlocked: false, progress: 0, required, dailyRemaining: 0 };
    }
  }

  async syncSoloProgressDetailed(
    theme: ThemeId,
    best: number,
    highest: number,
  ): Promise<SoloProgressSyncResult> {
    await this.start();
    if (!this.token) return { synced: false, discoveryAmount: 0, taskAmount: 0 };
    try {
      const data = await this.call('POST', '/progress/solo', { theme, best, highest });
      this.updatePlayer(data.player);
      return {
        synced: this.isPlayer(data.player),
        discoveryAmount: safeAmount(data.discoveryAmount),
        taskAmount: safeAmount(data.taskAmount),
      };
    } catch (error) {
      this.handleSessionFailure(error);
      return { synced: false, discoveryAmount: 0, taskAmount: 0 };
    }
  }

  async syncSoloProgress(theme: ThemeId, best: number, highest: number): Promise<boolean> {
    return (await this.syncSoloProgressDetailed(theme, best, highest)).synced;
  }

  private captureDailyLoginGrant(value: unknown): void {
    if (!value || typeof value !== 'object') return;
    const grant = value as { granted?: unknown; amount?: unknown; streakAmount?: unknown };
    if (grant.granted !== true) return;
    const amount = safeAmount(grant.amount);
    const streakAmount = safeAmount(grant.streakAmount);
    if (amount <= 0 && streakAmount <= 0) return;
    const valueGrant = { amount, streakAmount };
    this.pendingDailyLoginGrant = valueGrant;
    for (const listener of this.dailyLoginListeners) listener(valueGrant);
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
    for (const theme of THEME_IDS) {
      const generic = player.soloByTheme?.[theme];
      const best = generic?.best
        ?? (theme === 'kingdom' ? player.solo.bestKingdom : theme === 'palace' ? player.solo.bestPalace : 0);
      const highest = generic?.highest
        ?? (theme === 'kingdom' ? player.solo.highestKingdom : theme === 'palace' ? player.solo.highestPalace : 2);
      const bestKey = `doublefight-best-${theme}`;
      const highestKey = `doublefight-highest-${theme}`;
      if (Number.isSafeInteger(best) && best > Number(this.platform.storage.getItem(bestKey) ?? 0)) {
        this.platform.storage.setItem(bestKey, String(best));
      }
      if (Number.isSafeInteger(highest) && highest > Number(this.platform.storage.getItem(highestKey) ?? 2)) {
        this.platform.storage.setItem(highestKey, String(highest));
      }
    }
    const ownedThemes = (player.themes?.owned ?? []).filter((theme): theme is ThemeId => THEME_IDS.includes(theme as ThemeId));
    this.platform.storage.setItem('doublefight-owned-themes', JSON.stringify(ownedThemes));
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
      && ((value as PublicPlayer).avatarUrl === undefined || typeof (value as PublicPlayer).avatarUrl === 'string')
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
        && (entry.avatarUrl === undefined || typeof entry.avatarUrl === 'string')
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
      && typeof (value as ThemeCatalogueEntry).cost === 'number'
      && ((value as ThemeCatalogueEntry).adViews === undefined || typeof (value as ThemeCatalogueEntry).adViews === 'number'));
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

function safeAmount(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
}

function safeCount(value: unknown, max: number): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.max(0, Math.min(max, Math.floor(value)))
    : 0;
}
