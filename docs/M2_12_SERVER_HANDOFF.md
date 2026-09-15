# M2.12 Server Handoff — Economy, Ownership & Competitive Season

This document is the contract for the server-heavy follow-up after the assistant-owned M2.12 client pass.

## Non-negotiable compatibility

- Preserve Protocol v6. Do not add WebSocket messages for economy unless there is no HTTP alternative.
- Preserve current auth/session behavior and anonymous-to-Douyin account promotion.
- Preserve existing endpoints:
  - `POST /auth/douyin`
  - `GET /me`
  - `POST /progress/solo`
  - `POST /rewards/sidebar`
  - `POST /rewards/ad`
- Preserve existing `solo_skill_refill` rewarded-ad behavior.
- Preserve sidebar return's current next-Solo-bonus behavior while adding S Coin if specified below.
- Current `kingdom` and `palace` themes remain free.
- S Coin never buys PvP power, energy, cooldown reduction, stronger skills or stat advantages.
- Existing account JSON must migrate safely in place. Never discard or silently reset existing Solo/PvP data.
- Single-server JSON persistence is acceptable for this milestone, but mutations must remain serialized, atomic and idempotent.

## Existing public player shape

The current client already consumes:

```ts
{
  id: string;
  displayName: string;
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

All new fields should be additive so the current M2.12 client keeps working during staged rollout.

## 1. Authoritative S Coin ledger

Target grants:

| Source | S Coin | Rule |
| --- | ---: | --- |
| Daily login | 15 | once per UTC day |
| Daily rewarded bonus | 30 | once per UTC day, rewarded ad completion + claim id |
| Sidebar return | 10 | once per UTC day |
| Daily Solo task | 5 | first authenticated Solo completion/sync of the UTC day |
| Daily PvP task | 5 | first server-recorded completed PvP match of the UTC day |
| Daily ad task | 5 | first successful daily rewarded S Coin claim of the UTC day |
| First piece discovery | 5 | each newly reached tier, server-derived from monotonic Solo highest |
| 7-day activity chest | 30 | once when a 7-day consecutive login streak is completed |

Do not trust a client-supplied coin delta.

### Recommended persisted economy state

Add a backward-compatible account field such as:

```ts
economy: {
  balance: number;
  lifetimeEarned: number;
  lastDailyLoginDay?: string;
  lastDailyAdDay?: string;
  loginStreak: number;
  lastLoginDay?: string;
  sevenDayChestCycle: number;
  dailyTaskDay?: string;
  dailyTasks: {
    solo: boolean;
    pvp: boolean;
    ad: boolean;
  };
  grants: string[]; // bounded recent idempotency keys
}
```

Keep `rewards.currency` as the public compatibility alias for `economy.balance` until the client is explicitly migrated.

Use stable grant keys, e.g.:
- `daily-login:2026-09-16`
- `sidebar:2026-09-16`
- `daily-ad:2026-09-16`
- `task:solo:2026-09-16`
- `discovery:kingdom:tier-7`
- `streak:cycle-3`

Bound grant history similarly to existing ad/match claim histories.

## 2. Daily login and seven-day chest

Daily login should be automatic on authenticated product use rather than requiring a fake client button.

Acceptable implementation:
- after successful `/auth/douyin`, claim today's login;
- on authenticated `/me`, also idempotently claim today's login.

Rules:
- UTC calendar day is the canonical server day;
- same day never double grants;
- consecutive next day increments streak;
- gap resets streak to 1;
- every completed 7-day cycle grants +30 once;
- response immediately returns the updated public player.

## 3. First-discovery rewards

Do not add a client-trusted `/reward/discovery` endpoint.

Derive discovery from `POST /progress/solo`:
- server already stores monotonic `highest`;
- compare prior highest tier with accepted new highest tier;
- for each newly crossed tier above the prior tier, grant +5 S once;
- never decrease tier;
- do not retroactively pay old stored discoveries simply because the schema migrated.

The internal 2/4/8... values remain protocol/rules data. UI names are client-owned.

## 4. Daily tasks

Do not require arbitrary client event claims when the server can derive completion.

Suggested derivation:
- Solo task: first valid authenticated `/progress/solo` sync of the day;
- PvP task: first authenticated completed match recorded by `recordMatch` that day;
- Ad task: first successful daily S Coin rewarded-ad claim.

Each completion auto-grants +5 S once. Add task status to `/me` so a later client can show 0/3, 1/3, etc.

## 5. Rewarded daily S Coin

Extend `POST /rewards/ad` without breaking `solo_skill_refill`.

Supported kinds:
- `solo_skill_refill` — existing behavior, existing per-claim idempotency;
- `daily_s_coin` — +30 S once per UTC day after rewarded completion, plus daily ad task +5 if first completion.

Request:

```json
{ "kind": "daily_s_coin", "claimId": "<8..100 safe chars>" }
```

Response should remain additive:

```json
{
  "granted": true,
  "reward": "daily_s_coin",
  "amount": 30,
  "taskAmount": 5,
  "player": { "...": "updated public player" }
}
```

A duplicate claim or second daily S Coin grant must not mint currency.

## 6. Sidebar return

Keep `POST /rewards/sidebar` and its current source validation.

On first valid sidebar return per UTC day:
- grant +10 S;
- preserve the existing next-Solo clear bonus behavior;
- mark daily sidebar claim atomically.

Duplicate same-day requests return `granted:false` and no extra S.

## 7. Theme ownership

Add a server-side theme registry rather than hard-coding client prices into persistence.

Launch state:
- `kingdom`: free
- `palace`: free

Future theme contract:
- permanent unlock cost: 500 S
- optional one rewarded-ad trial per UTC day
- ownership is permanent once purchased
- purchase must be atomic: check balance -> deduct 500 -> persist ownership in one serialized mutation
- never allow negative balance
- idempotent unlock requests

Suggested account state:

```ts
themes: {
  owned: string[];
  trialDayByTheme: Record<string, string | undefined>;
}
```

Suggested HTTP:
- `GET /themes` — registry + owned/trial status
- `POST /themes/unlock` — `{ themeId, requestId }`
- optional `POST /themes/trial` for future non-free themes

Current two themes must always resolve as owned/free even for pre-migration accounts.

## 8. Official 14-day PvP season

The native Douyin PvP leaderboard in the M2.12 client is only a social mirror. The official competitive season must be server-authoritative.

Add an independent season state while preserving lifetime PvP counters:

```ts
pvpSeason: {
  seasonId: string;
  rating: number;
  wins: number;
  losses: number;
  draws: number;
  matches: number;
}
```

Requirements:
- deterministic 14-day season ID from server time;
- lazy rollover is acceptable;
- no double-processing of a match;
- authenticated-vs-authenticated match updates both players' season Elo;
- guest matches do not change competitive season rating;
- retain existing lifetime `pvp` counters for compatibility;
- choose and test a conservative soft reset on rollover (for example 25% of distance from 1000), or reset to 1000 if product simplicity is preferred;
- server leaderboard sorts current season rating descending with stable tie-breaks.

Suggested endpoints:
- `GET /season/current`
- `GET /leaderboards/pvp?limit=50`

Return only public-safe fields:
- displayName
- season rating
- season W/L/D/matches
- rank position
- no openid/unionid/session/internal account identifiers.

## 9. Public player additions

Additive target shape:

```ts
player: {
  // existing fields...
  rewards: {
    currency: number;
    lastSidebarRewardDay?: string;
    daily?: {
      day: string;
      loginClaimed: boolean;
      adClaimed: boolean;
      tasks: { solo: boolean; pvp: boolean; ad: boolean };
      streak: number;
    };
  };
  season?: {
    id: string;
    rating: number;
    wins: number;
    losses: number;
    draws: number;
    matches: number;
    endsAt: number;
  };
  themes?: {
    owned: string[];
  };
}
```

## 10. Tests required before deployment

At minimum:
- v1 account file opens and migrates without losing any fields;
- daily login is idempotent;
- streak increment/reset/7-day chest;
- sidebar gives +10 once and preserves existing Solo bonus contract;
- daily rewarded S grant is claim-id + day idempotent;
- daily tasks each grant +5 once;
- discovery reward is monotonic and cannot be replayed;
- concurrent/serialized duplicate grants cannot over-credit;
- theme unlock rejects insufficient balance and cannot double charge;
- current free themes always owned;
- season ID/rollover around exact boundary;
- season Elo only for two authenticated players;
- processed match id stays idempotent;
- leaderboard sorting/tie behavior;
- all existing auth/protocol/server smoke tests stay green;
- Protocol version remains 6.

## 11. Delivery/deployment constraints

- Implement on a dedicated server-heavy branch based on the accepted M2.12 client branch.
- Do not modify Nginx/TLS/domain unless an endpoint routing problem is proven.
- Do not deploy until CI, auth smoke, game-server smoke and production-env checks are green.
- Production server GitHub HTTPS is unreliable; use local git bundle + SCP deployment if required.
- After deployment verify:
  - local and public `/health`
  - `/ready`
  - auth smoke
  - `node scripts/smoke-online.mjs wss://game.whvwayfare.online/ws`
  - one idempotency smoke for each new reward family.

## Codex execution brief

Use this document as Source of Truth. First audit `server/auth/AccountRepository.ts`, `server/auth/AuthHttp.ts`, match accounting and existing tests. Then implement the smallest backward-compatible authoritative server layer described above. Do not redesign client UI, Three.js rendering, Protocol v6, Nginx or TLS. Keep every reward mutation serialized/idempotent and return additive public-player fields so the existing M2.12 client remains compatible.
