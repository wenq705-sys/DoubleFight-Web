# Architecture

## Intent

Double Fight separates deterministic game rules, rendering and network authority so the same product can ship on web previews, Douyin mini-game, WeChat mini-game and later iOS without rewriting competitive rules.

## Shared core

### `shared/game/`

Platform-independent TypeScript.

- `Board2048`: moves, merges, spawning, score, clear rules
- `SeededRandom`: deterministic server-compatible RNG
- shared game types / public board snapshots

The browser and Node game server import the same implementation. Do not create a second server-only 2048 implementation.

### `shared/protocol/`

Versioned online protocol.

Current messages cover:
- hello/version
- create room
- join room
- reconnect
- select theme
- ready
- move
- leave
- ping/pong
- room state
- match start/state/end
- move acknowledgements/errors

Protocol changes must be explicit and version-aware.

## Browser client

### `src/game/`
Compatibility re-exports from shared core while legacy client paths are migrated.

### `src/network/`
`OnlineClient` owns WebSocket connection state, exponential reconnect, room identity/token and protocol I/O.

### `src/ui/`
- `HomeScreen`: Theme Islands / solo + Online Duel entry
- `OnlineLobby`: room create/join/ready/reconnect UI
- `Hud`: solo in-game HUD

### `src/rendering/`
Three.js presentation. Rendering is never authoritative game truth.

### `src/performance/`
Adaptive quality / telemetry.

## Game server

### `server/index.ts`
HTTP health endpoint + WebSocket endpoint `/ws`, heartbeat and connection lifecycle.

### `server/RoomManager.ts`
Owns:
- active connections
- 6-digit room lookup
- connection→player membership
- reconnect grace timers
- protocol command dispatch

### `server/RoomSession.ts`
Owns authoritative two-player room/match state:
- players
- independent themes
- ready state
- authoritative Board2048 instances
- deterministic server RNG
- monotonically increasing client action sequence
- game-over winner result

Current M2.0 state is intentionally in-memory. Redis/persistent horizontal scaling is deferred until actual concurrency requires it.

## Authority model

```text
Player swipe
   ↓
client presentation / future prediction
   ↓
MOVE(direction, sequence)
   ↓
WebSocket server
   ↓
RoomSession
   ↓
shared Board2048
   ↓
authoritative MoveResult + BoardPublicState
   ↓
both clients
```

The server controls spawn RNG. A modified client cannot choose spawn cells or values.

## Reconnect model

A joined player receives a cryptographically random reconnect token. On connection loss:
- the room retains identity/state for 30 seconds,
- the client reconnects,
- sends room code + token,
- server rebinds the new WebSocket connection,
- current room/match snapshot is returned.

Persistent account-based recovery is a later platform milestone.

## Server deployment

Local:

```bash
npm install
npm run dev:server
```

Health:

```text
GET http://localhost:8787/health
WS  ws://localhost:8787/ws
```

Container:

```bash
docker build -f Dockerfile.server -t doublefight-server .
docker run --rm -p 127.0.0.1:8787:8787 doublefight-server
```

Production browser clients must use `wss://`. Configure `VITE_WS_URL=wss://host/ws`.

M2.6 deployment uses `ops/compose.server.yml` and host Nginx on 443, with the
game port published only on loopback. See `docs/SERVER_DEPLOYMENT.md` for the
IP certificate, renewal, deployment, rollback and real-device acceptance process.

For temporary testing the client also accepts a query override:
`?ws=wss://host/ws`.

## Rendering/resource rules

Existing M1 rules remain:
- cached piece templates
- instanced repeated props
- pooled VFX
- adaptive DPR
- numberless silhouette/hue piece identity
- monotonic tier-size growth
- optional `?debug=1` performance telemetry

## M2.1 Duel Lite client

`DuelScene` owns one lightweight Three.js scene containing both boards. It reuses cached theme piece factories, uses InstancedMesh for board cells and intentionally omits full Solo environments.

`DuelScreen` owns match presentation and input. It receives authoritative `MatchSnapshot` state from `OnlineClient`.

### Prediction / reconciliation

The server snapshot includes stable tile ids. A local swipe runs `predictMoveTiles`, which computes only slide/merge state and deliberately does **not** spawn a new tile. The client sends the ordered MOVE command immediately.

On each fresh server snapshot:

1. read the authoritative local board + `lastSequence`
2. discard pending commands already acknowledged by sequence
3. replay remaining pending commands with `predictMoveTiles`
4. render the resulting predicted local board
5. render opponent board directly from authoritative state

This keeps swipe response immediate while the server remains the only authority over spawn RNG and competitive truth.

## M2.2 Battle energy

Battle energy is competitive state and therefore server-authoritative.

`shared/battle/energy.ts` contains the common tuning curve and future skill costs, but the browser uses it only for presentation/reference. The server is the only place that mutates player energy.

```text
authoritative MOVE
      ↓
Board2048 MoveResult.merges
      ↓
energyForMerges()
      ↓
RoomPlayerRecord.energy
      ↓
move_ack + MatchSnapshot
      ↓
Duel HUD / board pulse
```

Energy is capped at 100. Rewards rise with merge value, and multiple merges in one swipe earn a deterministic combo bonus. Combo calculation intentionally does not depend on wall-clock timing so latency cannot affect competitive rewards.

The local prediction path predicts board motion/score feel only. It does **not** predict authoritative energy.

## M2.3 Server-authoritative skills

`shared/battle/skills.ts` defines ids and tuning, while `RoomSession.castSkill()` owns all competitive mutation.

```text
CAST_SKILL(skillId, skillSequence)
        ↓
RoomSession validates
energy / cooldown / target / sequence
        ↓
server mutates board + player status
        ↓
skill_event + MatchSnapshot
        ↓
both clients render the result
```

Move sequence and skill sequence are intentionally separate so skill acknowledgements cannot incorrectly advance client move reconciliation.

### Petrified cells

Petrify is not a cosmetic overlay. `Board2048` owns a blocked-cell set. A blocked cell:
- cannot receive a spawn,
- cannot contain a tile when created,
- splits a movement row/column into independent segments,
- counts as unavailable space for `canMove()`.

`predictMoveTiles()` accepts authoritative blocked cells and applies the same line segmentation, preserving local input feel without inventing the competitive effect.

Petrify currently lasts six seconds. Server timers clear the block and broadcast a fresh match snapshot. Shield is a one-hit state that consumes an incoming Petrify before any cell is blocked.

## M2.4 Match lifecycle

The server owns the wall clock.

At match creation:

```text
roundStartedAt = server now
roundEndsAt   = roundStartedAt + 180s
```

`RoomManager` schedules the deadline, while `RoomSession.resolveTimeLimit()` is also checked before competitive commands so a delayed timer callback cannot allow a late MOVE or skill.

Reconnect does not pause or recreate the round. The reconnecting client receives the same `roundEndsAt` and computes display time from `MatchSnapshot.serverTime`.

Time-limit resolution is deterministic:

```text
score
  ↓ tie
highest tile
  ↓ tie
usable empty cells
  ↓ tie
draw
```

The server freezes a `MatchResult` payload at finish. Result UI renders that payload instead of recomputing the winner.

### Rematch

A finished private room is reusable. `set_rematch_ready` updates per-player readiness. Once both connected players opt in, `RoomSession` starts a completely new match while preserving room/player/theme identity.

New match resets:
- board / RNG seed
- energy
- shield / petrify
- cooldowns
- action sequence authority
- result state
- timer

## M2.5 Public matchmaking

Matchmaking is deliberately an orchestration layer, not a second match implementation.

`MatchmakingQueue` stores lightweight waiting entries:

```text
connectionId
nickname
theme
joinedAt
```

`RoomManager` pairs FIFO entries and immediately converts them into a normal `RoomSession`:

```text
Quick Match
   ↓
MatchmakingQueue
   ↓ two live clients
RoomSession
   ↓
same reconnect / Board2048 / energy / skills / timer / results / rematch
```

This keeps competitive rules identical between public matchmaking and six-digit private rooms.

Current queue behavior:
- one global FIFO queue
- 60-second timeout
- cancel supported
- disconnect removes the queue entry immediately
- selected themes are independent and cosmetic
- no MMR, bots or region buckets yet

Those should only be added after production concurrency/latency data justifies the complexity.

## Future platform layer

Direct uses of browser-only APIs should progressively move behind platform adapters before Douyin packaging:
- storage
- lifecycle
- audio resume
- haptics
- safe area
- share/invite
- account identity
