# M2.10 Douyin Platform Foundation

## Goal

Promote the successful M2.9 Douyin runtime spike into a production-facing platform architecture without changing gameplay rules, protocol authority, or server behavior.

The browser product must remain fully functional while the Douyin runtime gains first-class adapters for lifecycle, socket transport, storage, haptics, system/safe-area information, and account bootstrap.

## Branch

`refactor/m2-10-platform-foundation`

## Locked facts from M2.9

- Three.js/WebGL2 works on the Douyin screen canvas.
- `tt.onTouch*` can drive the existing shared `Board2048` core.
- `tt.connectSocket()` speaks the existing Protocol v6 with the production WSS endpoint.
- repeated background/foreground cycles are viable.
- the production browser app and shared core must not fork.

## Architecture target

Prefer one shared contract with two runtime implementations.

Suggested shape:

```
src/platform/
  types.ts
  browser/
    BrowserPlatform.ts
    BrowserSocketTransport.ts
  douyin/
    DouyinPlatform.ts
    DouyinSocketTransport.ts

platform/douyin/
  src/
    main.ts
    ...
```

Exact filenames may differ if a cleaner dependency boundary emerges.

The important rule is:

```
game / online client / product code
          |
      Platform contract
       /            \
 BrowserPlatform   DouyinPlatform
```

No gameplay module should call `tt.*` directly.

## Required platform capabilities

### 1. Lifecycle

Create a small lifecycle abstraction that can subscribe to foreground/background transitions.

Browser:
- use browser lifecycle primitives appropriate for the existing product.
- do not create duplicate listeners.

Douyin:
- use `tt.onShow` and `tt.onHide`.
- repeated show/hide must remain idempotent.

The abstraction must let networking/render/input owners decide how to suspend/resume; it must not invent game rules.

### 2. Socket transport

Refactor `OnlineClient` so it no longer owns browser-native `new WebSocket()` directly.

Define the smallest transport abstraction needed by OnlineClient:
- connect/open
- message
- close
- error
- send
- ready/open state
- explicit close

Browser implementation:
- wraps native `WebSocket`.

Douyin implementation:
- wraps `tt.connectSocket()` / SocketTask.

Requirements:
- preserve Protocol v6 messages exactly.
- preserve current reconnect/backoff semantics.
- preserve reconnect token behavior.
- old callbacks from superseded socket generations must not corrupt current state.
- no alternate Douyin networking path inside gameplay code.

Do not change the server protocol.

### 3. Storage

Create a key/value storage contract for the small synchronous data the current client persists.

Browser:
- `localStorage`.

Douyin:
- use the corresponding `tt.*Storage*` API supported by the JS mini-game runtime.

Migrate current direct persistent reads/writes that are necessary for:
- selected theme
- local best/highest values
- future settings bootstrap

Keep migration bounded. Do not rewrite unrelated UI in this milestone.

Storage failures must degrade safely instead of crashing game startup.

### 4. Haptics

Create a haptics contract.

Browser:
- preserve current `navigator.vibrate` behavior when available.

Douyin:
- use the appropriate Douyin vibration API.

Callers should express small semantic intents rather than know platform APIs, for example:
- light
- medium
- success/error where useful

Do not retune gameplay balance or add new haptic-heavy product behavior here.

### 5. System / safe-area information

Expose a normalized runtime snapshot:
- viewport/screen width + height
- pixel ratio if available
- platform/runtime identifier
- safe-area or inset data when the platform supplies it

Browser:
- preserve existing CSS-safe-area behavior; platform data may supplement, not replace, the browser CSS system.

Douyin:
- derive from current supported system/window/safe-area APIs.

Do not hard-code iPhone dimensions.

### 6. Account bootstrap contract

Add the client-side account bootstrap boundary, but do not implement production identity persistence on the server in this milestone.

Douyin:
- wrap `tt.login`.
- default startup behavior must avoid needlessly forcing a host login UI.
- expose the result as a typed bootstrap result containing only what the client legitimately receives (for example temporary code / anonymous code / login state).
- do not expose AppSecret anywhere client-side.
- do not derive a permanent user id from the temporary code.
- do not store openid/unionid client-side because they are not available until server exchange anyway.
- do not call `tt.login` repeatedly during one cold-start lifecycle; cache the in-flight/resolved bootstrap result as appropriate.

Browser:
- expose an anonymous/local bootstrap identity suitable for development without pretending it is a Douyin account.

Prepare a clean future seam for:
```
Douyin temporary login code
  -> Double Fight auth endpoint
  -> code2Session on server
  -> Double Fight session token
```

But DO NOT add the server endpoint or AppSecret handling in M2.10.

### 7. Douyin entrypoint promotion

The M2.9 spike entrypoint currently contains probe-specific behavior.

Promote only the reusable runtime pieces.

Requirements:
- keep a minimal Douyin build that starts successfully.
- remove or isolate probe-only logging/evidence behavior from the production path.
- keep evidence/docs from M2.9 for history.
- no DOM/CSS assumptions in the Douyin runtime.

## Explicit non-goals

Do not:
- add rewarded/interstitial ads yet;
- add share/invite yet;
- add ranking yet;
- add payment;
- add production auth server endpoints;
- add database schemas;
- change WebSocket protocol v6;
- change matchmaking, skills, energy, timer, result rules, or Board2048;
- redesign UI;
- migrate all DOM UI to canvas in this milestone;
- change Nginx/TLS/Docker/production server;
- introduce Cocos/Laya/Unity.

## Account-specific official guidance to preserve

The Douyin login API returns a temporary login credential. The permanent identity exchange must happen server-side.

Implementation should be compatible with:
- `tt.login({ force: false, ... })` style non-forcing bootstrap where appropriate;
- future `tt.checkSession`;
- a future server-issued Double Fight session token.

Do not treat the temporary `code` itself as a stable account identifier.

## Testing

Add unit tests for at least:

- Browser socket transport maps native socket events correctly.
- Douyin socket transport maps SocketTask events correctly.
- stale Douyin socket callbacks are ignored after replacement/close.
- OnlineClient continues reconnect/backoff using injected transport.
- reconnect token flow is unchanged.
- Browser storage read/write/failure behavior.
- Douyin storage read/write/failure behavior.
- lifecycle repeated show/hide is idempotent.
- haptics degrade safely when unsupported.
- system-info normalization.
- account bootstrap calls Douyin login at most once per cold-start bootstrap instance.
- account bootstrap handles code, anonymousCode, cancellation/failure without crashing startup.

Existing game/server tests must remain green.

## Required commands

```
npm run typecheck
npm test
npm run build
npm run build:douyin
```

If existing online smoke can run locally without production writes, run it too.

## Browser regression acceptance

At minimum verify:
- Home loads
- Solo starts and moves
- selected theme persists
- Online lobby opens
- production-compatible OnlineClient still connects through BrowserSocketTransport
- quick/private/reconnect smoke remains green

## Douyin acceptance

In IDE:
- canvas starts
- touch still reaches shared core
- WebSocket transport completes Protocol v6 hello/welcome/pong in development mode
- repeated lifecycle calls do not duplicate socket/listeners
- storage round-trip works
- haptics call path does not throw
- account bootstrap returns a typed result/log without requiring production server auth

Do not claim formal Douyin account login is complete until a server-side code exchange exists.

## Completion

Push the branch and create a Draft PR:

Title:
`refactor: M2.10 cross-platform runtime foundation`

Do not merge.
Do not deploy.

Final report:
- architecture
- files changed
- browser validation
- Douyin validation
- account bootstrap behavior
- tests
- remaining manual acceptance
- explicit deferred work for M2.11 / auth server
