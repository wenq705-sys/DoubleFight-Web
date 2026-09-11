# Handoff

## Current state

**Milestone: M2.5 — Public Matchmaking over the Existing Match Engine.**

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

## M2.2 implemented

### Shared battle economy
- `shared/battle/energy.ts`
- max battle energy: 100
- stronger merge values award progressively more energy
- multi-merge swipes receive deterministic combo bonuses
- economy has no dependency on client clocks or network timing
- future skill costs are reserved in the same shared contract

Current merge reward examples:
- 4 → +2
- 8 → +3
- 16 → +4
- 32 → +6
- 64 → +8
- 128 → +11
- 256 → +15
- 512 → +20
- 1024 → +26
- 2048 → +34

Two merges in one swipe add +2 combo energy; larger multi-merge swipes receive larger bonuses.

### Server authority
- each `RoomPlayerRecord` owns authoritative energy
- energy resets to 0 at match start
- only server-validated merges award energy
- match snapshots include `energy` and `maxEnergy`
- move acknowledgements include confirmed `energyGain`
- protocol version advanced to v2

### Duel feedback
- both local and opponent energy bars are visible
- local energy does not rise during client prediction
- confirmed server energy animates +N feedback
- the relevant duel board glow pulses more strongly for bigger gains
- full energy has a distinct ready-state glow

## M2.3 implemented

### Shared skill contract
- `shared/battle/skills.ts`
- Random Clear: 35 energy / 6s cooldown
- Shield: 45 energy / 10s cooldown
- Petrify: 50 energy / 8s cooldown / 6s block duration
- skill ids, costs, cooldowns and duration are shared constants; server remains authority

### Server skill engine
- `RoomSession.castSkill()`
- independent ordered `lastSkillSequence`
- energy/cooldown/target validation before effects
- Random Clear removes two server-selected own tiles
- Shield remains active until one hostile Petrify consumes it
- Petrify selects an authoritative empty opponent cell and blocks it for 6 seconds
- if Petrify seals the last usable space, the attacker can win by `petrified_lock`
- timed Petrify expiry is broadcast back to both clients
- protocol advanced to v3 with `cast_skill` and `skill_event`

### Real board barriers
- `Board2048` now owns blocked-cell state
- blocked cells cannot receive spawned tiles
- blocked cells split movement lines into independent segments
- `canMove()` accounts for blocked cells
- authoritative snapshots expose `blockedCells`
- client prediction uses the same segmented movement semantics

### Duel client
- three skill buttons with live cost/cooldown/availability
- shield/petrify status labels
- pooled Three.js petrify blocker visuals on both boards
- cross-board skill travel feedback
- server errors surface as compact skill feedback
- client never spends energy or applies a competitive effect as authority

## M2.4 implemented

### Authoritative round clock
- `MATCH_DURATION_MS = 180000`
- every match stores `roundStartedAt` and `roundEndsAt`
- `RoomManager` schedules the deadline on the server
- MOVE / CAST_SKILL reject late commands once the deadline has passed
- reconnect snapshots carry the original deadline, so changing devices/connections never resets time
- Duel HUD derives its countdown from server time + the authoritative deadline

### Time-limit resolution
At 180 seconds the server compares, in order:
1. score
2. highest tile
3. usable empty cells
4. draw if all three match

`MatchResult` freezes:
- winner id
- end reason
- exact tie breaker
- finish time
- both final score/highest/usable-space standings

Instant endings still override the timer:
- `board_locked`
- `petrified_lock`
- `opponent_left`

### Same-room rematch
- finished rooms remain alive
- each player has `rematchReady`
- both players must opt in
- the server then creates a fresh match id and new 180-second deadline
- boards / energy / shield / petrify / cooldowns / action sequences reset
- theme/player identity/room code remain
- result UI shows opponent rematch intent and supports canceling readiness

### Protocol / UI
- protocol advanced to v4
- `set_rematch_ready`
- round timestamps and full result payload in `MatchSnapshot`
- visible mm:ss server timer with 10-second danger state
- result panel shows both scores, highest tiles, usable spaces and the winning rule

## M2.5 implemented

### Queue layer
- `server/MatchmakingQueue.ts`
- in-memory FIFO queue only; it does not know Board2048 rules
- queue entries contain connection id, sanitized nickname, selected theme and join time
- one connection cannot occupy multiple queue positions
- cancel/disconnect removes the entry
- waiting entries receive updated queue size
- unmatched entries time out after 60 seconds

### Pairing
`RoomManager` owns matchmaking orchestration.

When two live entries are available:
1. remove the pair from the queue
2. create a normal 6-digit `RoomSession`
3. add one player with each player's independently selected theme
4. create the normal room memberships/reconnect tokens
5. auto-ready both players
6. schedule the existing authoritative 180s deadline
7. broadcast the normal `match_start`

After step 2 there is no matchmaking-specific battle path. Energy, skills, timer, results, reconnect and rematch all use the same M2.0–M2.4 code.

### Client / UX
- protocol v5 adds `join_matchmaking`, `cancel_matchmaking` and `matchmaking_state`
- `OnlineClientState` now includes matchmaking state
- Online Duel lobby makes **快速匹配** the primary CTA
- current selected theme is submitted with the queue request
- waiting UI shows elapsed time and current queue population
- player can cancel while searching
- private create/join-by-code remains available below the quick-match flow
- matched players move directly into the existing DuelScreen

### Cleanup / observability
- disconnected queued sockets are removed immediately rather than receiving room reconnect grace
- stale paired sockets are skipped safely
- `/health` now exposes `queued` through `RoomManager.stats()`

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

## Next exact task — M2.6

Deploy and harden the actual public game server:

1. deploy `Dockerfile.server` behind TLS and obtain a stable `wss://.../ws`
2. configure the web client with `VITE_WS_URL`
3. validate quick match + private rooms using two real phones on different networks
4. test reconnect while Wi-Fi/5G/background state changes
5. add basic connection/message rate limits before broad public access
6. add structured server logs/metrics for queue, room, match completion and errors
7. collect real queue/latency data before introducing regions/MMR

M2.5 intentionally stays single-queue FIFO because there is no production population data yet.

## Real-device validation still required

The code path is complete, but a public `wss://` game server is still required before two separate phones can validate real network latency, prediction/reconciliation feel and disconnect recovery.

## Validation

CI must pass:
- web TypeScript
- server TypeScript
- unit tests
- client production build
- server health smoke test
