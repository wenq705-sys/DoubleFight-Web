# Handoff

## Current state

**Milestone: M1.1 — Mobile-first Miniature Kingdom polish.**

The repository is a clean Three.js/TypeScript implementation independent of the old Unity project. The product direction remains a 3D 2048 skill-duel game, but multiplayer/skills stay intentionally deferred until the single-board art/feel baseline is approved.

### Implemented foundation

- deterministic tile-identity 2048 model
- move results exposing animation motions/merges/spawn
- Three.js rendering and responsive scene
- miniature floating kingdom environment
- procedural 2→2048 building progression
- mobile swipe and keyboard/WASD controls
- score/best/highest UI
- procedural WebAudio feedback and vibration
- Vitest board-rule coverage
- CI and GitHub Pages deployment workflow

### M1.1 changes

- portrait-first camera framing with mobile DPR/shadow budgets
- tighter board spacing for narrow screens
- lower swipe threshold and fast-flick handling
- rounded toy-diorama environment geometry
- softer/cuter kingdom palette
- flowers, clouds and more environmental charm
- rebuilt 2→2048 silhouettes with rounded forms and physical number badges
- stronger movement lean/lift and merge squash/stretch
- hit-stop, camera push, camera shake and environment reaction
- layered spark/debris/ring/confetti VFX with short pulse lights
- safer mobile HUD/safe-area layout
- warmer toy-like procedural audio response

## Locked decisions

- Keep 2048 as the core mechanic.
- Visual target is **Miniature Kingdom**, not cyber-neon.
- Mobile portrait is the primary canvas.
- Current phase is single-player only.
- Do not add duel/skills until the single-board visual baseline is approved.
- Three.js + TypeScript + Vite is the current web prototype stack.
- Codex must read `AGENTS.md` and this file before modifying product direction.

## Known gaps

- Procedural geometry is now more bespoke/rounded, but authored hero-quality 3D assets may still be needed later for a final production ceiling.
- 2048 still needs a dedicated legendary 1024+1024 birth sequence beyond the general prestige merge treatment.
- Audio remains procedural placeholder quality rather than authored SFX.
- Real-device profiling is still required across representative iPhone/Android devices.
- Same-screen multiplayer and skills remain future milestones.

## Next task

**M1.2 Legendary pass:** make 1024→2048 a kingdom-level event, then perform real-phone visual/readability review before M2.

## Codex onboarding

A new Codex project should connect this repository and read `AGENTS.md` first, followed by `docs/HANDOFF.md`, `docs/ART_DIRECTION.md`, `docs/ARCHITECTURE.md`, `docs/GAME_DESIGN.md`, and `docs/ROADMAP.md`. It must not infer product direction from code alone.
