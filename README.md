# DoubleFight-Web / 双数对决

> A mobile-first 3D 2048 skill-duel game. The current milestone is a **single-player visual vertical slice** that establishes the art quality, interaction feel, and technical foundation before multiplayer and skills are introduced.

## Current milestone

**V0.1 — Miniature Kingdom 3D 2048 Vertical Slice**

- Standard 4×4 2048 rules
- Mobile swipe + keyboard/WASD input
- Three.js real-time 3D scene
- Stylized miniature kingdom board
- Procedural 2 → 2048 building progression
- Soft shadows, stylized lighting, fog and camera framing
- Merge squash/stretch, particles, shock rings, camera impact and haptics
- GitHub Actions CI and GitHub Pages deployment

## Product direction

The product direction is intentionally narrow:

1. Make **one 3D 2048 board** visually strong and satisfying enough to play on its own.
2. Preserve that visual quality when moving to **two-player same-screen portrait play**.
3. Add **skill-versus-skill interaction** only after the 2048 interaction and art baseline are approved.
4. Ship new seasons primarily through **theme packs** while keeping the core game stable.

The first visual theme is **Miniature Kingdom**: bright, toy-like, premium stylized 3D with a readable fantasy kingdom silhouette. Avoid generic cyber-neon / AI-demo aesthetics.

## Tech stack

- Three.js
- TypeScript
- Vite
- Vitest
- GitHub Actions
- GitHub Pages

## Development

```bash
npm install
npm run dev
```

Quality checks:

```bash
npm run typecheck
npm test
npm run build
```

## Repository map

```text
src/
  game/          deterministic game rules and session state
  rendering/     Three.js scene, environment, tile presentation, VFX
  audio/         procedural sound feedback
  ui/            DOM HUD and overlays
  config/        product/art tuning constants

tests/           deterministic rule tests
docs/            product, art, architecture, roadmap, handoff, ADRs
.github/          CI, Pages deploy, templates
AGENTS.md         mandatory AI/Codex operating instructions
```

## Documentation reading order

For any AI/Codex session, read in this order before making changes:

1. `AGENTS.md`
2. `docs/HANDOFF.md`
3. `docs/ART_DIRECTION.md`
4. `docs/ARCHITECTURE.md`
5. `docs/GAME_DESIGN.md`
6. `docs/ROADMAP.md`

## GitHub Pages

Production preview is deployed from `main` by `.github/workflows/deploy-pages.yml`.

Expected URL:

`https://wenq705-sys.github.io/DoubleFight-Web/`

## Status

This repository is the **new web/Three.js implementation**. It is intentionally independent from the previous Unity repository.
