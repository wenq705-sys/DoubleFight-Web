# Art Direction — Miniature Kingdom

**Status: LOCKED for the first vertical slice.**

## North star

The board should feel like a premium miniature toy kingdom that the player wants to touch. The art must read immediately on a phone screen, look intentionally art-directed, and avoid the generic visual fingerprints of AI/WebGL tech demos.

Core phrase:

> **Bright premium stylized 3D + miniature fantasy kingdom + rounded toy silhouettes + soft commercial mobile-game lighting.**

The target feeling is **cute, collectible, tactile, polished and alive**. It must not look like a programmer prototype with primitives merely stacked together.

## Mobile-first composition

Mobile portrait is the primary canvas, not a compatibility mode.

1. The 4×4 board must remain the dominant interactive object on a narrow iPhone screen.
2. The outer kingdom may crop on mobile; readability and touchability are more important than showing the entire island.
3. The castle is a theme anchor, not the focal point.
4. HUD must respect safe areas and remain visually subordinate to the board.
5. Number badges must remain legible without zooming.
6. Desktop is a secondary presentation of the same scene.

## Shape language

- prefer rounded corners, soft cylinders, chunky roofs and friendly proportions
- slightly oversized roof caps, flags and landmarks are encouraged
- avoid razor-sharp edges and thin realistic architecture
- each tier should feel like a collectible toy building
- hard cubes are allowed only when softened by bevels/rounded corners and secondary forms

## Visual hierarchy

1. Board and number buildings are the focal point.
2. High-tier number buildings should naturally attract attention through silhouette and prestige accents.
3. The back castle establishes world/theme without competing with gameplay.
4. Trees, walls, bridge, flowers, clouds and distant mountains provide scale and charm.
5. VFX is transient punctuation, not permanent noise.

## Palette

- soft sky blue / cyan atmosphere
- fresh but gentle grass greens
- warm ivory stone
- honey/warm wood browns
- royal blue and coral accents
- gold reserved for progression and prestige
- purple/crystal accents only at high tiers
- small flower colors may add charm around the board

Avoid black-heavy presentation and saturated neon blue/purple as the default identity.

## Number progression

Numbers are **structures**, not UI tiles.

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
| 2048 | crowned kingdom wonder / landmark |

The silhouette must change meaningfully every few tiers. Do not ship a system where progression is only color/material changes.

Number readability is mandatory. The current preferred treatment is a physical front-facing badge/sign integrated into each toy landmark rather than text floating abstractly in 3D space.

## Motion language

Movement should feel physical and toy-like: short travel time, tiny directional lean, subtle lift, clear settle, no floaty UI easing.

Merge timing:

**travel/convergence → contact → brief hit-stop → squash/compression → upward birth/pop → layered secondary feedback → settle**

Low-tier merges stay restrained. Visual budget grows with tier.

### World reaction

At higher merges the surrounding world should acknowledge the event: flags kick, trees sway, camera pushes slightly, and prestige merges may add confetti. The reaction must remain readable rather than chaotic.

## VFX rules

Allowed:

- warm spark stars
- toy-like debris
- thin shock rings
- soft pulse light
- restrained magical motes at 128+
- camera push/shake at higher tiers
- celebratory confetti at prestige tiers
- dedicated legendary treatment at 2048

Avoid permanent bloom on every object, screen-filling particles for routine merges, chromatic aberration as a default effect, and generic sci-fi trails.

## Lighting

Use a commercial-mobile hierarchy: warm key/sun, cool sky/hemisphere fill, soft warm secondary fill, readable shadows, restrained tone mapping.

The scene should look attractive when static. Effects cannot be used to rescue weak modelling, weak composition or weak lighting.

## Performance art budget

The art direction must survive real mobile hardware.

- mobile DPR is capped deliberately
- shadow resolution may be lower on mobile than desktop
- particle count scales with merge tier and is short-lived
- decorative geometry should favor simple reusable forms
- no effect is allowed to compromise swipe responsiveness

## Future themes

Theme packs may replace world dressing and tile architecture while preserving gameplay readability. Candidate seasons: Candy Kingdom, Pirate Bay, Snow Citadel, Magic Academy, Mechanical Workshop.
