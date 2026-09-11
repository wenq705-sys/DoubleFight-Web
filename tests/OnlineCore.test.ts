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
import { parseClientMessage } from '../shared/protocol/messages';
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
      type: 'move',
      direction: 'diagonal',
      sequence: 7,
    }))).toBeNull();

    expect(parseClientMessage('{broken')).toBeNull();
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
