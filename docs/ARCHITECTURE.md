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
docker run --rm -p 8787:8787 doublefight-server
```

Production browser clients must use `wss://`. Configure `VITE_WS_URL=wss://host/ws`.

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

## Future M2.1

The next client layer must render one large local board and one compact opponent board while preserving the current performance budget. Do not instantiate two full Solo environments. Online Duel needs a lighter duel presentation.

## Future platform layer

Direct uses of browser-only APIs should progressively move behind platform adapters before Douyin packaging:
- storage
- lifecycle
- audio resume
- haptics
- safe area
- share/invite
- account identity
