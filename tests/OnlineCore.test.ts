import { describe, expect, it } from 'vitest';
import { Board2048 } from '../shared/game/Board2048';
import { SeededRandom } from '../shared/game/SeededRandom';
import { predictMoveTiles } from '../shared/game/predictMove';
import {
  MAX_BATTLE_ENERGY,
  clampBattleEnergy,
  comboBonusForMergeCount,
  energyForMergeValue,
  energyForMerges,
} from '../shared/battle/energy';
import {
  MATCH_DURATION_MS,
  resolveTimeLimitStandings,
} from '../shared/battle/match';
import { parseClientMessage } from '../shared/protocol/messages';
import type { ServerMessage } from '../shared/protocol/messages';
import { MatchmakingQueue } from '../server/MatchmakingQueue';
import { RoomManager } from '../server/RoomManager';
import { RoomSession } from '../server/RoomSession';

describe('shared online game core', () => {
  it('produces identical boards from the same deterministic seed', () => {
    const a = new Board2048(new SeededRandom(123456));
    const b = new Board2048(new SeededRandom(123456));

    a.reset();
    b.reset();

    expect(a.snapshot()).toEqual(b.snapshot());

    for (const direction of ['left', 'up', 'right', 'down'] as const) {
      a.move(direction);
      b.move(direction);
      expect(a.publicState()).toEqual(b.publicState());
    }
  });

  it('predicts movement immediately without inventing a server spawn', () => {
    const tiles = [
      { id: 1, value: 2, row: 0, col: 0 },
      { id: 2, value: 2, row: 0, col: 1 },
      { id: 3, value: 8, row: 1, col: 3 },
    ];

    const prediction = predictMoveTiles(tiles, 'left');
    expect(prediction.changed).toBe(true);
    expect(prediction.scoreDelta).toBe(4);
    expect(prediction.tiles).toEqual([
      { id: 1, value: 4, row: 0, col: 0 },
      { id: 3, value: 8, row: 1, col: 0 },
    ]);
    expect(prediction.tiles.some((tile) => tile.id > 3)).toBe(false);
  });

  it('treats petrified cells as real movement barriers in server and prediction logic', () => {
    const board = new Board2048(() => 0);
    board.load([
      [2, 0, 0, 4],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
    ]);
    board.setBlockedCells([{ row: 0, col: 1 }]);

    const before = board.publicState();
    expect(before.blockedCells).toEqual([{ row: 0, col: 1 }]);

    const predicted = predictMoveTiles(before.tiles, 'left', before.blockedCells);
    expect(predicted.tiles.find((tile) => tile.value === 4)).toMatchObject({ row: 0, col: 2 });

    const result = board.move('left');
    expect(result.changed).toBe(true);
    expect(board.publicState().tiles.find((tile) => tile.value === 4)).toMatchObject({ row: 0, col: 2 });
    expect(board.publicState().tiles.some((tile) => tile.row === 0 && tile.col === 1)).toBe(false);
  });

  it('exposes stable tile ids in authoritative public snapshots', () => {
    const board = new Board2048(new SeededRandom(42));
    board.reset();
    const state = board.publicState();
    expect(state.tiles).toHaveLength(2);
    expect(state.tiles.map((tile) => tile.id)).toEqual([1, 2]);
    expect(state.cells.flat().filter(Boolean)).toHaveLength(2);
  });

  it('rewards stronger merges and multi-merge planning with more battle energy', () => {
    expect(energyForMergeValue(4)).toBe(2);
    expect(energyForMergeValue(64)).toBe(8);
    expect(energyForMergeValue(512)).toBe(20);
    expect(energyForMergeValue(2048)).toBe(34);
    expect(comboBonusForMergeCount(1)).toBe(0);
    expect(comboBonusForMergeCount(2)).toBe(2);
    expect(comboBonusForMergeCount(4)).toBe(9);

    const breakdown = energyForMerges([
      { survivorId: 1, consumedId: 2, value: 4, at: { row: 0, col: 0 } },
      { survivorId: 3, consumedId: 4, value: 8, at: { row: 0, col: 1 } },
    ]);
    expect(breakdown).toEqual({ mergeEnergy: 5, comboBonus: 2, total: 7 });
    expect(clampBattleEnergy(999)).toBe(MAX_BATTLE_ENERGY);
  });

  it('parses only known versioned protocol messages', () => {
    expect(parseClientMessage(JSON.stringify({
      type: 'move',
      direction: 'left',
      sequence: 7,
    }))).toEqual({ type: 'move', direction: 'left', sequence: 7 });

    expect(parseClientMessage(JSON.stringify({
      type: 'cast_skill',
      skillId: 'petrify',
      sequence: 3,
    }))).toEqual({ type: 'cast_skill', skillId: 'petrify', sequence: 3 });

    expect(parseClientMessage(JSON.stringify({
      type: 'set_rematch_ready',
      ready: true,
    }))).toEqual({ type: 'set_rematch_ready', ready: true });

    expect(parseClientMessage(JSON.stringify({
      type: 'join_matchmaking',
      playerName: 'A',
      theme: 'palace',
    }))).toEqual({ type: 'join_matchmaking', playerName: 'A', theme: 'palace' });

    expect(parseClientMessage(JSON.stringify({
      type: 'cancel_matchmaking',
    }))).toEqual({ type: 'cancel_matchmaking' });

    expect(parseClientMessage(JSON.stringify({
      type: 'move',
      direction: 'diagonal',
      sequence: 7,
    }))).toBeNull();

    expect(parseClientMessage(JSON.stringify({
      type: 'cast_skill',
      skillId: 'teleport',
      sequence: 3,
    }))).toBeNull();

    expect(parseClientMessage('{broken')).toBeNull();
  });

  it('keeps public matchmaking FIFO and removes cancelled connections cleanly', () => {
    const queue = new MatchmakingQueue();
    queue.enqueue({ connectionId: 'a', playerName: 'A', theme: 'kingdom', joinedAt: 1 });
    queue.enqueue({ connectionId: 'b', playerName: 'B', theme: 'palace', joinedAt: 2 });
    queue.enqueue({ connectionId: 'c', playerName: 'C', theme: 'kingdom', joinedAt: 3 });

    expect(queue.size).toBe(3);
    expect(queue.remove('b')?.playerName).toBe('B');
    expect(queue.snapshot().map((entry) => entry.connectionId)).toEqual(['a', 'c']);
    expect(queue.takePair()?.map((entry) => entry.connectionId)).toEqual(['a', 'c']);
    expect(queue.size).toBe(0);
  });

  it('pairs two queued clients into the normal authoritative RoomSession and auto-starts', () => {
    const manager = new RoomManager();
    const aMessages: ServerMessage[] = [];
    const bMessages: ServerMessage[] = [];
    const a = manager.register((message) => aMessages.push(message));
    const b = manager.register((message) => bMessages.push(message));

    manager.handle(a.id, {
      type: 'join_matchmaking',
      playerName: 'King',
      theme: 'kingdom',
    });
    expect(manager.stats().queued).toBe(1);
    expect(aMessages.some((message) =>
      message.type === 'matchmaking_state' && message.state.status === 'searching'
    )).toBe(true);

    manager.handle(b.id, {
      type: 'join_matchmaking',
      playerName: 'Palace',
      theme: 'palace',
    });

    expect(manager.stats().queued).toBe(0);
    expect(manager.stats().rooms).toBe(1);
    expect(manager.stats().playing).toBe(1);

    const aJoined = aMessages.find((message) => message.type === 'room_joined');
    const bJoined = bMessages.find((message) => message.type === 'room_joined');
    expect(aJoined?.type).toBe('room_joined');
    expect(bJoined?.type).toBe('room_joined');
    if (aJoined?.type !== 'room_joined' || bJoined?.type !== 'room_joined') {
      throw new Error('Expected both clients to join a matched room.');
    }
    expect(aJoined.room.code).toBe(bJoined.room.code);

    const aStart = aMessages.find((message) => message.type === 'match_start');
    const bStart = bMessages.find((message) => message.type === 'match_start');
    expect(aStart?.type).toBe('match_start');
    expect(bStart?.type).toBe('match_start');
    if (aStart?.type !== 'match_start') throw new Error('Expected auto-started match.');

    expect(aStart.snapshot.players.map((player) => player.theme).sort()).toEqual(['kingdom', 'palace']);
    expect(aStart.snapshot.durationMs).toBe(MATCH_DURATION_MS);
  });

  it('lets a queued player cancel without creating a room', () => {
    const manager = new RoomManager();
    const messages: ServerMessage[] = [];
    const connection = manager.register((message) => messages.push(message));

    manager.handle(connection.id, {
      type: 'join_matchmaking',
      playerName: 'Solo',
      theme: 'kingdom',
    });
    expect(manager.stats().queued).toBe(1);

    manager.handle(connection.id, { type: 'cancel_matchmaking' });
    expect(manager.stats().queued).toBe(0);
    expect(manager.stats().rooms).toBe(0);
    expect(messages.some((message) =>
      message.type === 'matchmaking_state' && message.state.status === 'idle'
    )).toBe(true);
  });

  it('resolves the time limit by score, highest tile, usable space, then draw', () => {
    expect(resolveTimeLimitStandings(
      { playerId: 'a', score: 120, highest: 32, usableEmptyCells: 2 },
      { playerId: 'b', score: 100, highest: 64, usableEmptyCells: 8 },
    )).toEqual({ winnerId: 'a', tieBreaker: 'score' });

    expect(resolveTimeLimitStandings(
      { playerId: 'a', score: 100, highest: 128, usableEmptyCells: 2 },
      { playerId: 'b', score: 100, highest: 64, usableEmptyCells: 8 },
    )).toEqual({ winnerId: 'a', tieBreaker: 'highest' });

    expect(resolveTimeLimitStandings(
      { playerId: 'a', score: 100, highest: 64, usableEmptyCells: 5 },
      { playerId: 'b', score: 100, highest: 64, usableEmptyCells: 3 },
    )).toEqual({ winnerId: 'a', tieBreaker: 'usable_space' });

    expect(resolveTimeLimitStandings(
      { playerId: 'a', score: 100, highest: 64, usableEmptyCells: 3 },
      { playerId: 'b', score: 100, highest: 64, usableEmptyCells: 3 },
    )).toEqual({ winnerId: null, tieBreaker: 'draw' });
  });

  it('starts an authoritative room only when both players are ready', () => {
    const sent: Array<{ connectionId: string; type: string }> = [];
    const room = new RoomSession('123456', (connectionId, message) => {
      sent.push({ connectionId, type: message.type });
    });

    const host = room.addPlayer('connection-a', 'A', 'kingdom');
    const guest = room.addPlayer('connection-b', 'B', 'palace');

    expect(room.state().players.find((player) => player.id === host.id)?.isHost).toBe(true);
    expect(room.state().players.find((player) => player.id === guest.id)?.isHost).toBe(false);
    expect(room.setReady(host.id, true)).toBe(false);
    expect(room.setReady(guest.id, true)).toBe(true);
    expect(room.phase).toBe('playing');

    const snapshot = room.matchSnapshot();
    expect(snapshot.players).toHaveLength(2);
    expect(snapshot.players[0].board.cells).toHaveLength(4);
    expect(snapshot.players[1].board.cells).toHaveLength(4);
    expect(snapshot.players.map((player) => player.theme)).toEqual(['kingdom', 'palace']);

    host.board!.load([
      [2, 2, 4, 4],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
    ]);
    const move = room.move(host.id, 'left', 0);
    expect(move.player.id).toBe(host.id);
    expect(move.energyGain).toBe(7);
    expect(host.energy).toBe(7);
    expect(room.matchSnapshot().players.find((player) => player.playerId === host.id)?.energy).toBe(7);
    expect(room.matchSnapshot().players.find((player) => player.playerId === host.id)?.maxEnergy).toBe(100);
    expect(() => room.move(host.id, 'left', 0)).toThrow('STALE_SEQUENCE');
    expect(sent).toEqual([]);
  });

  it('spends server energy for clear, shield and petrify and lets shield absorb the attack', () => {
    const room = new RoomSession('777777', () => undefined);
    const host = room.addPlayer('connection-a', 'A', 'kingdom');
    const guest = room.addPlayer('connection-b', 'B', 'palace');
    room.setReady(host.id, true);
    room.setReady(guest.id, true);

    host.energy = 100;
    guest.energy = 100;
    host.board!.load([
      [2, 4, 8, 16],
      [32, 64, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
    ]);
    guest.board!.load([
      [2, 4, 8, 16],
      [32, 64, 128, 256],
      [2, 4, 8, 16],
      [0, 0, 0, 0],
    ]);

    const now = Date.now();
    const clear = room.castSkill(host.id, 'random_clear', 0, now);
    expect(clear.event.removedTiles).toHaveLength(2);
    expect(host.energy).toBe(65);
    expect(host.skillCooldowns.random_clear).toBe(now + 6_000);
    expect(() => room.castSkill(host.id, 'random_clear', 0, now + 1)).toThrow('STALE_SKILL_SEQUENCE');

    const shield = room.castSkill(guest.id, 'shield', 0, now);
    expect(shield.event.outcome).toBe('applied');
    expect(guest.shieldActive).toBe(true);
    expect(guest.energy).toBe(55);

    const blocked = room.castSkill(host.id, 'petrify', 1, now + 1);
    expect(blocked.event.outcome).toBe('shielded');
    expect(guest.shieldActive).toBe(false);
    expect(guest.board!.blockedCells()).toEqual([]);
    expect(host.energy).toBe(15);
  });

  it('petrifies an empty cell temporarily and restores it after server expiry', () => {
    const room = new RoomSession('888888', () => undefined);
    const host = room.addPlayer('connection-a', 'A', 'kingdom');
    const guest = room.addPlayer('connection-b', 'B', 'palace');
    room.setReady(host.id, true);
    room.setReady(guest.id, true);

    host.energy = 100;
    guest.board!.load([
      [2, 4, 8, 16],
      [32, 64, 128, 256],
      [2, 4, 8, 16],
      [32, 64, 0, 0],
    ]);

    const now = Date.now();
    const cast = room.castSkill(host.id, 'petrify', 0, now);
    expect(cast.event.outcome).toBe('applied');
    expect(cast.event.blockedCell).not.toBeNull();
    expect(cast.timedEffectExpiresAt).toBe(now + 6_000);
    expect(guest.board!.blockedCells()).toHaveLength(1);
    expect(room.matchSnapshot(now + 1).players.find((player) => player.playerId === guest.id)?.petrifyExpiresAt)
      .toBe(now + 6_000);

    expect(room.expireTimedEffects(now + 6_001)).toBe(true);
    expect(guest.board!.blockedCells()).toEqual([]);
    expect(guest.petrifyExpiresAt).toBe(0);
  });

  it('rejects skills when energy is insufficient or a shield is already active', () => {
    const room = new RoomSession('999999', () => undefined);
    const host = room.addPlayer('connection-a', 'A', 'kingdom');
    const guest = room.addPlayer('connection-b', 'B', 'palace');
    room.setReady(host.id, true);
    room.setReady(guest.id, true);

    expect(() => room.castSkill(host.id, 'petrify', 0)).toThrow('INSUFFICIENT_ENERGY');

    host.energy = 100;
    room.castSkill(host.id, 'shield', 0);
    host.energy = 100;
    expect(() => room.castSkill(host.id, 'shield', 1)).toThrow('SKILL_ALREADY_ACTIVE');
  });

  it('keeps one authoritative 180-second deadline and resolves it on the server', () => {
    const room = new RoomSession('222222', () => undefined);
    const host = room.addPlayer('connection-a', 'A', 'kingdom');
    const guest = room.addPlayer('connection-b', 'B', 'palace');
    const startedAt = 10_000;

    expect(room.setReady(host.id, true, startedAt)).toBe(false);
    expect(room.setReady(guest.id, true, startedAt)).toBe(true);

    const matchId = room.matchId;
    expect(room.roundStartedAt).toBe(startedAt);
    expect(room.roundEndsAt).toBe(startedAt + MATCH_DURATION_MS);
    expect(room.matchSnapshot(startedAt + 50_000).roundEndsAt).toBe(startedAt + MATCH_DURATION_MS);

    host.board!.load([
      [64, 32, 16, 8],
      [4, 2, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
    ], 500);
    guest.board!.load([
      [128, 64, 32, 16],
      [8, 4, 2, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
    ], 450);

    expect(room.resolveTimeLimit(room.roundEndsAt - 1)).toBe(false);
    expect(room.phase).toBe('playing');
    expect(room.resolveTimeLimit(room.roundEndsAt)).toBe(true);
    expect(room.phase).toBe('finished');
    expect(room.matchId).toBe(matchId);
    expect(room.winnerId).toBe(host.id);

    const result = room.matchSnapshot(room.roundEndsAt).result;
    expect(result?.reason).toBe('time_limit');
    expect(result?.tieBreaker).toBe('score');
    expect(result?.winnerId).toBe(host.id);
    expect(result?.finishedAt).toBe(startedAt + MATCH_DURATION_MS);
    expect(result?.players).toHaveLength(2);
  });

  it('starts a fresh authoritative match only after both players request a rematch', () => {
    const room = new RoomSession('333333', () => undefined);
    const host = room.addPlayer('connection-a', 'A', 'kingdom');
    const guest = room.addPlayer('connection-b', 'B', 'palace');
    const startedAt = 20_000;

    room.setReady(host.id, true, startedAt);
    room.setReady(guest.id, true, startedAt);
    const previousMatchId = room.matchId;

    host.board!.load([
      [64, 32, 16, 8],
      [4, 2, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
    ], 300);
    guest.board!.load([
      [32, 16, 8, 4],
      [2, 0, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
    ], 200);

    room.resolveTimeLimit(room.roundEndsAt);
    host.energy = 99;
    guest.energy = 88;

    expect(room.setRematchReady(host.id, true, 500_000)).toBe(false);
    expect(room.state().players.find((player) => player.id === host.id)?.rematchReady).toBe(true);
    expect(room.setRematchReady(guest.id, true, 500_000)).toBe(true);

    expect(room.phase).toBe('playing');
    expect(room.matchId).not.toBe(previousMatchId);
    expect(room.roundStartedAt).toBe(500_000);
    expect(room.roundEndsAt).toBe(500_000 + MATCH_DURATION_MS);
    expect(room.result).toBeNull();
    expect(host.energy).toBe(0);
    expect(guest.energy).toBe(0);
    expect(room.state().players.every((player) => !player.rematchReady)).toBe(true);
    expect(room.matchSnapshot(500_000).players.every((player) => player.board.tiles.length === 2)).toBe(true);
  });

  it('preserves a player identity across reconnect', () => {
    const room = new RoomSession('654321', () => undefined);
    const player = room.addPlayer('first-connection', '玩家', 'palace');
    room.disconnect(player.id);

    const reconnected = room.reconnect('second-connection', player.reconnectToken);
    expect(reconnected?.id).toBe(player.id);
    expect(reconnected?.connected).toBe(true);
    expect(reconnected?.connectionId).toBe('second-connection');
  });
});
