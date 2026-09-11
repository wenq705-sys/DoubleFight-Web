# Architecture

## Intent

The codebase separates deterministic game rules from presentation so the same 2048 core can later support single-player, local same-screen multiplayer, AI opponents and platform-specific shells without rewriting rendering.

## Layers

### `src/game/`
Pure game-domain code. No Three.js, DOM, audio, storage or platform APIs.

`Board2048` owns 4×4 cell state, tile identity/value, moves and merge legality, score delta, spawn rules, random-clear rules and game-over detection. It returns authoritative results so presentation can animate without becoming game truth.

### `src/rendering/`
Three.js presentation layer.

- `GameScene`: renderer, camera, lighting, visual tile registry, animation coordination
- `environment/`: theme environment construction
- `tiles/`: theme-specific tile/piece factories
- `vfx/`: pooled transient effects

### `src/performance/`
Runtime quality management.

`PerformanceManager` samples FPS/frame time plus renderer calls/triangles/geometries/textures and adjusts DPR/quality gradually. Use `?debug=1` to expose the in-app telemetry panel.

### `src/ui/`
DOM interface only.

- `HomeScreen`: floating theme-island selection / chapter shell
- `Hud`: in-game score, theme navigation, skill controls, overlays

UI requests actions but never mutates `Board2048` directly.

### `src/audio/`
Non-authoritative feedback. Audio must degrade gracefully.

### `src/config/`
Art/game tuning constants and theme metadata.

## Data flow

```text
Home/theme selection
  ↓
Session shell
  ↓
Input
  ↓
Board2048
  ↓
Authoritative result
  ├─→ GameScene       → movement / pieces / environment
  ├─→ pooled Effects  → bounded VFX
  ├─→ HUD             → score / rank / skill state
  └─→ SoundDesign     → audio / haptics
```

## Rendering/resource rules

1. Piece templates are built once per value/theme and cloned with shared Geometry/Material/CanvasTexture resources.
2. Repeated static decoration should use `InstancedMesh` when practical.
3. Transient VFX uses fixed pools. No steady-state merge loop should continually allocate/dispose GPU resources.
4. Screen-space or DOM/CSS presentation is preferred for very large fullscreen overlays.
5. Text is secondary information. Core piece identity comes from silhouette and art progression.
6. Mobile resolution is adaptive instead of globally forcing a low DPR.
7. Development performance telemetry must remain available with `?debug=1`.

## Current performance targets

- modern iPhone / comparable Android: target ~60 FPS during ordinary play
- temporary skill spikes: avoid sustained drops below ~45 FPS
- no obvious progressive slowdown over 20-minute sessions
- full 16-cell board must remain responsive
- memory/geometries/textures should stabilize after theme/template warmup
- draw calls matter more than raw triangle count for the current low-poly direction

## Future 3D asset pipeline

Procedural pieces remain the blockout/runtime fallback. Core hero pieces should gradually migrate toward authored stylized low-poly `.glb` assets.

Target pipeline:

```text
Blender / AI-assisted 3D
  ↓
stylized low-poly cleanup
  ↓
GLB
  ↓
theme AssetManager/cache
  ↓
shared materials / instancing where possible
```

Do not block current product development waiting for the asset migration.

## Future local-duel architecture

Two-player same-screen mode should instantiate two independent board/session models and render them through a duel coordinator. Skills should be commands/events through a duel rules layer, not renderer hacks.
