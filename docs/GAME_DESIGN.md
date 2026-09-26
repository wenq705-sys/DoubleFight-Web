# Game Design

## Current release thesis

The first Douyin release of `双数对决 / Double Fight` is a **portrait 3D 2048 Solo collection-and-ascent game** built around tactile merges, short repeatable runs and visually distinct theme worlds.

First-release signature:

> **2048 clarity + 11-tier collectible ascent + swipe-to-world discovery + high-impact tactile feedback + five launch-quality themes.**

Online Duel remains a long-term product pillar and its authoritative implementation is retained, but it is deferred from the first release and must not appear in launch-facing navigation/rank/task surfaces while the M2.17 launch policy is disabled.

## First-release mode — Solo / Theme Islands

The player swipes between worlds on Home and enters a full-screen 3D 2048 run.

Each world carries:
- 11 readable, numberless tiers from 2 → 2048;
- explicit collection/discovery progress;
- high score and fastest 11/11 ascent records;
- stage moments at meaningful progression thresholds;
- danger/recovery feedback as the board fills or opens;
- a terminal 11/11 success celebration and explicit locked-board failure state.

Solo is not a stripped-down fallback for PvP. In M2.17 it is the complete launch product and all Home/meta/reward presentation should reinforce that loop.

## Deferred mode — Online Duel

Online Duel uses two separate devices and the authoritative game server. Its existing matchmaking, rooms, energy, skills, timer, results and reconnect architecture remain preserved for a later release. Do not expand or re-expose it during M2.17 unless the milestone changes.

## Network gameplay principle

2048 actions are compact commands:

`LEFT / RIGHT / UP / DOWN`

The server owns:
- authoritative board state
- spawn RNG
- score
- future energy/skill state
- win/loss

The client is responsible for responsive presentation and later uses prediction/reconciliation so network latency does not damage swipe feel.

## First PvP skill set

### Random Clear
Self-targeted recovery. Costs **35 energy**, has a **6s cooldown**, and removes two server-selected own tiles.

### Petrify
Opponent-targeted pressure. Costs **50 energy**, has an **8s cooldown**, and blocks one server-selected empty opponent cell for **6 seconds**. The blocked cell is a real movement/spawn barrier, not just a visual overlay.

### Shield
Self-targeted defense. Costs **45 energy**, has a **10s cooldown**, and remains active until it absorbs one hostile Petrify. The absorbed Petrify still spends the attacker's energy/cooldown.

Skills must amplify 2048 tension rather than replace the 2048 loop.

## Energy

The PvP economy is now implemented as server-authoritative competitive state:

```text
better / higher merges
        ↓
more battle energy
        ↓
more skill opportunities
        ↓
pressure / recovery / counters
```

Energy starts at **0** and caps at **100**.

Initial reward curve:

| Merge result | Energy |
| ---: | ---: |
| 4 | +2 |
| 8 | +3 |
| 16 | +4 |
| 32 | +6 |
| 64 | +8 |
| 128 | +11 |
| 256 | +15 |
| 512 | +20 |
| 1024 | +26 |
| 2048 | +34 |

Multiple merges in one swipe earn an additional deterministic combo bonus. This is deliberately based on one authoritative move result rather than wall-clock speed so latency cannot change the reward.

The browser may animate confirmed energy gain but never owns energy truth.

The first M2.3 skill set is implemented with the costs/cooldowns above. These values are tuning starting points, not final balance. Themes can replace the visual motif (for example an imperial seal versus a magic crystal) but cannot alter competitive behavior.

## Match rules

The first online ruleset is now implemented as a **180-second server-timed round**.

Immediate endings:
1. a player's board has no legal move → that player loses
2. Petrify removes the final legal space/move → the petrified player loses
3. a player leaves after reconnect grace → remaining player wins

If both survive to 180 seconds, the server compares:
1. **Score**
2. if tied, **highest tile**
3. if still tied, **usable empty cells**
4. if all are equal, **draw**

The timer never pauses for client backgrounding or a temporary disconnect. A reconnect resumes the same server deadline.

After a result, both players can opt into **再来一局** in the same private room. A rematch is a fresh competitive state but preserves players, themes and room code.

The 180-second duration and all balance numbers remain subject to real-device playtesting.

## Theme strategy

Themes change:
- pieces/characters/buildings
- environment
- merge motif
- skill presentation
- UI accent
- legendary 2048 celebration

Themes do **not** change competitive rules or base skill balance.

First-release themes:
- 微缩王国 / Miniature Kingdom
- 后宫晋升 / Palace Rank
- 生肖战神 / Zodiac Ascension — combat-power chain: 灵鼠 → 斗鸡 → 岩羊 → 灵猴 → 战犬 → 山猪 → 玄蛇 → 烈马 → 神牛 → 白虎 → 东方神龙; Rabbit is the environment mascot.
- 甜蜜星球 / Candy Planet
- 梦想家园 / Dream Home

All five use the same 11/11 Solo rules. 微缩王国 is the free onboarding world; the remaining four are permanent progression unlocks via 星币 or cumulative rewarded-video progress. Current procedural low-poly pieces are production-safe launch assets; individual hero themes can later migrate to authored stylized GLB assets without changing Board2048 or progression contracts.
