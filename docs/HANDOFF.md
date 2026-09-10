# Handoff

## Current state

**Milestone: M1 — Miniature Kingdom visual vertical slice.**

The repository has been rebuilt as a clean Three.js/TypeScript project independent of the old Unity implementation.

### Implemented

- deterministic tile-identity 2048 model
- move results exposing animation motions/merges/spawn
- responsive Three.js scene
- miniature floating kingdom environment
- procedural 2→2048 building progression
- mobile swipe and keyboard/WASD controls
- score/best/highest UI
- squash/stretch merge feedback
- tiered particles/shock rings/camera impact
- procedural WebAudio merge feedback and vibration
- Vitest board-rule coverage
- CI and GitHub Pages deployment workflow

## Locked decisions

- Keep 2048 as the core mechanic.
- Visual target is `Miniature Kingdom`, not cyber-neon.
- Current phase is single-player only.
- Do not add duel/skills until the single-board visual baseline is approved.
- Three.js + TypeScript + Vite is the current web prototype stack.

## Known gaps

- Current buildings remain mostly procedural primitives; next pass must push silhouettes toward bespoke commercial-mobile art.
- 2048 needs a dedicated legendary birth/celebration sequence.
- There are no imported authored 3D assets yet.
- Audio is procedural placeholder quality.
- Mobile GPU performance still needs real-device profiling.

## Next task

**M1.1 Art-quality pass:** improve tile silhouettes, number readability, world reaction and small-screen camera composition without adding any new gameplay systems.

## Codex onboarding

A new Codex project should connect this repository and read `AGENTS.md` first. It should not infer product direction from code alone.
