# AGENTS.md — mandatory instructions for AI/Codex contributors

This file is the operational contract for AI agents working in this repository.

## 1. Read before editing

Read in order:

1. `docs/HANDOFF.md`
2. `docs/ART_DIRECTION.md`
3. `docs/ARCHITECTURE.md`
4. `docs/GAME_DESIGN.md`
5. `docs/ROADMAP.md`
6. relevant ADRs under `docs/decisions/`

## 2. Current milestone

**M2.17 — Solo-first Douyin launch release candidate.**

The first Douyin release is a polished **Solo / Theme Islands** product. Online Duel/PvP is implemented and retained in the repository, but it is **deferred from the first release** and must stay hidden/disabled behind launch policy until the milestone changes.

Current priority:
1. release-safe Solo product closure
2. five-theme-ready architecture and five launch-quality worlds
3. mobile performance / memory / package-size discipline
4. game feel, feedback, VFX and audio/BGM quality
5. Solo progression, rankings, collection and rewards
6. Douyin safe-area / touch / lifecycle / account / ads acceptance
7. maintainable cross-platform architecture

Do not re-expose Online Duel, matchmaking, private rooms, PvP rank/season UI or PvP daily-task copy in the first release unless the product milestone explicitly moves.

## 3. Solo launch rules

- Solo remains the default and primary Home action.
- The Solo objective is the explicit 11/11 ascent to the theme's 2048 terminal tier.
- A locked board is an explicit failure state; reaching 11/11 is an explicit success state.
- Themes are presentation/content identity only; Board2048 rules remain shared.
- Gameplay pieces remain numberless. Identity comes from size, silhouette, discrete hue and accessories.
- Theme navigation must scale beyond two worlds; do not add new binary `kingdom ? palace : kingdom` assumptions.
- Collection, ranking, profile, benefits and settings are product pages, not translucent debug overlays.
- PvP/server code may remain buildable and tested while release surfaces are disabled.

## 4. Preserved online architecture rules

Online code is deferred, not deleted. When touching it:
- browser and server reuse `shared/game`; do not fork Board2048
- server owns competitive RNG/spawns, scores, energy, skills, round time and results
- protocol changes live in `shared/protocol`
- reconnect restores authoritative snapshots
- prediction is presentation latency hiding, never authority
- do not put secrets in browser/client code
- production WebSocket uses TLS (`wss://`)

## 5. Art / performance / audio guardrails

- no numbers/rank labels attached to gameplay pieces
- identity priority: size > silhouette > discrete hue > accessories
- adjacent tiers use distinct hue families
- shared monotonic tier growth
- pooled VFX / cached resources / instancing remain mandatory
- avoid allocating per-frame objects in render/update hot paths
- start from a conservative mobile quality tier; upgrade only after sustained good frame time
- audio must degrade safely when the host denies/interrupts playback
- BGM and SFX are product polish, never startup blockers
- use telemetry and renderer stats before guessing about performance
- core hero assets may gradually migrate to stylized low-poly GLB

## 6. Change discipline

For meaningful changes:
- update tests when rules/policy/protocol change
- update HANDOFF and ROADMAP when durable product direction changes
- update GAME_DESIGN when the release rules/product thesis changes
- add ADRs for important architectural decisions
- run `npm run typecheck`, `npm test`, `npm run build`
- run both Douyin dev/release builds and release preflight for launch-facing changes
- server changes must also pass the CI health smoke test

## 7. Not in the M2.17 critical path

Do not spend launch time expanding:
- PvP skill catalog
- matchmaking/MMR/regions/bots
- distributed rooms/Redis
- new competitive economy
- payments

Existing account, ads/reward, ranking and server infrastructure may be used where it supports the Solo launch.
