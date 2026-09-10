# Handoff

## Current state

**Milestone: M1.2 — Living Kingdom interaction pass.**

The repository is a clean Three.js/TypeScript implementation independent of the old Unity project. The product direction remains a 3D 2048 skill-duel game, while multiplayer/skills stay deferred until the single-board visual/feel baseline is approved.

### Implemented foundation

- deterministic tile-identity 2048 model
- move results exposing animation motions/merges/spawn
- Three.js rendering and responsive scene
- procedural 2→2048 building progression
- mobile swipe and keyboard/WASD controls
- score/best/highest UI
- procedural WebAudio feedback and vibration
- Vitest board-rule coverage
- CI and GitHub Pages deployment workflow

### M1.1 baseline

- portrait-first responsive rendering and safe-area HUD
- rounded toy-diorama geometry
- physical number badges and differentiated landmarks
- squash/stretch, hit-stop, camera impact and tiered VFX

### M1.2 changes

- mobile camera moved close to screen-aligned perspective so swipe directions visually match board travel
- live finger-drag steering: the 3D tile layer subtly follows/leans before release
- directional energy rails around the board light up according to swipe direction
- richer palette: less white/washed stone, deeper grass, warm brick/wood, stronger blue/coral/gold/teal accents
- kingdom density increased with village huts, market stalls, lanterns, flowers, number totems, richer walls and layered terrain
- board now has an explicit wood/stone frame and magical corner runes
- merge VFX upgraded with radial rays, layered shock rings, flashes, energy columns, crown bursts and tiered confetti
- every merge sends visible energy motes from the merge cell toward the royal castle
- castle windows/crystal, board cells, runes, water, flags and foliage react to merge energy
- stronger tactile audio and haptic patterns
- faster movement travel and heavier merge compression/birth timing

## Locked decisions

- Keep 2048 as the core mechanic.
- Visual target is **Miniature Kingdom**, not cyber-neon.
- Mobile portrait is the primary canvas.
- On mobile, screen up/down/left/right must visually map to board up/down/left/right. Do not reintroduce a strong 45° isometric camera for normal play.
- The environment is part of the feedback system. It must react to swipes/merges and must not be treated as static decoration.
- Low tiers stay readable; high tiers earn progressively stronger spectacle.
- Current phase is single-player only.
- Do not add duel/skills until the single-board visual baseline is approved.
- Three.js + TypeScript + Vite is the current web prototype stack.
- Codex must read `AGENTS.md` and this file before modifying product direction.

## Known gaps

- Procedural geometry remains below authored hero-asset quality; imported authored 3D assets may still be needed for the final ceiling.
- 2048 still needs a dedicated legendary 1024+1024 sequence beyond the general prestige merge treatment.
- Audio remains procedural rather than authored production SFX.
- Real-device profiling is required across representative iPhone/Android devices.
- Same-screen multiplayer and skills remain future milestones.

## Next task

Validate M1.2 on real iPhone Safari. Fix framing/readability/feel issues revealed by the recording, then create the dedicated 2048 legendary sequence before starting M2.

## Codex onboarding

A new Codex project should connect this repository and read `AGENTS.md` first, followed by `docs/HANDOFF.md`, `docs/ART_DIRECTION.md`, `docs/ARCHITECTURE.md`, `docs/GAME_DESIGN.md`, and `docs/ROADMAP.md`. It must not infer product direction from code alone.
