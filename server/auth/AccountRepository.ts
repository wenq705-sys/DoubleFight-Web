import { randomUUID } from 'node:crypto';
import { mkdir, open, readFile, rename, rm } from 'node:fs/promises';
import { dirname, join } from 'node:path';

export interface PlayerAccount {
  id: string;
  douyinOpenId: string;
  unionId?: string;
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
  findOrCreate(openId: string, unionId?: string): Promise<{ account: PlayerAccount; created: boolean }>;
  claimSidebar(id: string, day: string): Promise<{ account: PlayerAccount; granted: boolean }>;
  claimAd(id: string, kind: 'solo_skill_refill', claimId: string): Promise<{ account: PlayerAccount; granted: boolean }>;
}

interface State { version: 1; accounts: PlayerAccount[] }
const fresh = (): State => ({ version: 1, accounts: [] });

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
      repo.state = parsed as State;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
    return repo;
  }

  async findById(id: string): Promise<PlayerAccount | null> {
    await this.pending;
    return this.state.accounts.find(account => account.id === id) ?? null;
  }

  findOrCreate(openId: string, unionId?: string): Promise<{ account: PlayerAccount; created: boolean }> {
    return this.mutate<{ account: PlayerAccount; created: boolean }>(() => {
      const existing = this.state.accounts.find(account => account.douyinOpenId === openId);
      if (existing) return { result: { account: existing, created: false }, changed: false };
      const now = Date.now();
      const id = randomUUID();
      const account: PlayerAccount = {
        id, douyinOpenId: openId, ...(unionId ? { unionId } : {}), createdAt: now, updatedAt: now,
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
      account.updatedAt = Date.now();
      return { result: { account, granted: true }, changed: true };
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
