# AGENTS.md — mandatory instructions for AI/Codex contributors

This file is the operational contract for AI agents working in this repository.

## 1. Read before editing

Read in order:

1. `docs/HANDOFF.md`
2. `docs/ART_DIRECTION.md`
3. `docs/ARCHITECTURE.md`
4. `docs/GAME_DESIGN.md`
5. `docs/ROADMAP.md`
6. relevant ADRs under `docs/decisions/`

Do not begin implementation before understanding the current milestone and locked decisions.

## 2. Current product priority

Current milestone: **M1.4 Production Foundation**.

Priority order:

1. mobile performance stability over long sessions
2. sharp/readable mobile rendering
3. silhouette-first theme/piece quality
4. tactile movement / merge / skill feedback
5. maintainable architecture and Codex handoff quality
6. deterministic 2048 correctness

Do **not** add multiplayer, backend, matchmaking, accounts, ads or unrelated modes unless HANDOFF/ROADMAP explicitly moves the milestone.

## 3. Art-direction guardrails

- premium stylized miniature 3D
- no generic cyber-neon drift
- no giant text plaques covering pieces
- model silhouette is primary; number is secondary
- adjacent tiers must differ in silhouette, not only color
- high-tier spectacle scales up aggressively but stays readable
- palace theme uses original characters only

## 4. Architecture/performance rules

- game rules never depend on Three.js or DOM
- renderer never owns authoritative game truth
- reuse/caching is the default
- do not introduce steady-state `new Mesh/new Geometry/new Material` inside repetitive merge loops when a pool/cache can serve it
- repeated static props should consider `InstancedMesh`
- VFX must be pooled and bounded on mobile
- adaptive resolution should preserve sharpness when headroom exists
- use `?debug=1` telemetry before guessing about performance
- optimize draw calls/material changes before blindly cutting polygons
- authored hero pieces may gradually migrate to stylized low-poly GLB assets; preserve procedural fallback until the asset pipeline is proven

## 5. Change discipline

For each meaningful change:

- update tests when rules change
- update HANDOFF when milestone state changes
- update ART_DIRECTION when a visual rule is accepted/rejected
- add an ADR for durable architecture changes
- run `npm run typecheck`, `npm test`, and `npm run build`

Do not silently rewrite locked product decisions.

## 6. Handoff style

Report:
- what changed
- files changed
- validation performed
- visual/performance risks
- exact next recommended task

A new AI session must be able to continue without reconstructing project history from chat.
