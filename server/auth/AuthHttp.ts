import type { IncomingMessage, ServerResponse } from 'node:http';
import { RELEASE_THEME_IDS, type ReleaseThemeId } from '../../shared/index';
import type { AccountRepository } from './AccountRepository';
import { currentSeason, ownedThemes, publicPlayer, THEME_REGISTRY } from './AccountRepository';
import type { DouyinProvider } from './DouyinProvider';
import { ProviderError } from './DouyinProvider';
import { SessionToken } from './SessionToken';

export interface AuthDependencies {
  repository: AccountRepository;
  provider: DouyinProvider;
  sessions: SessionToken;
  now?: () => number;
  log?: (event: Record<string, string | boolean>) => void;
}

const routes = new Set(['/auth/douyin', '/me', '/profile', '/progress/solo', '/rewards/sidebar', '/rewards/ad', '/themes', '/themes/unlock', '/themes/unlock/ad', '/season/current', '/leaderboards/pvp']);
const audit = (event: Record<string, string | boolean>) => console.info(JSON.stringify({ area: 'account', ...event }));

export function createAuthHandler(deps: AuthDependencies) {
  const now = deps.now ?? Date.now;
  const log = deps.log ?? audit;
  return async (request: IncomingMessage, response: ServerResponse): Promise<boolean> => {
    const path = request.url?.split('?')[0];
    if (!path || !routes.has(path)) return false;
    response.setHeader('access-control-allow-origin', '*');
    response.setHeader('access-control-allow-methods', 'GET, POST, OPTIONS');
    response.setHeader('access-control-allow-headers', 'authorization, content-type');
    response.setHeader('cache-control', 'no-store');
    if (request.method === 'OPTIONS') { response.writeHead(204).end(); return true; }
    if (request.method !== (path === '/me' || path === '/themes' || path === '/season/current' || path === '/leaderboards/pvp' ? 'GET' : 'POST')) {
      json(response, 405, { error: 'method_not_allowed' }); return true;
    }

    try {
      if (path === '/auth/douyin') {
        const body = await readBody(request);
        const code = credential(body.code);
        const anonymousCode = credential(body.anonymousCode);
        if (!code && !anonymousCode) { json(response, 400, { error: 'invalid_credentials' }); return true; }
        deps.sessions.assertConfigured();
        const identity = await deps.provider.exchange({ ...(code ? { code } : {}), ...(anonymousCode ? { anonymousCode } : {}) });
        const { account, created } = await deps.repository.findOrCreate(identity.openid, identity.unionid, identity.anonymousOpenid, now());
        const login = await deps.repository.claimDailyLogin(account.id, now());
        const session = deps.sessions.issue(account.id, now());
        log({ event: 'auth_success', account: created ? 'created' : 'reused' });
        json(response, 200, { ...session, player: publicPlayer(login.account, now()), dailyLogin: { granted: login.granted, amount: login.amount, streakAmount: login.streakAmount } });
        return true;
      }
      if (path === '/season/current') { json(response, 200, { season: currentSeason(now()) }); return true; }
      if (path === '/leaderboards/pvp') {
        const rawLimit = new URL(request.url ?? '/', 'http://localhost').searchParams.get('limit');
        const limit = rawLimit ? Number(rawLimit) : 50;
        if (!Number.isInteger(limit) || limit < 1 || limit > 50) throw new RequestError(400, 'invalid_limit');
        json(response, 200, await deps.repository.leaderboard(now(), limit)); return true;
      }

      const bearer = /^Bearer ([A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)$/.exec(request.headers.authorization ?? '');
      const accountId = bearer ? deps.sessions.verify(bearer[1], now()) : null;
      const account = accountId ? await deps.repository.findById(accountId) : null;
      if (!account) {
        log({ event: 'session_rejected', category: bearer ? 'invalid_or_expired' : 'missing' });
        json(response, 401, { error: 'unauthorized' }); return true;
      }
      if (path === '/me') {
        const login = await deps.repository.claimDailyLogin(account.id, now());
        json(response, 200, { player: publicPlayer(login.account, now()), dailyLogin: { granted: login.granted, amount: login.amount, streakAmount: login.streakAmount } }); return true;
      }
      if (path === '/themes') { json(response, 200, { themes: Object.entries(THEME_REGISTRY).map(([id, value]) => ({ id, ...value })), player: publicPlayer(account, now()) }); return true; }
      if (path === '/profile') {
        const body = await readBody(request);
        const displayName = profileName(body.displayName);
        const avatarUrl = profileAvatar(body.avatarUrl);
        const updated = await deps.repository.updateProfile(account.id, displayName, avatarUrl, now());
        log({ event: 'profile_updated', avatar: Boolean(updated.profile.avatarUrl) });
        json(response, 200, { player: publicPlayer(updated, now()) });
        return true;
      }

      if (path === '/progress/solo') {
        const body = await readBody(request);
        if (typeof body.theme !== 'string' || !(RELEASE_THEME_IDS as readonly string[]).includes(body.theme)) throw new RequestError(400, 'invalid_progress');
        const theme = body.theme as ReleaseThemeId;
        if (typeof body.best !== 'number' || !Number.isSafeInteger(body.best) || body.best < 0 || body.best > 100_000_000) {
          throw new RequestError(400, 'invalid_progress');
        }
        if (typeof body.highest !== 'number' || !Number.isSafeInteger(body.highest) || body.highest < 2
          || body.highest > 1_048_576 || !Number.isInteger(Math.log2(body.highest))) {
          throw new RequestError(400, 'invalid_progress');
        }
        // Validate the request shape before authorization so malformed payloads
        // keep the stable 400 contract; valid requests for locked themes are 403.
        if (!ownedThemes(account).includes(theme)) throw new RequestError(403, 'theme_locked');
        const updated = await deps.repository.mergeSoloProgress(account.id, theme, body.best, body.highest, now());
        json(response, 200, { player: publicPlayer(updated.account, now()), discoveryAmount: updated.discoveryAmount, taskAmount: updated.taskAmount });
        return true;
      }

      if (path === '/rewards/sidebar') {
        const body = await readBody(request);
        if (body.source !== 'sidebar_return') { json(response, 400, { error: 'invalid_source' }); return true; }
        const day = new Date(now()).toISOString().slice(0, 10);
        const result = await deps.repository.claimSidebar(account.id, day, now());
        log({ event: 'reward', kind: 'sidebar', outcome: result.granted ? 'granted' : 'duplicate' });
        json(response, 200, { granted: result.granted, reward: 'next_solo_bonus', amount: result.amount, player: publicPlayer(result.account, now()) });
        return true;
      }

      const body = await readBody(request);
      if (path === '/themes/unlock') {
        if (typeof body.themeId !== 'string' || !(body.themeId in THEME_REGISTRY)
          || typeof body.requestId !== 'string' || !/^[A-Za-z0-9_-]{8,100}$/.test(body.requestId)) {
          throw new RequestError(400, 'invalid_theme_request');
        }
        const result = await deps.repository.unlockTheme(account.id, body.themeId, body.requestId, now());
        json(response, result.unlocked ? 200 : 409, { unlocked: result.unlocked, amount: result.amount, player: publicPlayer(result.account, now()) });
        return true;
      }
      if (path === '/themes/unlock/ad') {
        if (typeof body.themeId !== 'string' || !(body.themeId in THEME_REGISTRY)
          || typeof body.claimId !== 'string' || !/^[A-Za-z0-9_-]{8,100}$/.test(body.claimId)) {
          throw new RequestError(400, 'invalid_theme_ad_request');
        }
        const result = await deps.repository.unlockThemeByAd(account.id, body.themeId, body.claimId, now());
        json(response, 200, { granted: result.granted, unlocked: result.unlocked, limited: result.limited, progress: result.progress, required: result.required, dailyRemaining: result.dailyRemaining, player: publicPlayer(result.account, now()) });
        return true;
      }
      if (body.kind !== 'solo_skill_refill' && body.kind !== 'daily_s_coin') {
        log({ event: 'reward', kind: 'ad', outcome: 'rejected' });
        json(response, 400, { error: 'unknown_reward_kind' }); return true;
      }
      if (typeof body.claimId !== 'string' || !/^[A-Za-z0-9_-]{8,100}$/.test(body.claimId)) {
        json(response, 400, { error: 'invalid_claim_id' }); return true;
      }
      const result = await deps.repository.claimAd(account.id, body.kind, body.claimId, now());
      log({ event: 'reward', kind: 'ad', outcome: result.granted ? 'granted' : 'duplicate' });
      json(response, 200, { granted: result.granted, reward: body.kind, amount: result.amount, taskAmount: result.taskAmount, player: publicPlayer(result.account, now()) });
      return true;
    } catch (error) {
      if (error instanceof RequestError) { json(response, error.status, { error: error.category }); return true; }
      if (error instanceof ProviderError) {
        log({ event: 'auth_failure', category: error.category });
        json(response, error.category === 'invalid_code' ? 401 : 503, { error: error.category });
        return true;
      }
      log({ event: 'request_failure', category: 'internal' });
      json(response, 503, { error: 'service_unavailable' });
      return true;
    }
  };
}

class RequestError extends Error {
  constructor(readonly status: number, readonly category: string) { super(category); }
}

function profileName(value: unknown): string {
  if (typeof value !== 'string') throw new RequestError(400, 'invalid_profile');
  const name = value.trim();
  const length = Array.from(name).length;
  if (length < 1 || length > 24 || /[\u0000-\u001f\u007f]/.test(name)) throw new RequestError(400, 'invalid_profile');
  return name;
}

function profileAvatar(value: unknown): string | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value !== 'string' || value.length > 2048) throw new RequestError(400, 'invalid_profile');
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:') throw new Error('https required');
    return url.toString();
  } catch { throw new RequestError(400, 'invalid_profile'); }
}

function credential(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || value.length < 4 || value.length > 2048 || !/^[\x21-\x7e]+$/.test(value)) {
    throw new RequestError(400, 'invalid_credentials');
  }
  return value;
}

async function readBody(request: IncomingMessage): Promise<Record<string, unknown>> {
  if (!request.headers['content-type']?.startsWith('application/json')) throw new RequestError(415, 'json_required');
  let raw = '';
  for await (const chunk of request) {
    raw += String(chunk);
    if (raw.length > 4096) throw new RequestError(413, 'body_too_large');
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('object required');
    return parsed as Record<string, unknown>;
  } catch { throw new RequestError(400, 'invalid_json'); }
}

function json(response: ServerResponse, status: number, body: object): void {
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(body));
}
