# M2.12 — Meta, Retention & Visual Product Pass

## Product position

Double Fight remains an advertisement-funded, no-IAP game. The 2048 numeric model stays internal; the player-facing product is character/building evolution, collection and mastery.

## Core principles

- Do not place 2/4/8/... labels back onto the playable pieces.
- Present the highest piece by its theme-specific name.
- Reaching a new run-high piece is a signature moment: merge -> ghost/emblem flight -> highest badge update.
- Reaching the final piece is an **Ascension**. Normal Solo may continue for score after ascension.
- PvP V1 stays one 3-minute standard queue. The timer must be impossible to miss.
- S Coin is the only soft currency. It never buys PvP power.
- Monetization is ads only. No virtual payment/IAP in V1.

## A. Piece identity and collection vocabulary

Theme values remain powers of two internally. UI uses names from the theme catalogue.

Kingdom and Palace each have 11 ranks (2..2048). Utilities must expose:
- pieceName(theme, value)
- pieceTier(value) => 1..11
- maxPieceName(theme)
- piece catalogue ordered by tier

Home/Solo/Profile/leaderboards must use piece names. Debug/test data may still use numeric values.

## B. New-highest signature feedback

When a merge creates a value above the run's previous highest:
- keep the real piece on the board;
- spawn a lightweight UI ghost/emblem from the board area;
- animate it to the highest-piece HUD using a curved path;
- show a short NEW state and then update the name;
- stronger presentation for final-tier ascension;
- use pooled/lightweight particles only, no large particle storm.

## C. Ascension timing

Per theme persist local-first records:
- firstAscensionMs
- bestAscensionMs
- ascensionCount
- highestDiscoveredTier

Rules:
- timer begins on first successful move;
- timer ends the first time the final 2048-equivalent piece is created;
- reaching final tier does not end normal Solo;
- normal Solo can continue for score;
- background/ad/settings time is not intended to become a competitive global record in V1.

A later server-verified Speedrun mode can use deterministic seeds and replay validation. V1 records are mastery/profile data, not high-value authoritative economy rewards.

## D. Player-facing account shell

Home must expose the existing authenticated account as a real product surface:
- player display name
- PvP rank derived from rating
- S Coin balance (existing rewards.currency)
- tap/click profile card -> Profile overlay

Profile contains:
- name
- rank/rating
- W/L/D
- S Coin
- highest named piece per theme
- best Solo score per theme
- ascension PB per theme when present

No free-text nickname editor in V1.

## E. S Coin economy — product contract

Target economy (server implementation is a separate authoritative milestone):
- daily login: +15 S
- optional rewarded ad daily bonus: +30 S
- sidebar return: +10 S
- daily tasks: 3 × 5 S
- first discovery reward: +5 S per new piece
- seven-day activity chest: +30 S
- PvP season rewards: primary competitive S source

Target permanent theme unlock: 500 S.

Existing Kingdom and Palace remain free at launch. Future themes may offer:
- one rewarded-ad trial match;
- 500 S permanent unlock.

S Coin cannot buy energy, cooldown reductions, shields, stronger clears or any PvP stat.

## F. Three leaderboard product

### 1. Theme Ascension leaderboard
Per theme, fastest final-piece time. Friend/full-server views later. Theme names differ; ranking is theme-scoped.

### 2. Solo weekly leaderboard
Weekly highest score. Piece name is supporting prestige, score is the ranking value.

### 3. PvP season leaderboard
14-day server-authoritative rating leaderboard. Bronze / Silver / Gold / Platinum / Diamond / King presentation.

Do not use a cross-theme piece-name string as the ranking key. Hidden piece tier is for comparison only where needed.

## G. PvP timer UX

Keep MATCH_DURATION_MS = 180000 for V1.

UI requirements:
- lobby: `标准对决 · 3分钟 · 实时1v1`;
- match-found/countdown should mention 3:00;
- battle timer is a major HUD element, not tiny helper text;
- <=60s: warning state;
- <=30s: decisive orange/gold state;
- <=10s: pulse/strong countdown feedback;
- 00:00 -> authoritative result;
- result explains score / highest named piece / usable-space tie breaker.

No additional matchmaking queues in V1.

## H. Home / Online / Solo visual final pass

Home:
- stronger brand hierarchy;
- player profile + S Coin top shell;
- primary Start CTA, competitive Online secondary CTA;
- Ranking / Themes / Collection become icon-like secondary destinations rather than equal pill buttons.

Online:
- redesign setup as battle loadout, not a form;
- skill cards show icon + cost + selected state;
- matchmaking screen must create anticipation: opponent placeholder, elapsed search time, scan/pulse motion.

Solo:
- highest named piece, not number;
- skill dock rather than isolated generic pill;
- ascension PB can appear as subtle secondary information after unlocked.

## I. Performance pass

Targets:
- start at medium quality, promote only after sustained good performance;
- high DPR cap ~1.45, medium ~1.20, low 1.0;
- reduce shadow cost (512 high, simplified/off lower tiers);
- cache runtime system metrics instead of querying host every frame;
- avoid unnecessary full UI CanvasTexture uploads;
- lazy/prewarm PvP heavy views rather than doing avoidable startup work where safe;
- lower remote-board visual frequency/FX where it does not harm tactical readability;
- object pool short-lived VFX;
- keep release visuals materially equivalent while reducing GPU/GC pressure.

Development-only performance telemetry should expose FPS, frame time, DPR, quality and renderer draw statistics when practical.

## J. Additional retention capabilities

Implemented on the client branch:
- World Center and named-piece Collection overlays;
- Today/Benefits center with sidebar return, add-to-home shortcut and account refresh;
- subscription-message opt-in path gated by configured approved template IDs;
- analytics for Home, Solo, discovery, Ascension, matchmaking, PvP results/rating settlement, ads, rank opens and retention actions;
- native Douyin Solo weekly leaderboard;
- native theme-scoped Ascension leaderboard using formatted time + inverted enum priority so lower time ranks first;
- native PvP social mirror while the official 14-day season leaderboard remains server-authoritative;
- authoritative profile refresh after match settlement so Rating/W-L-D is not one match behind.

The client never fabricates S Coin grants or future-theme ownership while the server ledger is absent.

## Delivery split

### Assistant-owned / current branch
- visual/meta vocabulary and theme catalogue
- new-highest/ascension client feedback
- profile/S Coin presentation using existing account data
- World Center, Collection, Today/Benefits and ranking product surfaces
- native Douyin weekly/Ascension/social-rank integration where platform data is sufficient
- PvP timer/lobby/matching/skill-dock/result visual redesign
- client performance pass
- retention/ad/rank analytics adapters
- tests and CI

### Server-heavy follow-up
- authoritative S Coin ledger and daily/task economy
- theme ownership/trial ledger
- server leaderboard endpoints/season rotation
- authoritative competitive Ascension mode if introduced
- analytics aggregation and subscription-message backend delivery

## Acceptance for assistant-owned pass

- no playable piece gains a numeric badge;
- Home/Solo highest display uses theme-specific piece names;
- new run-high has visible flight/update feedback;
- normal Solo records local ascension PB and keeps playing;
- existing account and S balance are visible as product UI;
- PvP timer clearly communicates the 3-minute rule;
- Online lobby/matching no longer reads like a generic configuration form;
- performance defaults are cheaper than the current high-first profile;
- Browser and Douyin dev/release builds remain green.