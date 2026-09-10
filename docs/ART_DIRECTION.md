# Art Direction — Miniature Kingdom

**Status: LOCKED for the first vertical slice.**

## North star

The board should feel like a premium miniature toy kingdom that the player wants to touch. The art must read immediately on a phone screen, look intentionally designed, and avoid the generic visual fingerprints of AI/WebGL tech demos.

Core phrase:

> **Bright premium stylized 3D + miniature fantasy kingdom + chunky toy silhouettes + soft commercial mobile-game lighting.**

## Visual hierarchy

1. Board and number buildings are the focal point.
2. The back castle establishes world/theme without competing with gameplay.
3. Trees, walls, bridge, flags and distant mountains provide scale.
4. VFX is transient punctuation, not permanent noise.

## Palette

- sky blue / soft cyan atmosphere
- fresh grass greens
- warm ivory stone
- warm wood browns
- royal blue and coral faction accents
- gold reserved for progression and prestige
- purple/crystal accents only at high tiers

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

## Motion language

Movement should feel physical and toy-like: short travel time, tiny directional lean, clear settle, no floaty UI easing.

Merge timing: travel/convergence → contact → squash/compression → upward birth/pop → small secondary debris/shock ring → settle.

Low-tier merges stay restrained. Visual budget grows with tier.

## VFX rules

Allowed: dust/wood/stone fragments, thin shock rings, subtle magical motes at 128+, stronger camera impact at 512+, dedicated legendary treatment at 2048.

Avoid permanent bloom on every object, screen-filling particles for routine merges, chromatic aberration as a default effect, and generic sci-fi trails.

## Lighting

Use a commercial-mobile hierarchy: warm key/sun, cool sky/hemisphere fill, warm rim/fill, soft readable shadows, restrained tone mapping.

The scene should look good when static. Effects cannot be used to rescue weak modelling or lighting.

## Future themes

Theme packs may replace world dressing and tile architecture while preserving gameplay readability. Candidate seasons: Candy Kingdom, Pirate Bay, Snow Citadel, Magic Academy, Mechanical Workshop.
