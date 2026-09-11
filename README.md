# DoubleFight-Web / 双数对决

A mobile-first **3D 2048 online skill-duel game**.

The product has two pillars:

- **Solo Theme Islands** — premium themed 3D 2048 worlds
- **Online Duel** — two players on two devices, server-authoritative 2048, independent themes and future cross-board skills

Current themes:
- Miniature Kingdom
- 后宫晋升 / Palace Rank

## Current milestone

**M2.3 — Live Online Duel + Energy + First PvP Skills**

Implemented:
- Three.js mobile solo game
- Theme Islands home
- pooled/instanced/adaptive performance architecture
- shared client/server Board2048
- deterministic seeded RNG
- versioned WebSocket protocol
- Node/TypeScript authoritative game server
- 6-digit rooms
- independent player themes
- Ready → authoritative match start
- move validation / server board snapshots
- heartbeat and 30-second reconnect identity
- browser online lobby
- lightweight live dual-board battle screen
- client prediction + server reconciliation
- authoritative battle energy
- Random Clear / Shield / Petrify PvP skills
- real petrified movement/spawn barriers
- skill cooldown/status/cross-board feedback
- Docker server image
- CI server smoke test

M2.4 will add the authoritative round timer, full winner/tie-break logic and rematch flow.

## Tech stack

Client:
- TypeScript
- Three.js
- Vite
- Vitest

Server:
- Node.js
- TypeScript
- `ws` WebSocket server
- shared deterministic game core

Infrastructure:
- GitHub Actions
- GitHub Pages for web preview
- Dockerfile for the game server

## Development

Install:

```bash
npm install
```

Client:

```bash
npm run dev
```

Game server:

```bash
npm run dev:server
```

Local client automatically targets:

```text
ws://localhost:8787/ws
```

Health:

```text
http://localhost:8787/health
```

Quality checks:

```bash
npm run typecheck
npm test
npm run build
```

## Production server configuration

Use TLS in production:

```env
VITE_WS_URL=wss://game.example.com/ws
```

The client also accepts a temporary test override:

```text
?ws=wss://game.example.com/ws
```

Container:

```bash
docker build -f Dockerfile.server -t doublefight-server .
docker run --rm -p 8787:8787 doublefight-server
```

## Repository map

```text
shared/
  game/          authoritative cross-platform Board2048 + RNG
  battle/        energy + PvP skill tuning
  protocol/      versioned client/server protocol

src/
  network/       browser WebSocket client
  game/          compatibility exports / client session use
  rendering/     Three.js world, pieces, VFX
  performance/   adaptive mobile performance
  ui/            Theme Islands, Online Lobby, gameplay HUD
  audio/
  config/

server/
  index.ts       HTTP + WebSocket entry
  RoomManager.ts connection/room/reconnect orchestration
  RoomSession.ts authoritative two-player match state

tests/
docs/
.github/
```

## Release direction

1. finish real Online Duel
2. progressively replace procedural hero pieces with stylized low-poly GLB assets
3. Douyin mini-game first release
4. WeChat mini-game
5. iOS

GitHub Pages remains the rapid mobile preview environment; the WebSocket game server is deployed separately.
