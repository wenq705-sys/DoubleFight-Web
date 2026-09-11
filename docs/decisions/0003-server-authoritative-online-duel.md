# ADR 0003 — Server-authoritative online duel

## Status

Accepted — M2.

## Context

"Double player" is defined as two players on two separate devices connected through a server. The game must launch with online PvP and later run across Douyin mini-game, WeChat mini-game and iOS.

2048 is especially suitable for command-based networking because player input is low-bandwidth (four movement directions plus future skill commands), while deterministic rules can be shared between client and server.

## Decision

1. Online PvP uses a persistent WebSocket connection.
2. The Node game server is authoritative for board state, spawn RNG, score, future energy/skills and match results.
3. Browser and server import one shared TypeScript game core.
4. The client sends ordered commands, never board state as truth.
5. Server RNG is deterministic/seeded internally; clients receive authoritative results/snapshots rather than choosing spawns.
6. Each player may select a different visual theme, but theme choice cannot modify competitive rules.
7. Private rooms use short human-entered room codes before public matchmaking is added.
8. Disconnects receive a short reconnect grace period and state restoration through server snapshots.
9. M2.1 adds client prediction/reconciliation to hide latency while preserving server authority.
10. Online rendering uses a lightweight duel presentation rather than two full Solo worlds.
11. Initial room state is in-memory. Redis/distributed room ownership is deferred until concurrency demands it.

## Consequences

### Positive

- cheating by choosing spawn cells/values is prevented by server authority
- client/server rule drift is minimized
- Web/Douyin/WeChat/iOS can share the same protocol
- low bandwidth requirements
- reconnect and future matchmaking have a clean foundation
- themes can scale independently from balance logic

### Tradeoffs

- a separately deployed TLS WebSocket server is required
- client prediction/reconciliation adds complexity in M2.1
- in-memory rooms mean one server process until a distributed room layer is introduced
- public GitHub Pages cannot offer live rooms until a `wss://` server endpoint is configured

## Security / validation

- never trust client score, board contents or future energy values
- validate protocol message shape
- cap WebSocket payload size
- require monotonic action sequences
- reconnect uses high-entropy tokens
- production endpoint must use TLS
- future rate limits and authentication belong at the gateway/platform layer

## Current implementation

- `shared/game/`
- `shared/protocol/`
- `server/RoomSession.ts`
- `server/RoomManager.ts`
- `server/index.ts`
- `src/network/OnlineClient.ts`
- `src/ui/OnlineLobby.ts`
