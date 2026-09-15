# ADR 0005 — Account-bound socket and progress

Status: Accepted for M2.10.4

Douyin presents its Double Fight session in the WebSocket `Authorization` header. The server verifies it before registering the connection, then attaches server-only `accountId` and account display name to the existing room path. Missing or invalid credentials remain guests, preserving Browser play. Provider IDs and bearer tokens never enter Protocol v6 gameplay messages.

`RoomSession` emits a result only on its authoritative finish transition. The single-host JSON account repository serializes atomic progress writes, counts W/L/D and Elo K=24 once per retained match ID, and max-merges Solo best/highest by theme. Recent match and ad replay ledgers are bounded; older replay IDs can expire. Horizontal scaling requires a transactional shared datastore, and Solo progress is not an anti-cheat score authority.
