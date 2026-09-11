# Handoff

## Current state

**Milestone: M1.3 — Theme framework + first skill/performance pass.**

The repository is a clean Three.js/TypeScript implementation independent of the old Unity project. The product direction remains a portrait 3D 2048 skill-duel game. Same-screen multiplayer is still deferred, but the first self-board skill is now intentionally implemented to validate skill spectacle and UX.

## Implemented foundation

- deterministic tile-identity 2048 model
- move results exposing animation motions/merges/spawn
- Three.js rendering and responsive scene
- mobile swipe and keyboard/WASD controls
- score/best/highest UI
- procedural WebAudio feedback and vibration
- Vitest board-rule coverage
- CI and GitHub Pages deployment workflow

## Approved baseline

- screen-aligned portrait camera: visual directions must match finger swipe directions
- live drag steering and directional board energy
- strong squash/stretch, hit-stop, camera impact and tiered VFX
- environment participates in feedback instead of acting as static decoration
- mobile is the primary performance target

## Theme system

Two runtime-selectable themes now exist:

1. **Miniature Kingdom**
   - building/landmark progression
   - village/castle/bridge/number-world environment
2. **后宫晋升 / Palace Rank**
   - original stylized court characters rather than copied TV characters
   - rank progression: 宫女 → 答应 → 常在 → 贵人 → 嫔 → 妃 → 贵妃 → 皇贵妃 → 皇后 → 凤仪之主 → 母仪天下
   - red/gold/jade imperial courtyard, lanterns, banners, blossom garden and pond
   - large front-facing rank + number plaques for mobile readability

## First skill

**随机清块**
- 3 charges per round
- clears up to 2 random occupied tiles
- board rule is deterministic/testable through injected RNG
- fullscreen DOM/CSS spectacle plus bounded Three.js board VFX
- haptic and procedural audio feedback
- Space key also triggers the skill on desktop

## Performance work

The previous late-game slowdown was treated as a real resource-lifetime problem, not only a visual tuning issue.

Implemented:
- kingdom tile models are cached once per number value and cloned, sharing geometry/material/CanvasTexture resources
- palace character tiles use the same template-cache strategy
- transient particle/burst counts are hard-capped on mobile
- VFX can be cleared between resets/theme changes
- mobile device-pixel-ratio cap reduced
- mobile shadow map reduced to 768
- per-frame camera scratch vectors are reused instead of allocated every frame
- skill fullscreen animation is primarily DOM/CSS so the 3D object count stays bounded

## Locked decisions

- Keep 2048 as the core mechanic.
- Mobile portrait is the primary canvas.
- Screen up/down/left/right must visually map to board up/down/left/right.
- The environment is part of the feedback system.
- Themes may radically change art/content but must not break board readability or input mapping.
- Palace theme characters are original; do not copy named TV characters or actor likenesses.
- Low tiers stay readable; high tiers earn progressively stronger spectacle.
- Three.js + TypeScript + Vite is the current web stack.
- Codex must read `AGENTS.md` and this file before modifying product direction.

## Known gaps

- Palace characters are currently procedural stylized 3D models; authored hero-quality assets may raise the final production ceiling.
- 1024+1024→2048 still needs a dedicated legendary sequence.
- Audio remains procedural rather than authored production SFX.
- Long-session real-device profiling is still required to verify that the late-game slowdown is resolved.
- Same-screen multiplayer and offensive/counter skills remain future milestones.

## Next task

Real-device validation of:
1. palace-theme readability/charm,
2. random-clear skill spectacle,
3. 10+ minute performance stability,
4. number visibility on a narrow iPhone.

Then build the dedicated 2048 legendary event before M2 same-screen duel work.

## Codex onboarding

A new Codex project should connect this repository and read `AGENTS.md` first, followed by `docs/HANDOFF.md`, `docs/ART_DIRECTION.md`, `docs/ARCHITECTURE.md`, `docs/GAME_DESIGN.md`, and `docs/ROADMAP.md`. It must not infer product direction from code alone.
