# Double Fight — Douyin Full Product RC

## Final product goal

The Douyin Mini Game build must provide the complete Double Fight product experience currently available on GitHub Pages, with a Douyin-native presentation layer and the platform capabilities required for a release candidate.

This is not a runtime demo. Completion means a player can launch the Douyin build, enter the real home screen, play Solo, enter PvP, match/join private rooms, use skills, reconnect, finish/rematch, and use the required account/commercial/social platform features.

## Product principles

1. **One game core**
   - Browser and Douyin share Board2048, battle controllers, Protocol v6, skills, energy, matchmaking rules, tile/theme presentation, and server authority.
   - Platform-specific code is presentation/runtime integration only.

2. **Douyin-native UI**
   - Do not port DOM/CSS with a browser shim.
   - Build the Douyin presentation with the on-screen WebGL canvas plus offscreen Canvas2D textures.
   - Respect safe area and the host menu capsule.
   - Target a premium toy-diorama / competitive mobile-game visual language.

3. **3D world is the visual hero**
   - Large, readable theme diorama.
   - UI is compact, high-contrast, premium and motion-aware.
   - Avoid developer/debug aesthetics, generic white cards, dense copy, and tiny controls.

4. **Release-safe platform integration**
   - Development-only domain bypass must never become the release configuration.
   - Secrets remain server-side.
   - Ads must never create PvP pay-to-win behavior.

## Internal delivery sequence

The project may use several PRs internally, but product acceptance is one final RC target.

### Phase A — Product shell / Solo parity
- Replace runtime probe with production BattleBoardView.
- Kingdom + Palace full environments.
- Production tile sizing, spawn, move, merge, VFX and camera feedback.
- Premium Solo HUD.
- Theme switching.
- Solo skill interaction.
- Safe area + host capsule avoidance.
- Browser and Douyin builds in CI.

### Phase B — Douyin Home + navigation
- Boot/loading presentation.
- Premium animated home screen.
- Theme hero preview.
- Solo CTA.
- Online/PvP CTA.
- Ranking, daily/side-panel reward, settings as secondary actions.
- First-session onboarding.
- Product routing/state machine without DOM.

### Phase C — Full PvP parity
- Online lobby.
- Quick match.
- Private room create/join.
- Skill loadout.
- Duel HUD.
- Local + opponent BattleBoardView.
- Energy/status/skill presentation.
- Exit confirmation.
- Result/rematch/new-opponent flows.
- Reconnect/resume acceptance.
- All existing Protocol v6 semantics unchanged.

### Phase D — Production account
- tt.login client bootstrap.
- Double Fight auth endpoint.
- Server-side code-to-session exchange.
- Internal userId + signed session token.
- No AppSecret/session_key in client or Git.
- Player persistence for scores, PvP record, settings and reward state.
- Browser remains anonymous/local where appropriate.

### Phase E — Commercialization
- Rewarded video:
  - optional out-of-match rewards only;
  - full-play success before reward grant;
  - idempotent reward redemption;
  - cancel/no-fill/error degrade safely.
- Interstitial:
  - natural breaks only;
  - explicit frequency/cooldown control;
  - never during active play or matchmaking transition.
- Banner:
  - non-gameplay surfaces only;
  - avoid controls/hot zones;
  - respond to host ad resize;
  - show/hide/destroy lifecycle.
- Ad unit IDs come from release configuration, not scattered literals.

### Phase F — Social / retention
- Active share.
- Private-room deep-link invite.
- Launch-query room routing.
- Side-panel/return capability and reward flow.
- Ranking integration.
- Daily/return reward state.
- Share/result card presentation.

### Phase G — Settings / polish / retention
- Sound and haptic settings.
- First-session tutorial.
- Reduced/noisy feedback handling.
- Loading/prewarm strategy.
- Device quality scaling.
- Visual/motion polish for Home, Solo, PvP and Result.

### Phase H — RC / submission hardening
- Release project config with network checks enabled.
- Production socket/API legal domains.
- iPhone and Android acceptance.
- Login/auth failure cases.
- Background/foreground.
- Weak network/reconnect.
- Rewarded ad complete/cancel/no-fill.
- Interstitial frequency.
- Banner layout.
- Share/deep-link.
- Side-panel return.
- Ranking.
- developer-tool preflight/review checks.
- Browser regression remains green.

## Required platform API surface

### Runtime
- createCanvas / offscreen canvas
- system/window/safe-area information
- menu-button layout
- onShow / onHide
- storage
- vibration
- WebSocket
- launch/show options

### Account
- login/check-session boundary
- server code exchange
- Double Fight session token

### Commercial
- rewarded video
- interstitial
- banner

### Social / retention
- active share / passive share hooks where applicable
- launch query / deep-link routing
- side-panel/return scene capability
- ranking APIs supported by the selected product design

## UI quality bar

### Home
- Full-screen animated 3D theme world.
- Strong Double Fight brand hierarchy.
- Primary CTA: Solo / Online.
- Theme switching is visual, not form-like.
- Secondary actions use icon-first navigation.
- No dense paragraphs.

### Solo
- Board/world dominates the screen.
- Score/highest are immediately readable.
- Thumb-zone skill controls.
- Strong merge/skill feedback.
- Minimal permanent tutorial text.

### PvP
- Competitive top HUD.
- Tactical opponent board.
- Large local board.
- Compact energy/skill dock.
- Clear network state only when degraded.
- No room/debug information during active play.

### Result
- Victory/defeat presentation with real end reason.
- Large score comparison.
- Contextual rematch/new-opponent/back CTA.
- Reward/ad opportunity is optional and secondary to the result.

## Definition of done

### Browser
- Home ✅
- Solo ✅
- PvP quick/private/reconnect ✅
- Themes/skills/result ✅
- no regression from Douyin work

### Douyin
- real Home
- real Solo
- real PvP
- Kingdom + Palace
- account/session
- persistence
- rewarded/interstitial/banner ads
- share/private-room deep link
- side-panel return
- ranking
- safe-area/menu-capsule compliance
- lifecycle/reconnect
- release build with formal domain checks

Only when the above is accepted on real devices should the milestone be called **Douyin Full Product RC**.
