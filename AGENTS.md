# AGENTS.md — mandatory instructions for AI/Codex contributors

This file is the operational contract for AI agents working in this repository.

## 1. Read before editing

Read these files, in order:

1. `docs/HANDOFF.md`
2. `docs/ART_DIRECTION.md`
3. `docs/ARCHITECTURE.md`
4. `docs/GAME_DESIGN.md`
5. `docs/ROADMAP.md`
6. relevant ADRs under `docs/decisions/`

Do not begin implementation before understanding the current milestone and locked decisions.

## 2. Current product priority

The current milestone is **single-player 3D 2048 visual vertical slice**.

Priority order:

1. visual quality / art-direction fidelity
2. tactile movement and merge feedback
3. mobile portrait readability and performance
4. deterministic 2048 correctness
5. maintainable architecture

Do **not** add multiplayer, skills, metagame, ads, backend, matchmaking, account systems, or new game modes unless `docs/HANDOFF.md` explicitly moves the milestone forward.

## 3. Art-direction guardrails

The visual target is a premium stylized miniature fantasy kingdom.

Never drift toward:

- generic black + blue/purple neon UI
- cyberpunk grids
- default primitive-demo aesthetics
- excessive bloom/emissive glow
- particle spam used to hide weak modelling
- flat 2048 rectangles with only palette swaps

Every higher number should feel like a meaningful building/landmark evolution.

## 4. Architecture rules

- Game rules must not depend on Three.js or DOM APIs.
- Rendering consumes game state/results; it never owns game truth.
- VFX/audio failures must not break game logic.
- New rendering features belong under `src/rendering/`.
- Reusable tuning values belong under `src/config/`.
- Avoid god classes and files that mix rules, renderer, DOM, and network concerns.
- Keep mobile GPU/thermal cost in mind; visual quality comes from composition, silhouettes, lighting and timing before raw effect count.

## 5. Change discipline

For each meaningful change:

- update tests when rules change
- update `docs/HANDOFF.md` when milestone state changes
- update `docs/ART_DIRECTION.md` when an art rule is accepted or rejected
- add an ADR when making a durable architectural choice
- run `npm run typecheck`, `npm test`, and `npm run build`

Do not silently rewrite locked product decisions.

## 6. Handoff style

At the end of a task, report:

- what changed
- files changed
- validation performed
- visual/performance risks
- exact next recommended task

The goal is that a new AI session can continue without asking the user to reconstruct project history.
