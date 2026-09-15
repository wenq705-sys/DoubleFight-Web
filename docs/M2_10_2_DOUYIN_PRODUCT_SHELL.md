# M2.10.2 Douyin Product Shell & Visual Parity

## Goal

Replace the M2.9/M2.10 technical probe presentation with a real Double Fight Solo presentation inside the Douyin Mini Game runtime.

This pass must make the IDE immediately look like the game rather than a runtime test.

## Scope

- Reuse the production `BattleBoardView` and full theme environments.
- Support both Kingdom and Palace rendering without DOM.
- Reuse shared `SoloController` and `Board2048`.
- Add a canvas/WebGL HUD layer for score, highest tile, theme, and basic guidance.
- Preserve the M2.10 platform adapters.
- Keep Browser behavior unchanged.

## Required refactor

Current production theme rendering still creates a few text/face textures with `document.createElement('canvas')`.
Introduce a tiny texture-canvas factory so browser uses DOM canvas and Douyin uses subsequent `tt.createCanvas()` offscreen canvases. Do not introduce a DOM shim.

## Non-goals

- Full Douyin home/lobby/PvP UI in this pass.
- Server auth.
- Ads/share/payment.
- Protocol or gameplay changes.
- New art assets.

## Acceptance

Opening the Douyin build should show:
- full themed environment, not the orange probe grid;
- production Kingdom/Palace pieces;
- production move/spawn/merge presentation;
- score/highest/theme HUD;
- clear mobile-safe top/bottom spacing;
- touch-driven shared Solo gameplay.

Browser tests/build and Douyin build must stay green.
