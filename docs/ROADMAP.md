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

### M2.2 energy system ← IMPLEMENTED, PUBLIC SERVER TEST PENDING

- server-authoritative energy starts at 0 and caps at 100
- stronger merge values award increasingly more energy
- multiple merges in one swipe receive a deterministic combo bonus
- energy is included in authoritative match snapshots
- move acknowledgements include confirmed energy gain
- local client never predicts authoritative energy
- both players have live energy bars in Duel HUD
- authoritative energy gains pulse the board and show +N feedback
- first skill-cost tuning contract reserved for M2.3

### M2.3 first PvP skills ← IMPLEMENTED, PUBLIC SERVER TEST PENDING

- Random Clear: self recovery, 35 energy, 6s cooldown
- Shield: one-hit defensive counter, 45 energy, 10s cooldown
- Petrify: opponent cell blocker, 50 energy, 8s cooldown, 6s duration
- server validates energy, cooldown, target and ordered skill sequence
- Shield consumes the next hostile Petrify instead of allowing the block
- petrified cells are real shared-core movement/spawn barriers
- client prediction respects authoritative blocked cells
- lightweight duel skill dock, cooldown UI, status labels and cross-board feedback
- protocol v3 skill commands/events

### M2.4 complete match loop ← IMPLEMENTED, PUBLIC SERVER TEST PENDING

- authoritative 180-second server round clock
- reconnect preserves the same round deadline; the clock never restarts client-side
- board-lock and petrified-lock remain instant-loss conditions
- time limit resolves by score → highest tile → usable empty cells → draw
- immutable server result payload records both final standings and the tie-break reason
- richer mobile result screen explains why the player won/lost
- both players can request a rematch without leaving the private room
- a rematch creates a fresh match id, fresh boards, zero energy and a new 180s deadline
- protocol v4 adds round/result/rematch state

### M2.5 matchmaking ← NEXT

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
