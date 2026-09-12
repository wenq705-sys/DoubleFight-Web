import { afterEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { DEFAULT_SKILL_LOADOUT, type BoardTile, type MatchSnapshot } from '../shared/index';
import { OnlineController } from '../src/battle/OnlineController';
import { predictPresentation, sameTiles, snapshotMove, type PresentationEvent } from '../src/battle/PresentationEvents';
import { BattleBoardView } from '../src/rendering/battle/BattleBoardView';
import { THEME_PRESENTATIONS } from '../src/rendering/themes/ThemePresentation';
import { fitTile, constrainTileMotion, MOTION_FOOTPRINT } from '../src/rendering/tiles/TileSizingPolicy';
import { ART } from '../src/config/artDirection';

const initial: BoardTile[] = [{ id: 1, value: 2, row: 0, col: 0 }, { id: 2, value: 2, row: 0, col: 1 }];
const views: BattleBoardView[] = [];
function view(events: PresentationEvent[] = []) {
  const board = new BattleBoardView('kingdom', 'board', undefined, event => events.push(event));
  views.push(board);
  return board;
}
function tick(board: BattleBoardView) { for (let i = 0; i < 80; i++) board.update(0.02); }
function snapshot(tiles = initial, sequence = 0): MatchSnapshot {
  return {
    matchId: 'match', roomCode: 'ABC123', phase: 'playing', serverTime: 100, roundStartedAt: 0,
    roundEndsAt: 180000, durationMs: 180000, winnerId: null, endReason: null, result: null,
    players: ['local', 'remote'].map(playerId => ({
      playerId, name: playerId, theme: 'kingdom', loadout: [...DEFAULT_SKILL_LOADOUT],
      connected: true, energy: 0, maxEnergy: 100,
      shieldActive: false, petrifyExpiresAt: 0,
      skillCooldowns: { random_clear: 0, shield: 0, petrify: 0, shuffle: 0, purify: 0 },
      lastSequence: sequence, lastSkillSequence: 0,
      board: { tiles: tiles.map(tile => ({ ...tile })), cells: [], blockedCells: [], score: sequence ? 4 : 0, highest: 4, canMove: true },
    })),
  };
}
afterEach(() => { views.splice(0).forEach(board => board.dispose()); vi.unstubAllGlobals(); });

describe('shared battle presentation', () => {
  it('recovers authoritative moves using shared rules and a separate server spawn', () => {
    const prediction = predictPresentation(initial, 'left');
    expect(prediction.result.merges).toHaveLength(1);
    expect(prediction.result.spawned).toBeNull();
    const spawned = { id: 3, value: 2, row: 3, col: 3 };
    const recovered = snapshotMove(initial, [...prediction.tiles, spawned], []);
    expect(recovered?.result.merges).toEqual(prediction.result.merges);
    expect(recovered?.result.spawned).toEqual(spawned);
    expect(snapshotMove(prediction.tiles, prediction.tiles, [])).toBeNull();
  });

  it('preserves in-flight prediction and emits merge/spawn once across repeated acknowledgements', async () => {
    const events: PresentationEvent[] = [], board = view(events);
    board.reset(initial);
    const predicted = predictPresentation(initial, 'left');
    const finished = board.present({ type: 'move', direction: 'left', result: predicted.result });
    board.update(0.02);
    const authoritative = [...predicted.tiles, { id: 3, value: 2, row: 3, col: 3 }];
    board.reconcile(authoritative);
    board.reconcile(authoritative);
    expect(events.map(event => event.type)).toEqual(['move']);
    tick(board);
    await finished;
    board.reconcile(authoritative);
    tick(board);
    expect(events.filter(event => event.type === 'merge')).toHaveLength(1);
    expect(events.filter(event => event.type === 'spawn')).toHaveLength(1);
    expect(sameTiles(board.snapshot(), authoritative)).toBe(true);
  });

  it('cancels pending animation on reset without resurrecting old tiles', async () => {
    const events: PresentationEvent[] = [], board = view(events);
    board.reset(initial);
    const finished = board.present({ type: 'move', direction: 'left', result: predictPresentation(initial, 'left').result });
    board.reset([]);
    await finished;
    tick(board);
    expect(board.snapshot()).toEqual([]);
    expect(events.filter(event => event.type === 'merge')).toHaveLength(0);
  });

  it('predicts before transport, replays pending state without replaying feedback, and resumes from reconnect', () => {
    const events: PresentationEvent[] = [], local = view(events), remote = view();
    const controller = new OnlineController(local, remote);
    controller.accept(snapshot(), 'local');
    expect(controller.move('left', () => {
      expect(events[0].type).toBe('move');
      expect(controller.predictedScore).toBe(4);
      return 1;
    })).toBe(true);
    expect(controller.move('down', () => 2)).toBe(true);
    const acknowledged = [...predictPresentation(initial, 'left').tiles, { id: 3, value: 2, row: 2, col: 3 }];
    controller.accept(snapshot(acknowledged, 1), 'local');
    expect(controller.pendingCount).toBe(1);
    expect(sameTiles(controller.predictedTiles(), predictPresentation(acknowledged, 'down').tiles)).toBe(true);
    tick(local);
    expect(events.filter(event => event.type === 'move')).toHaveLength(2);
    expect(events.filter(event => event.type === 'merge')).toHaveLength(1);
    controller.suspend();
    expect(controller.move('up', () => 3)).toBe(false);
    controller.accept(snapshot(acknowledged, 2), 'local');
    expect(controller.pendingCount).toBe(0);
    expect(sameTiles(controller.predictedTiles(), acknowledged)).toBe(true);
    expect(controller.move('down', () => 3)).toBe(true);
  });

  it('animates the opponent through the same view and deduplicates skill/status effects', () => {
    const localEvents: PresentationEvent[] = [], remoteEvents: PresentationEvent[] = [];
    const local = view(localEvents), remote = view(remoteEvents);
    const controller = new OnlineController(local, remote);
    controller.accept(snapshot(), 'local');
    const next = snapshot();
    next.players[1].board.tiles = [...predictPresentation(initial, 'left').tiles, { id: 3, value: 2, row: 3, col: 3 }];
    next.players[0].shieldActive = true;
    controller.accept(next, 'local');
    controller.accept(next, 'local');
    tick(remote);
    expect(remoteEvents.filter(event => event.type === 'merge')).toHaveLength(1);
    expect(localEvents.filter(event => event.type === 'status_apply')).toHaveLength(1);
    const skill = {
      sequence: 1,
      skillId: 'shield' as const,
      casterId: 'local',
      targetId: 'local',
      outcome: 'applied' as const,
      energySpent: 0,
      removedTiles: [],
      blockedCell: null,
      clearedBlockedCells: [],
      petrifyExpiresAt: 0,
    };
    controller.skill(skill, 'local'); controller.skill(skill, 'local');
    expect(localEvents.filter(event => event.type === 'skill_cast')).toHaveLength(1);
  });

  it('preserves readable tier growth and clamps horizontal footprint in both themes', () => {
    // Faces are decorative canvas textures; sizing exercises the real model geometry.
    vi.stubGlobal('document', { createElement: () => ({ getContext: () => null }) });
    for (const theme of Object.values(THEME_PRESENTATIONS)) {
      let lastHeight = 0;
      for (let value = 2; value <= 2048; value *= 2) {
        const authored = theme.factory.create(value);
        const authoredHeight = new THREE.Box3().setFromObject(authored.root).getSize(new THREE.Vector3()).y;
        const visual = fitTile(authored, value, theme.sizing);
        const bounds = new THREE.Box3().setFromObject(visual.root);
        const size = bounds.getSize(new THREE.Vector3());
        expect(size.y).toBeGreaterThanOrEqual(authoredHeight - 0.001);
        expect(size.y).toBeGreaterThan(lastHeight);
        lastHeight = size.y;
        expect(Math.max(size.x, size.z)).toBeGreaterThan(1.3);
        expect(Math.max(size.x, size.z)).toBeLessThanOrEqual(theme.sizing.horizontalLimit(value) + 0.001);
        for (const t of [0.08, 0.16, 0.3, 0.6, 1]) {
          visual.root.scale.set(1.34, 1.26, 1.34);
          visual.root.rotation.set(0.1 * Math.sin(t * Math.PI), 0.2 * Math.sin(t * Math.PI), 0);
          constrainTileMotion(visual.root);
          const moving = new THREE.Box3().setFromObject(visual.root).getSize(new THREE.Vector3());
          expect(Math.max(moving.x, moving.z)).toBeLessThanOrEqual(MOTION_FOOTPRINT + 0.001);
        }
      }
    }
  });

  it('does not shrink an authored model inside the footprint, and horizontal clamp never reduces height', () => {
    for (const width of [1.5, 3]) {
      const model = new THREE.Group();
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, 4, width));
      mesh.position.y = 2; model.add(mesh);
      const fitted = fitTile({ root: model, animatedParts: [] }, 2048);
      const size = new THREE.Box3().setFromObject(fitted.root).getSize(new THREE.Vector3());
      expect(size.y).toBe(4);
      expect(size.x).toBeCloseTo(Math.min(width, 1.94));
      expect(fitted.root.scale.toArray()).toEqual([1, 1, 1]);
    }
  });
});
