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
Self-targeted recovery. Clears low-value/random own tiles according to final balance rules.

### Petrify
Opponent-targeted pressure. Temporarily blocks a cell or otherwise reduces usable space.

### Shield
Self-targeted defense. Negates or mitigates the next hostile control effect.

Skills must amplify 2048 tension rather than replace the 2048 loop.

## Energy

The planned PvP economy is:

```text
better / higher merges
        ↓
more battle energy
        ↓
more skill opportunities
        ↓
pressure / recovery / counters
```

Skills should therefore reward strong core play, not operate as an unrelated timer.

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
