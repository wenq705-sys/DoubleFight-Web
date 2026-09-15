# M2.10.3 — Douyin Server Auth & Reward Ledger

## Goal

Complete the missing server-side identity and reward-integrity layer for the Douyin Full Product RC without changing Protocol v6 gameplay semantics.

This milestone turns the existing client-side `tt.login()` bootstrap into a real Double Fight account/session and moves reward authority for ads / side-panel return / persistent player progression to the server.

## Branch

`feat/m2-10-3-douyin-server-auth`

This branch is intentionally based on the latest Douyin client product branch so the auth client seam can be wired and tested end to end before sequential merge.

## Hard security rules

- `DOUYIN_APP_SECRET` must exist only in server runtime environment variables.
- Never commit AppSecret, session_key, openid, unionid, or production session signing secrets.
- The temporary `tt.login()` code is single-use and must never become the Double Fight user id.
- The client receives only a Double Fight user/session representation; raw provider secrets stay server-side.
- Session tokens must be signed with a server-only secret and expire.
- Reward claims must be idempotent; duplicate delivery/retry must not duplicate rewards.
- Do not weaken existing WebSocket protocol authority or trust client-supplied scores/results.

## Environment

Add documented environment variables with safe local-development behavior:

- `DOUYIN_APP_ID`
- `DOUYIN_APP_SECRET`
- `DOUBLEFIGHT_SESSION_SECRET`
- optional `DOUBLEFIGHT_DATA_DIR` for persistent local server state

Production must fail closed when auth endpoints are used without the required provider/signing secrets.

Do not print secrets in logs.

## Provider exchange

Implement a small Douyin auth provider module responsible only for exchanging the temporary login credential with the official provider API.

Input:

```ts
{ code?: string; anonymousCode?: string }
```

Output normalized internally to something like:

```ts
{
  openid: string;
  unionid?: string;
  anonymousOpenid?: string;
  sessionKey?: string;
}
```

`sessionKey` must never be returned to the client and should not be persisted unless a concrete future feature requires it.

Provider errors must be mapped to typed application errors and must not expose provider secrets/raw confidential payloads.

## Double Fight account model

Introduce a stable internal user record:

```ts
interface PlayerAccount {
  id: string;                  // Double Fight generated id
  douyinOpenId: string;
  unionId?: string;
  createdAt: number;
  updatedAt: number;
  profile: {
    displayName: string;
  };
  solo: {
    bestKingdom: number;
    highestKingdom: number;
    bestPalace: number;
    highestPalace: number;
  };
  pvp: {
    wins: number;
    losses: number;
    draws: number;
    rating: number;
  };
  rewards: {
    currency: number;
    lastSidebarRewardDay?: string;
  };
}
```

Do not add user-editable free-text nickname flows in this milestone.

## Persistence

Use a bounded persistence abstraction suitable for the current single production server.

Requirements:

- durable across process/container restarts;
- atomic writes or append-safe persistence;
- no in-memory-only production account state;
- interface designed so SQLite/Postgres can replace the first implementation later;
- tests may use an in-memory adapter.

A small SQLite-backed repository is preferred if adding it remains operationally simple. If a dependency is added, justify it and ensure the production container build remains deterministic.

If choosing file-backed JSON instead, writes must be atomic and serialized; document the migration limitation clearly.

## HTTP API

Extend the existing game server with minimal JSON endpoints.

### POST `/auth/douyin`

Request:

```json
{ "code": "temporary-login-code", "anonymousCode": "optional" }
```

Behavior:

1. validate input;
2. exchange with Douyin provider server-side;
3. find/create account by provider identity;
4. issue a signed Double Fight session token;
5. return safe public profile/state.

Response shape:

```json
{
  "token": "...",
  "expiresAt": 0,
  "player": {
    "id": "...",
    "displayName": "玩家1234",
    "solo": { ... },
    "pvp": { ... },
    "rewards": { ... }
  }
}
```

Never return `openid`, `unionid`, provider session key, AppSecret, or signing key.

### GET `/me`

Bearer session required.

Returns current safe public account state.

### POST `/rewards/sidebar`

Bearer session required.

Server decides whether today's side-panel reward can be granted.

Must be idempotent per player/day.

### POST `/rewards/ad`

Bearer session required.

Do **not** trust arbitrary client reward amount.

Request identifies a server-known reward type / claim id. For RC, create a bounded schema such as:

```json
{
  "kind": "solo_skill_refill",
  "claimId": "client-generated-unique-id"
}
```

Server owns reward definition and rejects duplicate `claimId` for that player.

Important: native rewarded-ad completion cannot be cryptographically proven from the current client callback alone. Treat this endpoint as replay-safe accounting, not perfect anti-fraud. Document this explicitly. If Douyin provides a server-verifiable ad callback/token for the configured product, add it as a later hardening seam rather than inventing verification.

## Session token

Use a compact signed token or opaque random session token stored server-side.

Requirements:

- expiry;
- signature/entropy suitable for production;
- constant-time verification where applicable;
- bearer extraction middleware;
- tests for tamper/expiry/missing token;
- easy key rotation path documented.

Do not reuse PvP `reconnectToken` as an account session token.

## PvP record persistence

After authoritative match completion, update account PvP record only when the WebSocket player can be associated with an authenticated account.

Do not trust client-reported winner/score.

If binding authenticated account identity into the existing WebSocket hello/room flow would require a Protocol v7 change, **do not change Protocol v6 in this milestone**. Instead:

- implement auth + persistence endpoints now;
- document the exact future handshake extension needed for authoritative PvP-account attribution;
- keep current gameplay protocol stable.

Browser anonymous PvP must continue working.

## Client seam

Add a Douyin auth client that:

1. calls existing `platform.account.bootstrap()` once;
2. sends temporary provider code to `/auth/douyin`;
3. stores only the Double Fight session token in Douyin storage;
4. restores `/me` on future cold starts;
5. falls back to local anonymous product mode if auth server/provider is unavailable;
6. never blocks Home/Solo rendering indefinitely.

The UI should expose authenticated state subtly, not with a login wall.

## Reward client integration

Replace purely local authoritative reward bookkeeping where practical:

- side-panel daily reward → server claim when authenticated;
- rewarded Solo refill → server replay-safe claim when authenticated;
- offline/anonymous development path may retain local fallback, clearly separated from production authority.

PvP combat power must remain unaffected by ads/reward claims.

## CORS / network

The auth HTTP endpoint will be called by the Douyin mini-game client.

- Configure the production HTTPS API endpoint under the existing game domain or a dedicated legal-domain host.
- Keep TLS termination in existing Nginx architecture.
- Do not edit production Nginx in this code PR unless required and explicitly validated.
- Release client config must point to HTTPS, never plaintext HTTP.

## Logging / observability

Add safe structured events for:

- auth success/failure category;
- account create vs reuse;
- invalid/expired session;
- reward granted/duplicate/rejected;

Never log login code, access token, session token, AppSecret, provider session key, or full openid.

## Tests

At minimum cover:

- provider exchange success normalization;
- provider error mapping;
- new user creation;
- existing user reuse;
- no provider secret in response/log-safe objects;
- session sign/verify;
- token tamper rejected;
- token expiry rejected;
- `/auth/douyin` validation;
- `/me` auth required;
- sidebar reward idempotent by day;
- ad reward claim idempotent by claim id;
- unknown reward kind rejected;
- persistence survives repository reopen;
- existing Protocol v6 server smoke remains unchanged;
- Browser quick/private/reconnect smoke remains green;
- Douyin dev/release builds remain green.

## Required validation

Run:

```bash
npm run typecheck
npm test
npm run build
npm run build:douyin
npm run build:douyin -- --release
```

Run existing server + public protocol smoke locally.

Add an auth smoke using a mocked provider exchange; CI must never call the real Douyin provider or require production secrets.

## Deployment boundary

Do not deploy production automatically from this branch.

Before production deployment the operator must supply server environment secrets out-of-band.

Do not ask for AppSecret in chat, commit messages, screenshots, or repository files.

## Completion report

Return:

1. branch / commits / PR;
2. account repository design;
3. auth endpoint behavior;
4. session design;
5. reward ledger behavior;
6. client bootstrap behavior;
7. tests / smokes;
8. production environment variables required;
9. explicit deferred PvP authenticated-account attribution if Protocol v6 was intentionally preserved;
10. manual production steps.

## Implementation handoff (branch)

- `server/auth/` exchanges one-use credentials using the official POST code2Session API, stores a generated Double Fight account in a serialized, atomic JSON file, and signs 30-day HMAC-SHA256 bearer sessions. Only the current key signs; the optional previous key verifies during rotation. The raw provider `session_key` is discarded.
- Production Compose mounts a named `doublefight-data` volume at `/data`; `DOUBLEFIGHT_DATA_DIR=/data`. The JSON adapter is intended for one server process only. Moving to multiple replicas requires a transactional shared database and data migration before scale-out.
- `/auth/douyin`, `/me`, `/rewards/sidebar`, `/rewards/ad` are implemented under the existing HTTP server. Auth/reward routes are included in the repository Nginx template for the later deployment; the live Nginx host is unchanged by this PR. Browser anonymous WebSocket sessions remain unchanged.
- Sidebar claims are one per account per UTC day; ad claims are one per account and `claimId`. The client only claims after a completed native rewarded-video callback. Neither the sidebar return flag nor native ad callback is cryptographic proof to the server. This ledger prevents retry/replay duplication, but it is **not** ad-fraud verification. A provider-verifiable callback/token is a later hardening seam.
- These two claims preserve the existing next-Solo bonus and Solo skill refill. The reserved `currency` field is not incremented because this milestone defines no currency economy.
- The Douyin development build may grant local anonymous rewards for preview. The release build does not grant local rewards when account/ledger service is unavailable; Home/Solo remain usable.
- Solo score/highest and PvP counters exist in the account schema but are not promoted from untrusted client reports. Protocol v6 has no authenticated WebSocket hello/account binding, so authoritative PvP-account attribution requires a future versioned handshake extension. Solo score persistence also requires a trusted verification design; local Browser/Douyin scores remain as before.
- Server runtime needs `DOUYIN_APP_ID`, `DOUYIN_APP_SECRET`, and a random `DOUBLEFIGHT_SESSION_SECRET` of at least 32 bytes. Keep secrets in an operator-managed server environment outside Git. Optional `DOUBLEFIGHT_SESSION_SECRET_PREVIOUS` permits one-key rotation grace. Missing secrets fail closed on auth requests. The client release API URL is HTTPS; register `game.whvwayfare.online` as a legal request domain in Douyin before publishing.
- Run `npm run smoke:auth` for a mock-provider HTTP check. CI runs it without provider credentials. A future production rollout must mount/preserve the data volume, install and validate the reviewed Nginx route config, set secrets out-of-band, then verify authenticated endpoints and backup/restore before accepting real accounts.
