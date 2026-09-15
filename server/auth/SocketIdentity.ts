import type { IncomingHttpHeaders } from 'node:http';
import type { AccountRepository } from './AccountRepository';
import { SessionToken } from './SessionToken';

export interface BoundAccount { accountId: string; displayName: string }

/** A missing/invalid bearer is a guest. No credential enters Protocol v6. */
export async function resolveSocketIdentity(
  headers: IncomingHttpHeaders,
  sessions: SessionToken,
  repository: AccountRepository,
  now = Date.now(),
): Promise<BoundAccount | null> {
  const authorization = headers.authorization;
  if (typeof authorization !== 'string') return null;
  const bearer = /^Bearer ([A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)$/.exec(authorization);
  if (!bearer) return null;
  const accountId = sessions.verify(bearer[1], now);
  if (!accountId) return null;
  try {
    const account = await repository.findById(accountId);
    return account ? { accountId: account.id, displayName: account.profile.displayName } : null;
  } catch { return null; }
}
