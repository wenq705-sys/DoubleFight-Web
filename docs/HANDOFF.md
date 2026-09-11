# Handoff

## Current state

**Milestone: M2.0 — Real Online Duel Foundation.**

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

When both players ready, the server already creates a real authoritative match. M2.0 deliberately stops before rendering/controlling the dual-board battle scene.

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

## Next exact task — M2.1

Build the actual online battle client:

1. one large local 4×4 board
2. one compact live opponent board
3. both themes rendered independently
4. own swipe sends sequence-numbered MOVE
5. immediate local movement presentation / prediction
6. server move acknowledgement and reconciliation
7. remote board updates
8. connection/latency/reconnect overlay
9. keep Solo mode unchanged

No PvP skills yet. First prove two real phones can play simultaneous authoritative 2048 smoothly.

## Validation

CI must pass:
- web TypeScript
- server TypeScript
- unit tests
- client production build
- server health smoke test
