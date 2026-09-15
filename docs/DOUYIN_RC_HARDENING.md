# Double Fight — Douyin Full Product RC Hardening

## Goal

Turn the current feature-complete Douyin product branch into a submission-ready release candidate without changing core gameplay semantics.

This milestone is for release engineering, operator safety, auditability, and real-device acceptance. It must not replace the required human/operator steps for platform secrets, legal domains, or real-device ad validation.

## A. Release build preflight

Add an executable preflight command that fails the RC build when any of the following are wrong:

- Douyin release project config does not have urlCheck=true.
- App ID is missing or inconsistent between source/release config.
- production API URL is not HTTPS.
- production socket URL is not WSS.
- banner/rewarded/interstitial ad unit IDs are missing or duplicated.
- development-only domain bypass leaks into the release package.
- release package is missing game.js, game.json, project.config.json, or generated audio assets.
- obvious server-only secret names/values are bundled into platform/douyin/dist-release/game.js.
- release bundle still contains development probe labels/log prefixes that should not ship.

Expose as:
- npm run preflight:douyin
- CI after the release build.

## B. Production server readiness

Add a safe readiness signal for operators without exposing secrets.

- Keep /health backward-compatible.
- Add a server readiness endpoint or equivalent diagnostic that returns only booleans/status categories:
  - authConfigured
  - sessionSigningConfigured
  - dataDirectoryWritable
  - protocolVersion
- Never return AppSecret, signing secret, openid, session_key, tokens, or filesystem contents.
- Production Nginx should route only the reviewed endpoint if needed.
- Missing Douyin secrets must not crash Browser PvP, but the readiness result must make the RC failure obvious.

Add tests and smoke coverage.

## C. Production environment validation

Create an operator script/checklist for:

- DOUYIN_APP_ID
- DOUYIN_APP_SECRET
- DOUBLEFIGHT_SESSION_SECRET >= 32 bytes
- optional previous signing secret >= 32 bytes when supplied
- persistent /data volume mounted
- writable data path
- TLS certificate chain
- HTTPS request domain
- WSS socket domain

No secret values in Git or logs.

## D. Release-safe logging

Audit the Douyin client and server logs.

- Remove obsolete M2.9/M2.10 probe labels from release-facing logs where practical.
- Do not log:
  - one-use login code
  - bearer/session token
  - AppSecret
  - openid/unionid
  - reconnect token
- Keep compact operational categories only.

## E. Real-device acceptance checklist

Document a single pass/fail matrix for an actual phone build:

### Startup/account
- cold start
- warm start
- authenticated account shown
- restart restores same Double Fight account
- offline auth fallback does not block Home/Solo
- reconnection recovers after network returns

### Home/UI
- no overlap with host capsule/safe area
- Kingdom and Palace both render correctly
- main CTA hierarchy is visually strong
- text readable on iPhone/Android portrait
- no probe/debug UI visible

### Solo
- swipe, spawn, move, merge
- clear skill
- sound/haptics settings
- score/highest persistence
- server restore after local cache clear
- rewarded video complete grants exactly once
- rewarded video early close grants nothing
- ad unavailable degrades gracefully

### PvP
- two real devices quick match
- private room create/join
- share invite cold start
- share invite warm resume
- account display name cannot be spoofed
- all five skills
- disconnect/reconnect
- foreground/background
- result/rematch/new opponent
- W/L/D/rating persisted

### Commercial
- rewarded video on device
- interstitial only at natural break and respects cooldown
- banner never covers gameplay controls
- no forced ad flow
- no reward before full ad completion

### Retention/social
- sidebar support detection
- visible Home entry
- navigate to sidebar
- return from sidebar detected from latest onShow
- daily reward once
- ranking opens/writes
- result share works

### Performance
- 10-minute session
- no severe FPS degradation
- adaptive quality activates appropriately
- no runaway canvas/ad/audio/socket instances
- app resume after background works

## F. Platform review compliance

The RC checklist must explicitly verify:

- sidebar revisit is visible on Home and actually calls tt.navigateToScene.
- no user-customizable free text unless a sensitive-word path is added.
- ads are optional and not a prerequisite for normal gameplay.
- early-close rewarded ads do not grant rewards.
- release network requests use configured HTTPS/WSS legal domains.
- formal release build has domain checks enabled.

## G. Deployment runbook

Produce a concise operator runbook for deployment after secrets are configured:

1. merge approved RC code;
2. create local git bundle from reviewed commit;
3. SCP bundle to production server;
4. fast-forward /opt/doublefight from bundle;
5. preserve named account data volume;
6. set server env outside Git;
7. rebuild/up Docker;
8. install/reload reviewed Nginx config;
9. verify local/public health/readiness;
10. run public WSS quick/private/reconnect smoke;
11. run auth smoke with a real temporary Douyin login code only from the real client, never pasted into logs;
12. build/upload Douyin release package;
13. perform real-device matrix.

Do not auto-deploy in CI.

## H. Definition of done

Code-side RC hardening is complete when:

- typecheck/tests/browser build/Douyin dev/Douyin release/preflight all pass;
- server health/readiness and Docker/Nginx smoke pass;
- no secrets are in the release bundle;
- operator runbook exists;
- real-device checklist is ready.

Final **Douyin Full Product RC** is complete only after the operator/user supplies platform secrets/legal domains out of band and the real-device matrix passes.

## Code-side RC handoff

Run `npm run build:douyin:release` then `npm run preflight:douyin`. The preflight checks both source/output AppID, release `urlCheck=true`, HTTPS/WSS URLs, unique ad units, required assets and generated WAV files; it rejects server-only markers/values and obsolete probe prefixes without printing confidential contents. `npm run check:production-env` reports only validation booleans for provider variables, current/previous signing keys and release AppID equality. The running server's `/ready` also checks the container's actual data-directory write access; `/health` remains a guest-compatible liveness route.

Reviewed operator instructions: `docs/DOUYIN_RC_DEPLOYMENT.md`. Real-device PASS/FAIL matrix: `docs/DOUYIN_RC_DEVICE_ACCEPTANCE.md`. This branch prepares both; it does not perform the rollout or mark device rows PASS.

| Review item | Code-side evidence | Device/review acceptance |
| --- | --- | --- |
| Sidebar Home entry | Home labels the secondary entry “侧边栏福利”; `DouyinSocial.navigateSidebar()` calls `tt.navigateToScene({scene:'sidebar'})` and has a test. | Confirm visible and navigates on a supported account/device. |
| No unreviewed free nickname | Douyin guest name is fixed; authenticated name is the server account profile. Browser guest naming is unchanged. | Confirm no editable nickname surface. |
| Ads optional | Banner/interstitial are secondary surfaces; rewarded Solo refill is requested only by the player. | Observe no mandatory ad before normal play. |
| Rewarded early close | Native `isEnded:false` returns `skipped`; Solo claims only on `rewarded`. | Confirm no currency/skill grant on device after early close. |
| Release network | Product API is HTTPS, socket is WSS; preflight rejects insecure URLs. | Register and verify formal legal domains. |
| Formal domain check | Release source/output `setting.urlCheck=true`; development output `false` cannot be uploaded as release. | Verify uploaded IDE project is `dist-release`. |
