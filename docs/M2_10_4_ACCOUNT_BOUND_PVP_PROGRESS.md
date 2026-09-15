# M2.10.4 — Account-bound PvP & Server Progress

## Goal

Close the remaining account/progression gap for the Douyin Full Product RC without regressing Browser PvP or Protocol v6 gameplay semantics.

The Douyin client already has server-side code2Session, Double Fight bearer sessions, durable accounts, and client-side platform services. This milestone binds that authenticated account to the WebSocket connection and persists authoritative PvP outcomes plus Solo progression.

## Constraints

- Keep existing gameplay messages and Protocol v6 semantics stable.
- Do not put AppSecret/session_key in client, URLs, logs, or protocol messages.
- Browser anonymous PvP must continue to work unchanged.
- Authenticated Douyin users should get account-bound identity and durable PvP stats.
- Unauthenticated/dev users may still play as guest.
- All server mutations must be replay-safe/idempotent.

## A. WebSocket account binding

Use the Douyin WebSocket request header, not query parameters.

- Extend Douyin connectSocket typings to support headers.
- Add an authorization setter to the concrete Douyin socket transport.
- After DouyinAuthClient authenticates, configure the socket transport with:
  Authorization: Bearer <Double Fight session token>
- Do not expose the token through OnlineClient messages.
- Server WebSocket connection handler reads Authorization during handshake/connection.
- Verify with the existing SessionToken verifier.
- Resolve the account before registering the connection.
- Invalid/expired/missing bearer falls back to guest rather than breaking Browser/guest PvP.

## B. Server connection identity

Extend the server-only connection record with optional:

- accountId
- displayName

Do not expose provider openid/unionid.

When an authenticated connection creates/joins matchmaking or a private room:

- use the account displayName as the authoritative player name;
- ignore spoofed client playerName for authenticated users;
- guest/browser behavior keeps current sanitized client name.

Reconnect must preserve the original room player/account binding.

## C. Authoritative PvP result persistence

Room players receive optional server-only accountId.

When a match finishes:

- record the result exactly once per matchId;
- update authenticated accounts:
  - wins
  - losses
  - draws
  - rating (simple deterministic Elo is acceptable; document K factor)
- no update for guest-only players;
- mixed guest/authenticated matches update only the authenticated account;
- rematches have a new matchId and count independently;
- opponent_left, board_locked, petrified_lock and time_limit all record correctly.

Persistence must be atomic and idempotent in JsonAccountRepository.

Add a bounded processed-match ledger or another replay-safe design so duplicate finish callbacks cannot double count.

## D. Solo progress sync

Add authenticated endpoint:

POST /progress/solo

Body:
- theme: kingdom | palace
- best: non-negative integer
- highest: valid power-of-two tile value >= 2

Behavior:
- max-merge only; never decrease stored best/highest;
- update only the corresponding theme;
- reject malformed/extreme values;
- bearer required;
- return updated public player.

Client:
- after meaningful Solo progress / leaving Solo / returning Home, best-effort sync authenticated progress;
- no UI blocking if offline;
- local storage remains immediate cache;
- server account state is restored into local best/highest when larger.

This endpoint is persistence, not anti-cheat ranking authority. Do not claim otherwise.

## E. Reward ledger hardening

Keep current ad/sidebar claim behavior but add bounded storage protection:

- ad replay IDs must not grow without bound;
- retain enough recent IDs for practical replay protection;
- duplicate recent claim remains denied;
- document that server-verifiable ad proof is still a later production-hardening item if Douyin does not expose suitable verification in the current integration.

## F. Client auth recovery

Preserve the fixes already added during PR #27 review:

- anonymous identity upgrades into the same account when real openid arrives;
- transient auth failure does not pin the runtime in local mode forever;
- consumed/invalid one-use code permits a fresh tt.login credential on retry.

Add regression coverage.

## G. Tests

Required:

- authenticated socket binds account without protocol message changes;
- invalid bearer becomes guest;
- authenticated client name cannot be spoofed;
- anonymous/browser connection still works;
- PvP win/loss/draw persistence;
- duplicate match finalization does not double count;
- rematch counts once per new match;
- Solo max-merge persistence;
- malformed Solo progress rejection;
- account restore sync;
- recent ad claim replay denied after repository reopen;
- bounded ad ledger;
- existing quick/private/reconnect smoke remains green;
- Browser build, Douyin dev build, Douyin release build, auth smoke all green.

## Non-goals

- Production deployment.
- AppSecret entry.
- Legal-domain console changes.
- Global anti-cheat service.
- Payment/economy.

## Acceptance

A real authenticated Douyin player can:

1. launch and restore a Double Fight account;
2. enter PvP without sending account secrets in Protocol v6;
3. appear under the server-side account display name;
4. finish a match and see durable W/L/D/rating on the next /me restore;
5. retain Solo best/highest across reinstall/login restoration where platform storage is unavailable;
6. still use Browser/guest PvP with no regression.

## Implementation notes

- The server verifies `Authorization` during the WebSocket connection and records only `accountId` plus the server profile name in the room. Missing or invalid headers keep the existing guest path; Protocol v6 messages stay unchanged.
- `RoomSession.finishMatch` is the single outcome hook. The JSON repository serializes atomic writes and retains the latest 512 match IDs to suppress duplicate finish callbacks. A rematch creates a new match ID. Rating uses deterministic Elo with K=24 and an initial rating of 1000; guest-only matches do not update accounts.
- `/progress/solo` only max-merges per-theme best/highest. The Douyin client saves locally first, sends best-effort updates, and restores larger server values at login. This is progress persistence, not a verified Solo score.
- The ad replay ledger retains the latest 256 claim IDs. Recent replay still fails; older IDs can expire from the bounded ledger. Server-verifiable ad proof remains a release-hardening item.
- Production still needs operator-managed provider/signing secrets, durable data-volume backup, registered Douyin request/socket legal domains, and real-device account/reconnect acceptance. No production deployment is performed here.
