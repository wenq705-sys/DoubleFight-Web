# Roadmap

## M0 — Repository foundation ✅

- company-style repository structure
- strict TypeScript/Vite foundation
- deterministic board tests
- CI and Pages deployment
- AI/Codex operating docs

## M1 — 3D 2048 production-quality foundation ✅ / ongoing polish

### M1.1 mobile/art polish ✅
### M1.2 living-world / control pass ✅
### M1.3 themes + first skill ✅
### M1.4 production foundation ✅
- adaptive resolution / performance telemetry
- pooled VFX and environment effects
- instancing and template reuse
- numberless gameplay pieces
- discrete tier colors and monotonic physical growth
- theme-island home

### M1.5 legendary 2048 pass
- dedicated 1024→2048 theme-specific event
- higher-fidelity major-merge audio

### M1.6 authored asset migration pilot
- GLB asset contract
- Palace 2/4/8 stylized low-poly pilot
- compare visual quality, draw calls, package size and loading

## M2 — Real online duel ← CURRENT

**Definition:** two players on two devices connect through a server. Each device ultimately shows both boards; each player controls only their own board. Players may choose different visual themes.

### M2.0 shared core + rooms ← IMPLEMENTED, SERVER DEPLOYMENT PENDING

- shared TypeScript Board2048 used by client and server
- deterministic seeded RNG
- versioned client/server protocol
- Node.js + TypeScript WebSocket server
- 6-digit private rooms
- create / join / theme / ready
- authoritative server-side 2048 boards
- authoritative MOVE validation and sequence protection
- 30-second reconnect identity
- WebSocket heartbeat
- health endpoint
- Docker server image
- browser online-room lobby
- CI server smoke test

### M2.1 dual-board battle client ← IMPLEMENTED, PUBLIC SERVER TEST PENDING

- real match screen on both devices
- one shared lightweight Three.js DuelScene instead of two full Solo worlds
- large own board + compact live opponent board
- both players render their independently selected themes
- authoritative snapshots include stable tile ids for animation
- spawn-free local prediction for immediate swipe response
- pending-command replay on fresh server snapshots for reconciliation
- opponent board movement interpolates from authoritative tile ids
- connection / latency / reconnect overlays
- match-end win/loss overlay

### M2.2 energy system ← NEXT

- merge value/combos generate battle energy
- server owns energy truth
- energy HUD and charge feedback

### M2.3 first PvP skills

- Random Clear: self recovery
- Petrify: opponent spatial pressure
- Shield: defensive counter
- server-authoritative costs/cooldowns/effects
- theme-specific visuals with identical gameplay rules

### M2.4 complete match loop

- timed rounds
- board-lock instant loss
- score / highest / empty-cell tie breakers
- results screen
- rematch
- reconnect UX

### M2.5 matchmaking

- queue
- automatic opponent matching
- latency/region strategy
- platform invite/share hooks later

## M3 — Production assets

- gradual procedural → stylized low-poly GLB migration
- theme AssetManager / cache
- authored Theme Islands
- shared materials / atlases / instancing

## M4 — Douyin mini-game release

- platform adapter
- lifecycle / storage / audio / haptics
- account identity where required
- share/invite
- packaging/performance budget
- production server deployment and observability

## M5 — WeChat mini-game

- WeChat platform adapter
- reuse game core / network protocol / assets

## M6 — iOS

- package the same game/product core for iOS distribution
