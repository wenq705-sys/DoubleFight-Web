# Game Design

## Product thesis

`双数对决 / Double Fight` is a **3D 2048 online skill-duel game** designed for portrait mobile play, short sessions and continuously expandable visual themes.

Long-term signature:

> **2048 clarity + real-time two-device competition + spectacular skill interaction + independent 3D themes.**

## Modes

### Solo / Theme Islands

The default product shell is the Theme Islands home. The player selects a world and plays a full-screen premium 3D 2048 session.

Solo mode carries:
- theme discovery
- high score / highest tier
- visual progression
- future unlocks / collections / challenges

### Online Duel

Two players use **two separate devices** and connect through the authoritative game server.

Each player:
- chooses their own visual theme independently,
- controls only their own 4×4 board,
- sees both their own board and the opponent state,
- earns combat resources from strong 2048 play,
- sends skills across the duel.

A Palace player can fight a Kingdom player. Themes are visual/content presentation; they must not create balance differences.

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

## Match direction

Initial tuning target: approximately 2–3 minute rounds.

Win hierarchy is expected to use:
1. board lock / inability to move,
2. score at time limit,
3. highest tier,
4. remaining free space,
5. draw only if all tie breakers remain equal.

Exact numbers remain subject to playtesting.

## Theme strategy

Themes change:
- pieces/characters/buildings
- environment
- merge motif
- skill presentation
- UI accent
- legendary 2048 celebration

Themes do **not** change competitive rules or base skill balance.

Current themes:
- Miniature Kingdom
- 后宫晋升 / Palace Rank

Core pieces will gradually migrate from procedural blockouts to authored stylized low-poly GLB assets.
