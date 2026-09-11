import { describe, expect, it } from 'vitest';
import { Board2048 } from '../shared/game/Board2048';
import { SeededRandom } from '../shared/game/SeededRandom';
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

    const move = room.move(host.id, 'left', 0);
    expect(move.player.id).toBe(host.id);
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
