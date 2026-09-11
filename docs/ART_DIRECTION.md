# Art Direction — Double Fight 3D Themes

**Status: LOCKED for the current vertical slice.**

## North star

The board should feel like a premium miniature mobile game that the player wants to touch.

> **Bright premium stylized 3D + collectible progression + rich warm palette + reactive world feedback + high-impact but readable VFX.**

## Shared visual rules

1. Board / pieces are always the focal point.
2. Screen directions visually match swipe directions.
3. **Model silhouette is primary identification.**
4. Numbers are secondary 2048 information and must not block the model.
5. Progression cannot be a color swap; silhouette/costume/architecture must evolve.
6. Every tier should survive a "black silhouette test": adjacent tiers should still feel meaningfully different without color.
7. Environment is part of feedback, not static wallpaper.
8. Routine merges are juicy; prestige merges are spectacular.
9. Mobile performance budget overrides decorative excess.

## Number / label rule

Do not attach a large plaque in front of the piece.

Preferred hierarchy:

```text
90%  model / silhouette / costume / landmark
10%  small number medallion or HUD information
```

Rank names belong in HUD/toasts/home progression screens rather than covering the character.

## Theme 1 — Miniature Kingdom

Bright fantasy toy kingdom with chunky rounded buildings, village props, castle, bridge, grass, water and number-world runes.

| Value | Visual role |
| ---: | --- |
| 2 | simple wooden camp |
| 4 | reinforced camp |
| 8 | blue-roof watchtower |
| 16 | stone keep |
| 32 | royal archer tower |
| 64 | golden watchtower |
| 128 | crystal mage tower |
| 256 | purple crystal fortress |
| 512 | miniature kingdom castle |
| 1024 | royal shrine/palace |
| 2048 | crowned kingdom wonder |

Palette: deep grass, warm sand/brick/wood, royal blue, coral, teal and controlled gold.

## Theme 2 — 后宫晋升 / Palace Rank

Original stylized imperial-court fantasy: red lacquer, gold trim, jade board, warm lanterns, blossom garden, palace hall, banners and pond.

Do not copy named TV characters, actor likenesses, official logos or specific costume designs.

| Value | Rank |
| ---: | --- |
| 2 | 宫女 |
| 4 | 答应 |
| 8 | 常在 |
| 16 | 贵人 |
| 32 | 嫔 |
| 64 | 妃 |
| 128 | 贵妃 |
| 256 | 皇贵妃 |
| 512 | 皇后 |
| 1024 | 凤仪之主 |
| 2048 | 母仪天下 |

### Silhouette escalation

- 2: smallest body, plain pastel clothing, tray, minimal hair
- 4: small fan + first ornament
- 8: open fan + taller hair
- 16: wider sleeves / stronger warm color
- 32: crown profile and scepter begin
- 64: wider skirt + halo
- 128: cape + more elaborate crown
- 256: larger royal profile + tassels
- 512: queen-level red/gold silhouette
- 1024: throne / royal frame
- 2048: throne + crown halo + wing-like gold prestige shapes

## Palace VFX motif

Allowed:
- ceremonial gold light
- blossom/petal bursts
- jade/teal secondary energy
- wing/fan arcs
- lantern pulses
- calligraphic fullscreen skill title
- red/gold shock rings

Avoid:
- photoreal celebrity faces
- copied TV costume/portrait designs
- flat cutouts
- generic cyber-neon effects

## Home / theme islands

Home should feel like a world/chapter selector rather than a settings menu.

- one world/island occupies the visual center
- selected island floats/breathes
- horizontal swipe changes world
- world title/progress/start CTA stay simple
- locked future worlds may be previewed
- current DOM/CSS islands are a lightweight shell and may later become authored 3D assets

## Camera and input

Mobile portrait is primary.

- screen left/right maps to board left/right
- screen up/down maps to board up/down
- retain enough pitch for 3D depth
- no strong 45° isometric yaw in normal play

## Performance art budget

- adaptive DPR, not permanent low-resolution rendering
- repeated props should be instanced where practical
- tile resources should be cached/reused
- transient VFX must be pooled/bounded
- high-detail authored assets should prefer stylized low-poly construction
- optimize draw calls/material count before aggressively reducing triangle count

## Future assets

Core pieces should gradually move from procedural blockouts to stylized low-poly GLB assets. Aim for clean silhouettes, few meshes/materials and reusable palettes/atlases rather than excessive tiny geometry.
