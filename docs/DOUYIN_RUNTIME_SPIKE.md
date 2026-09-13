# M2.9 Douyin Runtime Feasibility Spike

## Goal

Prove that the current Double Fight core can run inside the Douyin Mini Game runtime before any large UI/platform migration.

This spike is intentionally narrow. It does **not** port the current DOM/CSS UI and does **not** add account, ads, payment, ranking, or production release logic.

## Official runtime facts

- Douyin Mini Game is not a browser runtime and does not provide normal DOM/BOM APIs.
- The game entry is `game.js`; `game.json` and `project.config.json` are required project files.
- The first `tt.createCanvas()` call returns the single on-screen canvas.
- Touch input is available through `tt.onTouchStart/Move/End/Cancel`.
- App lifecycle is available through `tt.onShow` and `tt.onHide`.
- WebSocket is available through `tt.connectSocket()`; production socket endpoints must use WSS and be configured as legal domains.

References:
- https://developer.open-douyin.com/docs/resource/zh-CN/mini-game/develop/guide/dev-guide/bytedance-mini-game
- https://developer.open-douyin.com/docs/resource/zh-CN/mini-game/develop/guide/dev-guide/newbie-tutorial
- https://developer.open-douyin.com/docs/resource/zh-CN/mini-game/develop/api/javascript-api/overview
- https://developer.open-douyin.com/docs/resource/zh-CN/mini-game/develop/api/network/websocket/tt-connect-socket/
- https://developer.open-douyin.com/docs/resource/zh-CN/mini-game/develop/guide/basic-function/network

## Branch

`spike/m2-9-douyin-runtime`

## Non-goals

Do not:
- rewrite the existing browser product;
- migrate all DOM/CSS UI;
- change the shared 2048 rules;
- change the WebSocket protocol;
- change server authority;
- change skill rules/economy;
- add ads/login/payment;
- deploy or change the production server;
- introduce a heavyweight game engine.

## Four feasibility gates

### Gate 1 — Canvas + Three.js

Create a minimal Douyin Mini Game entry that:
1. obtains the screen canvas with `tt.createCanvas()`;
2. obtains a WebGL context;
3. boots a minimal Three.js renderer against that canvas;
4. renders a simple scene continuously;
5. reports renderer/device information in a minimal canvas-drawn debug overlay or console.

Then attempt the smallest possible reuse of existing Double Fight render code. Prefer a board-only representation before trying a full theme environment.

Pass:
- simulator renders without DOM assumptions;
- no `document`, `HTMLElement`, CSS or browser-only UI dependency is required for the spike scene.

### Gate 2 — Touch

Use `tt.onTouchStart/Move/End/Cancel` to detect a swipe and map it to left/right/up/down.

Pass:
- a physical or simulated swipe produces exactly one direction;
- touch cancel leaves no stuck gesture state;
- current shared board logic can consume the direction without DOM events.

### Gate 3 — WebSocket

Implement a tiny Douyin socket transport around `tt.connectSocket()`.

Connect to:
`wss://game.whvwayfare.online/ws`

For this spike only, prove:
- open;
- send `hello` with the existing protocol version;
- receive `welcome`;
- ping/pong;
- clean close/error handling.

Do not fork the network protocol.

If the IDE/app blocks the endpoint because the socket legal-domain configuration is missing, record it as an environment/configuration blocker rather than changing protocol code.

### Gate 4 — Lifecycle

Wire:
- `tt.onHide`
- `tt.onShow`

For the spike:
- on hide: suspend input/render/network activity that should not continue blindly;
- on show: resume rendering and verify connection state;
- if socket was lost, allow the existing reconnect identity path to be exercised later.

Pass:
- repeated hide/show does not duplicate listeners, render loops, or sockets.

## Project shape

Prefer a dedicated platform/spike area rather than contaminating the browser entrypoint.

Suggested direction:

```
platform/
  douyin/
    game.js
    game.json
    project.config.json
    runtime/
      canvas.ts
      touch.ts
      socket.ts
      lifecycle.ts
```

Exact names may change if the existing build structure suggests a cleaner layout.

The spike may add a dedicated build command if needed, but it must not break the normal Vite/GitHub Pages build.

## Required validation

Existing browser product must remain green:
- `npm run typecheck`
- `npm test`
- `npm run build`

Spike evidence:
- Douyin IDE screenshot/log for Gate 1;
- swipe log for Gate 2;
- `welcome` / ping-pong evidence for Gate 3, or exact legal-domain blocker;
- hide/show log for Gate 4.

## Decision at end

Return one of:

### FEASIBLE
Three.js + touch + socket + lifecycle all work with a thin platform adapter.

### FEASIBLE WITH SHIMS
Works, but Three.js/browser assumptions require a bounded compatibility layer. List every shim.

### BLOCKED
A platform/runtime limitation prevents the current architecture from being reused. Provide the smallest reproducible blocker before proposing a rewrite.

Do not proceed to account/ads/social integration until this decision is recorded.
