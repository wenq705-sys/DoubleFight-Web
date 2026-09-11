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

**M2.4 / M2.5 — complete server-authoritative match loop and public matchmaking.**

"Double player" means two separate devices connected through the game server. Do not implement shared-phone/local same-screen controls.

Priority:
1. shared deterministic correctness
2. server authority / anti-desync design
3. responsive client feel
4. reconnect robustness
5. mobile performance
6. theme independence
7. maintainable cross-platform architecture

## 3. Online architecture rules

- browser and server must reuse `shared/game`; do not fork Board2048
- server controls RNG/spawns, scores, energy, skills, round time, results and competitive state
- every player action needs ordered sequence semantics
- never trust a client-provided board/score
- protocol changes live in `shared/protocol`
- reconnect must restore state from server snapshots
- client prediction is presentation latency hiding, not authority
- blocked/petrified cells are shared-core gameplay state, not client-only VFX
- move sequence and skill sequence are separate ordered streams
- clients display roundEndsAt; they never start/reset the authoritative match timer
- result UI must render the server MatchResult rather than independently deciding who won
- stable tile ids in authoritative snapshots are part of the duel animation/reconciliation contract
- prediction must never invent the authoritative random spawn
- themes are cosmetic/presentation only; they cannot change competitive rules
- do not put secrets in browser/client code
- production browser WebSocket must use TLS (`wss://`)

## 4. Art/performance guardrails

- no numbers/rank labels attached to gameplay pieces
- identity priority: size > silhouette > discrete hue > accessories
- adjacent tiers use distinct hue families
- shared monotonic tier growth
- pooled VFX / cached resources / instancing remain mandatory
- Online Duel must use a lighter render than two full Solo worlds
- use `?debug=1` before guessing about performance
- core hero assets may gradually migrate to stylized low-poly GLB

## 5. Change discipline

For meaningful changes:
- update tests when rules/protocol change
- update HANDOFF
- update architecture/roadmap when durable design changes
- add ADRs for important architectural decisions
- run `npm run typecheck`, `npm test`, `npm run build`
- server changes must also pass the CI health smoke test

## 6. Do not add yet unless milestone moves

- public matchmaking
- accounts
- ranking backend
- ads
- payments
- large skill catalog
- Redis/distributed rooms
- third theme

M2.4 is implemented. M2.5 matchmaking must create/reuse the existing authoritative RoomSession rather than fork competitive rules into a second match engine.
