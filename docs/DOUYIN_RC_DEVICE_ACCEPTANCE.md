# Douyin RC real-device PASS/FAIL matrix

Use a release build with legal domains and production services. Test on at least one iPhone and one Android phone; PvP uses two separate real devices. For every row mark **PASS** or **FAIL**, device/build, date and a screenshot or redacted observation. Leave it **PENDING** until actually exercised. Do not record login codes, bearer/reconnect tokens, provider IDs or secrets. A FAIL blocks final RC acceptance.

| ID | Action and PASS condition | Result | Evidence |
| --- | --- | --- | --- |
| A01 | Cold launch: Home appears, no crash or probe/debug UI. | PENDING / PASS / FAIL | |
| A02 | Warm launch/resume: same screen and controls work once. | PENDING / PASS / FAIL | |
| A03 | Login: account state appears without a login wall; restart restores the same Double Fight account. | PENDING / PASS / FAIL | |
| A04 | Offline auth: Home/Solo remain playable; network return restores account and connection. | PENDING / PASS / FAIL | |
| H01 | Home Kingdom renders a readable world and CTA. | PENDING / PASS / FAIL | |
| H02 | Home Palace renders a readable world and CTA. | PENDING / PASS / FAIL | |
| H03 | Host capsule and top/bottom safe areas do not cover buttons on iPhone/Android portrait. | PENDING / PASS / FAIL | |
| S01 | Solo in both themes: swipe, move, merge, spawn, score and clear skill work. | PENDING / PASS / FAIL | |
| S02 | Solo audio/haptics settings work; best/highest survive restart. | PENDING / PASS / FAIL | |
| S03 | Clear local cache, log in again: higher server best/highest return. | PENDING / PASS / FAIL | |
| C01 | Rewarded complete: native full-play callback grants exactly once. | PENDING / PASS / FAIL | |
| C02 | Rewarded early close/cancel: no reward is granted. | PENDING / PASS / FAIL | |
| C03 | Rewarded no-fill/error: normal Solo play remains available. | PENDING / PASS / FAIL | |
| C04 | Banner appears only on non-gameplay surface, resizes and never covers controls. | PENDING / PASS / FAIL | |
| C05 | Interstitial appears only after a natural break, respects 30s startup and 60s cooldown, never gates play. | PENDING / PASS / FAIL | |
| P01 | Two real devices quick-match into the same authoritative round. | PENDING / PASS / FAIL | |
| P02 | Create/join a private six-digit room; both devices start. | PENDING / PASS / FAIL | |
| P03 | Cold share invite opens the correct private room. | PENDING / PASS / FAIL | |
| P04 | Warm share invite resumes into the correct room. | PENDING / PASS / FAIL | |
| P05 | All five PvP skills work with correct server energy/status feedback. | PENDING / PASS / FAIL | |
| P06 | Background/foreground repeatedly: one live render/input/socket flow, no black screen. | PENDING / PASS / FAIL | |
| P07 | Weak network, disconnect and Wi-Fi→5G return: reconnect restores board/room/deadline. | PENDING / PASS / FAIL | |
| P08 | Result shows actual reason; rematch creates a fresh round; return/new opponent works. | PENDING / PASS / FAIL | |
| P09 | Account display name comes from server; free client name cannot spoof it. | PENDING / PASS / FAIL | |
| P10 | Finish win/loss/draw: W/L/D and rating persist after restart; one match counts once, rematch counts again. | PENDING / PASS / FAIL | |
| R01 | Visible Home sidebar entry calls navigation on a supported device. | PENDING / PASS / FAIL | |
| R02 | Sidebar return is detected and daily reward grants only once. | PENDING / PASS / FAIL | |
| R03 | Solo rank writes/opens; result share opens native share flow. | PENDING / PASS / FAIL | |
| Q01 | Ten-minute Solo/PvP soak: no severe FPS decline or runaway canvas/ad/audio/socket count. | PENDING / PASS / FAIL | |
| Q02 | Adaptive quality responds under load and background resume remains smooth. | PENDING / PASS / FAIL | |

Review compliance: record PASS/FAIL after verifying the Home sidebar entry and actual `tt.navigateToScene`, no freely editable nickname, optional ads, zero reward after early close, HTTPS/WSS legal domains, and release `setting.urlCheck=true`. Code-side tests establish the callback and packaging logic; the device rows require observation.
