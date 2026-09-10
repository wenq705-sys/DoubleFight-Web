# Architecture

## Intent

The codebase separates deterministic game rules from presentation so the same 2048 core can later support single-player, local same-screen multiplayer, AI opponents and platform-specific shells without rewriting rendering.

## Layers

### `src/game/`
Pure game-domain code. No Three.js, DOM, audio, storage or platform APIs.

`Board2048` owns 4×4 cell state, tile identity/value, moves and merge legality, score delta, spawn rules and game-over detection. It returns `MoveResult` containing motions and merge events so the renderer can animate without becoming game truth.

### `src/rendering/`
Three.js presentation layer.

- `GameScene`: renderer, camera, lighting, visual tile registry, animation coordination
- `environment/`: theme environment construction
- `tiles/`: number-building visual factory
- `vfx/`: transient effects

### `src/ui/`
DOM HUD and overlays only. UI requests actions but does not mutate the board directly.

### `src/audio/`
Non-authoritative feedback. Audio must degrade gracefully.

### `src/config/`
Art/game tuning constants that need iteration without scattering magic numbers.

## Data flow

```text
Input
  ↓
Board2048.move(direction)
  ↓
MoveResult (authoritative)
  ├─→ GameScene.applyMove()  → 3D animation/VFX
  ├─→ HUD                    → score/status
  └─→ SoundDesign            → audio/haptics
```

## Future local-duel architecture

Two-player same-screen mode should instantiate two independent board/session models and render them through a duel scene coordinator. Do not couple the two board implementations. Skill effects should be commands/events applied through a duel rules layer, not direct renderer hacks.

## Performance targets

- target 60 fps on modern mid-range phones where possible
- graceful 30 fps floor on weaker devices
- cap DPR instead of rendering native 3× mobile resolution
- avoid dynamic shadow-casting lights per tile
- pool/reuse VFX if effect count grows
- control draw calls and transparent layers
