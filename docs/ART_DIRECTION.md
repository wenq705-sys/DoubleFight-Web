# Art Direction — Miniature Kingdom

**Status: LOCKED for the first vertical slice.**

## North star

The board should feel like a premium miniature toy kingdom that the player wants to touch. The art must read immediately on a phone screen, feel authored rather than generated, and avoid generic WebGL-demo fingerprints.

Core phrase:

> **Bright premium stylized 3D + miniature fantasy kingdom + chunky toy silhouettes + rich warm palette + reactive world feedback.**

## Visual hierarchy

1. Board and number buildings are the focal point.
2. The back castle establishes world/theme without competing with gameplay.
3. Village props, trees, walls, bridge, runes and distant mountains create a dense but readable miniature world.
4. VFX is transient punctuation and grows with number tier.

## Palette

Use deeper grass, warm sand/brick/wood, strong royal blue, coral, teal and controlled gold accents. Avoid large fields of pure white/cream that wash the scene out.

Gold is prestige. Crystal blue/purple starts at higher tiers. Warm windows/lanterns provide living-world contrast.

Avoid black-heavy presentation and saturated neon blue/purple as the default identity.

## Camera and input

Mobile portrait is the primary view. Gameplay camera must remain close to screen-aligned perspective:

- screen left/right visually maps to board left/right
- screen up/down visually maps to board up/down
- retain enough pitch for 3D depth
- do not use a strong 45° isometric yaw for normal mobile play

The board may subtly follow the finger during drag to reinforce direct manipulation.

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

The silhouette must change meaningfully every few tiers. Progression cannot be only color/material changes.

## Motion language

Movement is short, decisive and tactile: immediate drive, tiny lift/lean, contact, settle. It must not feel like floating UI.

Merge timing:

travel/convergence → hard contact → short hit-stop → deep squash/compression → vertical birth/pop → secondary VFX → spring settle.

Low tiers stay restrained. Visual budget grows aggressively with tier.

## Living-world rule

The environment is not decoration. Swipes and merges should visibly affect the kingdom.

Examples already in the baseline:

- swipe direction lights board-edge energy rails
- merge energy travels from the merged cell to the castle
- castle windows/crystal pulse
- board cells and runes react
- flags, foliage and water respond to impacts

Future additions should extend this system rather than create unrelated ambient noise.

## VFX rules

Allowed: dust/wood/stone fragments, stylized stars, radial rays, thin shock rings, energy columns, magical motes, crown bursts, tiered confetti, controlled camera impact.

Avoid permanent bloom on every object, screen-filling noise for routine merges, chromatic aberration as a default effect, and generic sci-fi trails.

## Lighting

Use warm key/sun, cool sky fill, warm secondary fill, readable soft shadows and restrained tone mapping. Warm window/lantern emission helps break up pale geometry.

The scene must look good when static. Effects cannot rescue weak modelling or lighting.

## Future themes

Theme packs may replace world dressing and tile architecture while preserving input/readability rules. Candidate seasons: Candy Kingdom, Pirate Bay, Snow Citadel, Magic Academy, Mechanical Workshop.
