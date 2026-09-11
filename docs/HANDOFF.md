# Handoff

## Current state

**Milestone: M1.4 — Production Foundation.**

The game is still a single-board 3D 2048 prototype, but this milestone deliberately shifts from "AI demo iteration" toward a production-friendly mobile structure before same-screen multiplayer.

## What is implemented

### Core
- deterministic 2048 board logic
- random-clear skill
- mobile swipe + keyboard controls
- score/best/highest tracking

### Themes
- Miniature Kingdom
- 后宫晋升 / Palace Rank
- runtime theme switching
- per-theme progression records

### Home / product shell
- new floating **Theme Islands** home inspired by level/chapter island selectors
- swipe between Miniature Kingdom / Palace Rank
- locked Candy Kingdom / Snow Temple placeholders
- gameplay HUD now returns to the theme-island home rather than directly toggling worlds

### Piece readability
- palace giant rank plaques removed
- piece/model silhouette is primary
- **mobile readability hotfix:** 2/4/8/16 Palace tiers now use much stronger size, palette, hair, prop, shoulder and base-shape differences
- Palace 2 = small mint maid + tray + plain single bun
- Palace 4 = warm yellow/orange + twin buns + large fan
- Palace 8 = purple + tall central bun + lateral hairpins + open fan
- Palace 16 = coral/red + wide sleeves/shoulders + ceremonial back fan
- all gameplay-piece number plates/badges have now been removed in both Palace and Kingdom
- Palace tiers use discrete hue families instead of repeated light/dark reds
- Miniature Kingdom uses the same discrete tier-color rule
- Palace rank/Kingdom landmark names remain in HUD rather than on pieces
- a shared `tierProgression` helper enforces monotonic physical growth for every current and future theme
- high tiers continue crown/cape/halo/throne or landmark-complexity escalation

### Performance architecture
- adaptive DPR starts higher for clarity and reduces only if measured FPS requires it
- runtime quality tiers: high / medium / low
- optional `?debug=1` telemetry exposes FPS, frame time, DPR, draw calls, triangles, geometries and textures
- pooled VFX objects replace repeated new/dispose during merge/skill loops
- palace environment merge sparks are pooled
- kingdom merge-to-castle energy motes are pooled
- palace rail posts/caps use `InstancedMesh`
- kingdom walls/caps use `InstancedMesh`
- tile factories cache one template per value and reuse shared render resources
- common early/mid tiers warm up during idle time
- lower quality freezes repeated shadow-map updates before heavily degrading canvas clarity

## Locked product decisions

- 2048 remains the core.
- Mobile portrait is primary.
- Screen directions must match swipe directions.
- Visual identity comes primarily from models/silhouettes, not giant labels.
- Gameplay pieces must not display numeric/rank labels. Recognition comes from size + silhouette + hue + accessories.
- Palace characters are original; do not copy named TV characters or actor likenesses.
- Environment participates in gameplay feedback.
- Themes are first-class worlds surfaced from the home screen.
- Strong fullscreen skills are allowed, but their runtime cost must be bounded.
- Core hero pieces should **gradually** migrate to authored stylized low-poly GLB assets; do not pause current development waiting for that migration.

## Current risk list

- procedural models are still blockout-level compared with authored GLB assets
- home islands are a lightweight DOM/CSS production shell, not final authored 3D island assets
- real-device 10–20 minute profiling is still required
- 1024+1024→2048 still needs its dedicated legendary event
- audio remains procedural
- same-screen PvP is not yet implemented

## Validation requested next

On iPhone Safari:
1. compare sharpness versus previous 1.25 DPR build
2. play at least 10–20 minutes and watch for progressive lag
3. judge whether Palace 2/4/8/16/32/64 can be identified with no numbers at all
4. confirm adjacent tier colors are clearly different hue families and sizes strictly increase
5. test the new Theme Islands home flow
6. optionally open with `?debug=1` and capture the telemetry after a long session

## Codex onboarding

Read, in order:
1. `AGENTS.md`
2. `docs/HANDOFF.md`
3. `docs/ART_DIRECTION.md`
4. `docs/ARCHITECTURE.md`
5. `docs/GAME_DESIGN.md`
6. `docs/ROADMAP.md`
7. ADRs in `docs/decisions/`

Do not infer product direction from code alone.
