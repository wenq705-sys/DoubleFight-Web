import { createHmac, timingSafeEqual } from 'node:crypto';

const TTL_SECONDS = 30 * 24 * 60 * 60;

export class SessionToken {
  constructor(private readonly current: string | undefined, private readonly previous?: string) {}

  issue(accountId: string, now = Date.now()): { token: string; expiresAt: number } {
    const secret = this.requireSecret();
    const expiresAt = now + TTL_SECONDS * 1000;
    const payload = Buffer.from(JSON.stringify({ v: 1, sub: accountId, exp: expiresAt })).toString('base64url');
    return { token: `${payload}.${this.sign(payload, secret)}`, expiresAt };
  }

  assertConfigured(): void { this.requireSecret(); }

  verify(token: string, now = Date.now()): string | null {
    if (!this.current || Buffer.byteLength(this.current) < 32 || token.length > 2048) return null;
    const parts = token.split('.');
    if (parts.length !== 2 || !/^[A-Za-z0-9_-]+$/.test(parts[0]) || !/^[A-Za-z0-9_-]+$/.test(parts[1])) return null;
    const [payload, signature] = parts;
    const actual = Buffer.from(signature, 'base64url');
    const valid = [this.current, this.previous]
      .filter((key): key is string => Boolean(key) && Buffer.byteLength(key!) >= 32)
      .some(key => {
      const expected = Buffer.from(this.sign(payload, key), 'base64url');
      return actual.length === expected.length && timingSafeEqual(actual, expected);
    });
    if (!valid) return null;
    try {
      const data: unknown = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
      if (!data || typeof data !== 'object') return null;
      const item = data as { v?: unknown; sub?: unknown; exp?: unknown };
      return item.v === 1 && typeof item.sub === 'string' && item.sub.length > 0
        && typeof item.exp === 'number' && Number.isFinite(item.exp) && item.exp > now ? item.sub : null;
    } catch { return null; }
  }

  private requireSecret(): string {
    if (!this.current || Buffer.byteLength(this.current) < 32) throw new Error('DOUBLEFIGHT_SESSION_SECRET must be at least 32 bytes');
    return this.current;
  }

  private sign(payload: string, secret: string): string {
    return createHmac('sha256', secret).update(payload).digest('base64url');
  }
}
