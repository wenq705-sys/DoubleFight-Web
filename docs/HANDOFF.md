# Handoff

## Current state

**Milestone: M2.1 — Live Dual-Board Online Client.**

The product definition has changed from the earlier misunderstood local/same-device concept. **Online Duel means two players on two separate devices connected through a server.**

Solo Theme Islands remain the default game mode. Online Duel is the major launch feature required before the Douyin release.

## Existing M1 foundation

- premium mobile Three.js 2048
- Miniature Kingdom + Palace Rank themes
- numberless piece identity through size/silhouette/discrete hue
- theme islands home
- Random Clear solo skill prototype
- pooled VFX / instancing / adaptive DPR / performance telemetry
- gradual future migration toward authored stylized low-poly GLB assets

## M2.0 implemented

### Shared authoritative core
- `shared/game/Board2048.ts`
- deterministic `SeededRandom`
- public board snapshot
- browser compatibility re-exports
- browser + Node server use the same rules

### Protocol
- versioned online message contract
- runtime client-message parser
- create/join/reconnect/theme/ready/move/leave/ping
- room/match/move/error server messages

### WebSocket game server
- Node.js + TypeScript + `ws`
- `/ws` endpoint
- `/health` endpoint
- 6-digit private rooms
- two-player maximum
- independent player themes
- ready-to-start flow
- server-created authoritative Board2048 per player
- server-owned RNG
- monotonically increasing move sequence validation
- board-lock match ending
- WebSocket heartbeat
- 30-second reconnect identity grace
- Dockerfile
- CI server health smoke test

### Browser networking
- `OnlineClient`
- reconnect/backoff
- room/reconnect identity tracking
- latency ping capability
- endpoint from `VITE_WS_URL` or `?ws=`

### Product UI
Theme Islands now expose **在线对决**.

The online lobby supports:
- nickname
- currently selected theme
- create room
- enter 6-digit code
- room player list
- ready/cancel ready
- connection/reconnect status

When both players ready, the server creates a real authoritative match and the client now transitions into the M2.1 dual-board battle scene.

## M2.1 implemented

### Duel Lite renderer
- `src/rendering/DuelScene.ts`
- one WebGL scene renders both players instead of creating two complete Solo environments
- own board is larger; opponent board is compact
- existing cached Kingdom/Palace piece factories are reused
- repeated board cells use InstancedMesh
- authoritative stable tile ids drive movement interpolation
- both players can render different themes in the same match

### Client prediction / reconciliation
- `shared/game/predictMove.ts`
- local swipes immediately compute movement/merges without inventing a spawn
- server remains authoritative over the real spawned tile
- up to a small bounded number of local commands may be pending
- each fresh authoritative snapshot filters acknowledged sequences and replays only unacknowledged commands
- this preserves responsive input while correcting naturally to server truth

### Battle UI
- `src/ui/DuelScreen.ts`
- own/opponent names, themes and scores
- 6-digit room display
- live latency
- connection/reconnect overlay
- lower-board swipe input zone
- server-driven win/loss result overlay

## Deployment state

The **server code is deployable but there is no public game-server URL configured in GitHub Pages yet**.

Therefore the public Pages build will show the Online Duel UI and report that the server is not configured. This is expected and honest.

Local test:
- run `npm run dev:server`
- run `npm run dev`
- browser automatically uses `ws://localhost:8787/ws`

Remote test:
- deploy `Dockerfile.server`
- provide a TLS `wss://.../ws` endpoint
- set `VITE_WS_URL` at build time or use `?ws=wss://...`

## Locked online decisions

- PvP is server-based, not two people sharing one phone.
- each player uses their own device.
- each player can choose a different theme.
- themes never change competitive balance.
- server is authoritative for board/spawn/score/future energy/skills/winner.
- client must remain responsive; M2.1 adds prediction/reconciliation.
- server and client share the same deterministic core.
- future skills are server-authoritative.
- Online Duel uses a lightweight duel render, not two complete Solo environments.
- first release target remains Douyin mini-game, followed by WeChat, then iOS.

## Next exact task — M2.2

Build the server-authoritative battle energy loop:

1. derive energy from successful merges / merge value
2. add energy to MatchPlayerState / snapshots
3. server owns all energy truth
4. client predicts only presentation, never authoritative energy
5. Duel HUD gets a clear energy bar
6. high merges and combo timing should feel substantially more rewarding
7. no PvP skill effects yet; first validate the economy and pacing

After M2.2, implement the first three skills: Random Clear, Petrify and Shield.

## Real-device validation still required

The code path is complete, but a public `wss://` game server is still required before two separate phones can validate real network latency, prediction/reconciliation feel and disconnect recovery.

## Validation

CI must pass:
- web TypeScript
- server TypeScript
- unit tests
- client production build
- server health smoke test
