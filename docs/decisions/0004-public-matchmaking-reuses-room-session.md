# ADR 0004 — Public matchmaking reuses RoomSession

## Status

Accepted — M2.5.

## Context

Double Fight now has a complete private-room authoritative PvP loop. Public quick match is required, but implementing a separate "matchmade battle" path would duplicate competitive state and create drift between private rooms and public matches.

There is not yet real production population, latency-distribution or skill-rating data.

## Decision

1. Public matchmaking is a thin FIFO orchestration layer owned by `RoomManager`.
2. `MatchmakingQueue` stores only waiting connection identity, nickname, selected theme and join timestamp.
3. A matched pair is converted into the existing two-player `RoomSession`.
4. Matched players are automatically readied and enter the same authoritative 180-second match loop.
5. Theme choice remains independent and cosmetic.
6. Private six-digit rooms remain unchanged.
7. Queue entries are not reconnect-persistent. Disconnect removes a waiting entry immediately.
8. A waiting entry times out after 60 seconds.
9. No MMR, regional buckets or bot filling is introduced until production data demonstrates a need.
10. Matchmaking state is protocol-visible so clients never infer queue state locally.

## Consequences

### Positive

- one competitive engine for private and public play
- no duplicate Board2048/skill/timer/result logic
- minimal server complexity for first public testing
- easy future replacement of FIFO selection without touching RoomSession
- queue metrics can guide later region/MMR decisions

### Tradeoffs

- one global in-memory queue assumes a single server process
- queue state is lost on process restart/disconnect
- no skill-based matching
- no region-aware latency optimization
- horizontal scaling will eventually require shared queue/room ownership infrastructure

## Future trigger for distributed matchmaking

Do not introduce Redis/distributed queue ownership just because it is conventional. Introduce it when one of these becomes true:
- more than one game-server process must accept matchmaking traffic,
- a single process approaches real concurrency limits,
- queue continuity across deploys becomes a product requirement,
- regional matchmaking requires shared coordination.
