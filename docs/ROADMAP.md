# Roadmap

## M0 — Repository foundation ✅

- company-style repository structure
- strict TypeScript/Vite foundation
- deterministic board tests
- CI and Pages deployment
- Codex/AI operating docs

## M1 — 3D 2048 visual / feel foundation ← CURRENT

Acceptance criteria:

- standard 2048 feels correct on touch and keyboard
- mobile directions visually match swipe directions
- number/rank identity is readable on a phone
- merge motion has physical squash/stretch and tiered feedback
- environment reacts to gameplay
- production Pages build is stable on iPhone Safari
- long sessions do not progressively degrade into severe lag

### M1.1 mobile/art polish ✅

- portrait rendering and mobile budget
- rounded toy-diorama language
- differentiated 2→2048 landmarks
- first tiered feedback pass

### M1.2 living-world / control pass ✅

- screen-aligned mobile camera
- live drag steering and directional rails
- richer palette and denser environment
- merge-to-world interaction
- stronger layered VFX/audio

### M1.3 themes + first skill + performance ← VALIDATE ON DEVICE

- runtime theme selection
- original Palace Rank theme with character progression
- larger readable rank/number plaques
- random-clear skill with 3 charges
- fullscreen skill spectacle
- cached reusable tile templates
- bounded mobile VFX counts
- lower mobile DPR/shadow budget
- long-session performance validation

### M1.4 legendary 2048 pass

- dedicated 1024→2048 anticipation / freeze / birth sequence
- theme-specific legendary event
- authored/high-fidelity SFX target
- final real-device fixes from M1.3

## M2 — Same-screen duel prototype

- split portrait scene into two readable themed boards
- independent multi-touch input zones
- timer/score victory rules
- local two-player UX

## M3 — Skill duel

- skill energy/charges tied to strong 2048 play
- self-recovery and opponent-interaction skills
- readable cross-board travel/impact
- anti-frustration/counterplay tuning

## M4 — Theme production pipeline

- formal theme asset/data contract
- third theme proving replacement pipeline
- theme-specific VFX/audio/character sets
- content/performance budget for Douyin mini-game packaging
