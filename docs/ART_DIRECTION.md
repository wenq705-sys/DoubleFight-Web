# Art Direction — Double Fight 3D Themes

**Status: LOCKED for the current vertical slice.**

## North star

The board should feel like a premium miniature mobile game that the player wants to touch. Art must read immediately on a phone screen, feel authored rather than generated, and avoid generic WebGL-demo fingerprints.

Shared core phrase:

> **Bright premium stylized 3D + collectible progression + rich warm palette + reactive world feedback + high-impact but readable VFX.**

## Shared visual rules

1. Board / pieces are always the focal point.
2. Screen directions must visually match swipe directions.
3. Numbers or rank labels must be readable on a narrow phone.
4. Progression cannot be only a color swap; silhouette and costume/architecture must evolve.
5. Environment is part of feedback, not static wallpaper.
6. Routine merges are juicy; prestige merges are spectacular.
7. No permanent bloom/noise across the whole screen.
8. Mobile performance budget overrides decorative excess.

## Theme 1 — Miniature Kingdom

### Identity

Bright fantasy toy kingdom with chunky rounded buildings, village props, castle, bridge, grass, water and number-world runes.

### Progression

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

### Palette

Deep grass, warm sand/brick/wood, royal blue, coral, teal, controlled gold.

## Theme 2 — 后宫晋升 / Palace Rank

### Identity

Original stylized imperial-court fantasy: red lacquer, gold trim, jade board, warm lanterns, blossom garden, palace hall, banners and pond.

This theme evokes palace-drama rank progression but must not copy named TV characters, actor likenesses, official logos or specific costume designs.

### Character progression

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

Low ranks use simple pastel robes/hair. Higher ranks gain stronger red/purple/blue palettes, gold embroidery cues, more elaborate hair ornaments, shoulder pieces, crown/halo prestige and stronger VFX.

Every character tile needs a large front-facing **rank + number plaque**. The silhouette should remain recognizable even if the player ignores the number.

### Palace VFX motif

Allowed:
- gold ceremonial light
- blossom/petal bursts
- jade/teal secondary energy
- fan/wing arcs
- lantern pulses
- calligraphic fullscreen skill title
- red/gold shock rings

Avoid:
- copying TV character portraits
- photoreal celebrity faces
- flat costume cutouts
- generic neon cyber effects

## Camera and input

Mobile portrait is primary.

- screen left/right maps to board left/right
- screen up/down maps to board up/down
- retain enough pitch for 3D depth
- no strong 45° isometric yaw during normal play
- board may subtly follow finger during drag

## Motion language

Movement is short, decisive and tactile:

**input → immediate drive → tiny lift/lean → hard contact → hit-stop → compression → birth/pop → VFX → spring settle**

Low tiers stay readable. Visual budget grows aggressively with tier.

## Skill spectacle

Fullscreen skills may temporarily exceed the normal VFX budget, but:
- duration should be short,
- 3D object counts must stay bounded,
- DOM/CSS overlays are preferred for large fullscreen presentation where appropriate,
- gameplay state must remain understandable immediately after the effect.

## Performance art budget

- mobile DPR is capped
- shadow resolution is reduced on mobile
- tile templates should reuse geometry/material/label textures
- transient VFX counts are hard-capped
- no decorative system may cause progressive long-session degradation

## Future themes

Candidate packs: Candy Kingdom, Pirate Bay, Snow Citadel, Magic Academy, Mechanical Workshop.
