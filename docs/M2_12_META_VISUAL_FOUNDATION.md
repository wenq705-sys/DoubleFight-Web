# M2.12 — Meta & Retention Visual Foundation

## Product decisions

- Do not add numeric labels back onto themed pieces.
- Runtime values (2..2048) stay internal; player-facing progression uses piece names and hidden tier ordering.
- Solo first reaches the final piece at 2048 => Ascension / 登顶.
- PvP V1 remains a single 3-minute standard queue.
- Product remains advertisement-only; no IAP.
- S Coin is the only planned soft currency and never buys PvP power.
- Planned leaderboards:
  1. per-theme Ascension speed;
  2. Solo weekly score;
  3. 14-day PvP rating season.

## This branch — direct product/client scope

### Piece identity
- shared piece-name helpers for Kingdom/Palace;
- hidden tier helper;
- Home and Solo stop showing raw highest-value numbers as the primary identity.

### New-highest signature feedback
- on a merge that creates a new run-high piece:
  - lightweight ghost/badge flight from the merge cell toward the top highest-piece HUD;
  - update highest-piece name;
  - NEW feedback;
  - local discovery tracking for later Collection UI.

### Ascension timing
- timer begins on the first successful Solo move;
- stops on first creation of the theme final piece;
- persist local:
  - firstAscensionMs;
  - bestAscensionMs;
  - ascensionCount;
- Ascension does not end the run;
- current score gameplay continues normally.

### Account/Profile visual surface
- Home account identity is promoted from tiny status text to a real account card;
- show displayName, PvP rank label, S Coin balance from the existing account payload;
- profile modal shows W/L/D, rating, theme highs, records and S Coin.
- No fake economy mutations on the client.

### PvP time communication
- 03:00 standard duel is explicitly communicated in lobby/matching/battle;
- prominent timer treatment;
- last-minute / 30-second / final-10-second escalation and haptic milestones;
- no extra matchmaking queues in V1.

### Matchmaking visual pass
- replace empty waiting state with competitive matching presentation;
- show elapsed search time, queue context and opponent-search visual;
- keep cancel obvious.

### Performance pass
- start at medium DPR instead of high;
- caps: high 1.45 / medium 1.20 / low 1.00;
- shadow map reduced to 512;
- avoid repeated system-info reads inside the same render frame;
- preserve adaptive quality and product visuals.

## Deferred to server/Codex milestone

- authoritative S Coin ledger/economy:
  - daily +15 S;
  - optional rewarded +30 S;
  - sidebar +10 S;
  - daily tasks;
  - first discovery / first Ascension one-time rewards;
- theme ownership/trial ledger;
- per-theme authoritative Ascension speed challenge;
- weekly Solo board backend where needed;
- 14-day PvP season reset/rewards;
- add-to-home-screen and subscription-message production workflows;
- analytics persistence/dashboard wiring.

## Ads

Rewarded:
- daily S Coin bonus;
- locked-theme one-run trial;
- Solo clear refill.

Interstitial:
- natural break only.

Banner:
- no Home/Solo/PvP gameplay;
- only low-priority non-gameplay surfaces if retained.

## Acceptance

- no raw "最高 64"-style primary highest label in Douyin Solo/Home;
- new highest has visible signature flight/update feedback;
- first final-piece creation records Ascension timing without ending the run;
- Home visibly feels account-bound and shows real current S balance/rank;
- 3-minute PvP cannot be mistaken for unlimited play;
- matchmaking no longer looks like a disabled form;
- startup rendering is smoother on the same simulator/device than M2.10.2 without a major visual downgrade.
