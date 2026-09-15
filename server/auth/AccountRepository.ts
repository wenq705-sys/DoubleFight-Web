import { randomUUID } from 'node:crypto';
import { mkdir, open, readFile, rename, rm } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type { MatchEndReason } from '../../shared/index';

export interface PlayerAccount {
  id: string;
  douyinOpenId: string;
  unionId?: string;
  anonymousOpenId?: string;
  createdAt: number;
  updatedAt: number;
  profile: { displayName: string };
  solo: { bestKingdom: number; highestKingdom: number; bestPalace: number; highestPalace: number };
  pvp: { wins: number; losses: number; draws: number; rating: number };
  rewards: { currency: number; lastSidebarRewardDay?: string };
  adClaims: string[];
}

export type PublicPlayer = Pick<PlayerAccount, 'id' | 'solo' | 'pvp' | 'rewards'> & { displayName: string };
export function publicPlayer(account: PlayerAccount): PublicPlayer {
  return {
    id: account.id,
    displayName: account.profile.displayName,
    solo: { ...account.solo },
    pvp: { ...account.pvp },
    rewards: { ...account.rewards },
  };
}

export interface AccountRepository {
  findById(id: string): Promise<PlayerAccount | null>;
  findOrCreate(openId: string, unionId?: string, anonymousOpenId?: string): Promise<{ account: PlayerAccount; created: boolean }>;
  claimSidebar(id: string, day: string): Promise<{ account: PlayerAccount; granted: boolean }>;
  claimAd(id: string, kind: 'solo_skill_refill', claimId: string): Promise<{ account: PlayerAccount; granted: boolean }>;
  mergeSoloProgress(id: string, theme: 'kingdom' | 'palace', best: number, highest: number): Promise<PlayerAccount>;
  recordMatch(result: AccountMatchResult): Promise<boolean>;
}

export interface AccountMatchResult {
  matchId: string;
  reason: MatchEndReason;
  winnerId: string | null;
  players: readonly { playerId: string; accountId?: string }[];
}

export const MAX_RECENT_AD_CLAIMS = 256;
export const MAX_RECENT_MATCHES = 512;
export const PVP_ELO_K = 24;

interface State { version: 1; accounts: PlayerAccount[]; processedMatches: string[] }
const fresh = (): State => ({ version: 1, accounts: [], processedMatches: [] });

/** Serialized mutations and atomic rename keep a single-server ledger durable across restarts. */
export class JsonAccountRepository implements AccountRepository {
  private state: State = fresh();
  private pending: Promise<unknown> = Promise.resolve();
  private constructor(private readonly file: string) {}

  static async open(file: string): Promise<JsonAccountRepository> {
    const repo = new JsonAccountRepository(file);
    try {
      const parsed: unknown = JSON.parse(await readFile(file, 'utf8'));
      if (!parsed || typeof parsed !== 'object' || (parsed as State).version !== 1 || !Array.isArray((parsed as State).accounts)) {
        throw new Error('unsupported account data format');
      }
      const state = parsed as State;
      const priorMatchCount = Array.isArray(state.processedMatches) ? state.processedMatches.length : 0;
      state.processedMatches = Array.isArray(state.processedMatches)
        ? state.processedMatches.slice(-MAX_RECENT_MATCHES) : [];
      let trimmed = priorMatchCount > MAX_RECENT_MATCHES;
      for (const account of state.accounts) {
        if (!Array.isArray(account.adClaims)) account.adClaims = [];
        if (account.adClaims.length > MAX_RECENT_AD_CLAIMS) {
          account.adClaims = account.adClaims.slice(-MAX_RECENT_AD_CLAIMS);
          trimmed = true;
        }
      }
      repo.state = state;
      if (trimmed) await repo.persist();
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
    return repo;
  }

  async findById(id: string): Promise<PlayerAccount | null> {
    await this.pending;
    return this.state.accounts.find(account => account.id === id) ?? null;
  }

  findOrCreate(openId: string, unionId?: string, anonymousOpenId?: string): Promise<{ account: PlayerAccount; created: boolean }> {
    return this.mutate<{ account: PlayerAccount; created: boolean }>(() => {
      const anonymousKey = anonymousOpenId ? `anonymous:${anonymousOpenId}` : undefined;
      const existing = this.state.accounts.find(account =>
        account.douyinOpenId === openId
        || Boolean(unionId && account.unionId === unionId)
        || Boolean(anonymousOpenId && account.anonymousOpenId === anonymousOpenId)
        || Boolean(anonymousKey && account.douyinOpenId === anonymousKey)
      );
      const now = Date.now();
      if (existing) {
        let changed = false;
        // Promote an anonymous-only account when Douyin later returns a real logged-in openid.
        if (!openId.startsWith('anonymous:') && existing.douyinOpenId !== openId) {
          existing.douyinOpenId = openId;
          changed = true;
        }
        if (unionId && existing.unionId !== unionId) {
          existing.unionId = unionId;
          changed = true;
        }
        if (anonymousOpenId && existing.anonymousOpenId !== anonymousOpenId) {
          existing.anonymousOpenId = anonymousOpenId;
          changed = true;
        }
        if (changed) existing.updatedAt = now;
        return { result: { account: existing, created: false }, changed };
      }
      const id = randomUUID();
      const account: PlayerAccount = {
        id,
        douyinOpenId: openId,
        ...(unionId ? { unionId } : {}),
        ...(anonymousOpenId ? { anonymousOpenId } : {}),
        createdAt: now,
        updatedAt: now,
        profile: { displayName: `玩家${id.replace(/-/g, '').slice(0, 4).toUpperCase()}` },
        solo: { bestKingdom: 0, highestKingdom: 2, bestPalace: 0, highestPalace: 2 },
        pvp: { wins: 0, losses: 0, draws: 0, rating: 1000 },
        rewards: { currency: 0 }, adClaims: [],
      };
      this.state.accounts.push(account);
      return { result: { account, created: true }, changed: true };
    });
  }

  claimSidebar(id: string, day: string): Promise<{ account: PlayerAccount; granted: boolean }> {
    return this.mutate<{ account: PlayerAccount; granted: boolean }>(() => {
      const account = this.requireAccount(id);
      if (account.rewards.lastSidebarRewardDay === day) return { result: { account, granted: false }, changed: false };
      account.rewards.lastSidebarRewardDay = day;
      account.updatedAt = Date.now();
      return { result: { account, granted: true }, changed: true };
    });
  }

  claimAd(id: string, _kind: 'solo_skill_refill', claimId: string): Promise<{ account: PlayerAccount; granted: boolean }> {
    return this.mutate<{ account: PlayerAccount; granted: boolean }>(() => {
      const account = this.requireAccount(id);
      if (account.adClaims.includes(claimId)) return { result: { account, granted: false }, changed: false };
      account.adClaims.push(claimId);
      if (account.adClaims.length > MAX_RECENT_AD_CLAIMS) account.adClaims.shift();
      account.updatedAt = Date.now();
      return { result: { account, granted: true }, changed: true };
    });
  }

  mergeSoloProgress(id: string, theme: 'kingdom' | 'palace', best: number, highest: number): Promise<PlayerAccount> {
    return this.mutate(() => {
      const account = this.requireAccount(id);
      const bestKey = theme === 'kingdom' ? 'bestKingdom' : 'bestPalace';
      const highestKey = theme === 'kingdom' ? 'highestKingdom' : 'highestPalace';
      const nextBest = Math.max(account.solo[bestKey], best);
      const nextHighest = Math.max(account.solo[highestKey], highest);
      const changed = nextBest !== account.solo[bestKey] || nextHighest !== account.solo[highestKey];
      if (changed) {
        account.solo[bestKey] = nextBest;
        account.solo[highestKey] = nextHighest;
        account.updatedAt = Date.now();
      }
      return { result: account, changed };
    });
  }

  recordMatch(result: AccountMatchResult): Promise<boolean> {
    return this.mutate(() => {
      if (this.state.processedMatches.includes(result.matchId)) return { result: false, changed: false };
      if (result.players.length !== 2) throw new Error('invalid match result');
      const accountIds = result.players.map(player => player.accountId).filter((id): id is string => Boolean(id));
      if (accountIds.length === 0 || new Set(accountIds).size !== accountIds.length) {
        return { result: false, changed: false };
      }
      const accounts = result.players.map(player => player.accountId
        ? this.state.accounts.find(account => account.id === player.accountId) ?? null : null);
      const ratings = accounts.map(account => account?.pvp.rating ?? 1000);
      const now = Date.now();
      for (let index = 0; index < 2; index += 1) {
        const account = accounts[index];
        if (!account) continue;
        const player = result.players[index];
        const score = result.winnerId === null ? 0.5 : result.winnerId === player.playerId ? 1 : 0;
        if (score === 1) account.pvp.wins += 1;
        else if (score === 0) account.pvp.losses += 1;
        else account.pvp.draws += 1;
        const expected = 1 / (1 + 10 ** ((ratings[1 - index] - ratings[index]) / 400));
        account.pvp.rating = Math.max(0, ratings[index] + Math.round(PVP_ELO_K * (score - expected)));
        account.updatedAt = now;
      }
      this.state.processedMatches.push(result.matchId);
      if (this.state.processedMatches.length > MAX_RECENT_MATCHES) this.state.processedMatches.shift();
      return { result: true, changed: true };
    });
  }

  private requireAccount(id: string): PlayerAccount {
    const account = this.state.accounts.find(value => value.id === id);
    if (!account) throw new Error('account missing');
    return account;
  }

  private mutate<T>(change: () => { result: T; changed: boolean }): Promise<T> {
    const operation = this.pending.then(async () => {
      const before = structuredClone(this.state);
      try {
        const { result, changed } = change();
        if (changed) await this.persist();
        return result;
      } catch (error) {
        this.state = before;
        throw error;
      }
    });
    this.pending = operation.catch(() => undefined);
    return operation;
  }

  private async persist(): Promise<void> {
    const directory = dirname(this.file);
    await mkdir(directory, { recursive: true, mode: 0o700 });
    const temporary = join(directory, `.accounts-${randomUUID()}.tmp`);
    try {
      const handle = await open(temporary, 'wx', 0o600);
      try {
        await handle.writeFile(JSON.stringify(this.state));
        await handle.sync();
      } finally { await handle.close(); }
      await rename(temporary, this.file);
      // Directory fsync is available on Linux; Windows does not always permit opening a directory.
      if (process.platform !== 'win32') {
        const folder = await open(directory, 'r');
        try { await folder.sync(); } finally { await folder.close(); }
      }
    } finally { await rm(temporary, { force: true }); }
  }
}
