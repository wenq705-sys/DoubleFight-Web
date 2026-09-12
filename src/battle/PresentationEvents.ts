import { predictMoveTiles, type BoardTile, type CellPosition, type Direction, type MoveResult, type SkillId } from '../../shared/index';

/** Browser presentation data only. It never owns random spawns or competitive state. */
export type PresentationEvent =
  | { type: 'move'; direction: Direction; result: MoveResult }
  | { type: 'merge'; value: number; at: CellPosition }
  | { type: 'spawn'; tile: BoardTile }
  | { type: 'skill_cast'; skill: SkillId }
  | { type: 'skill_hit'; skill: SkillId; removed?: readonly BoardTile[]; cell?: CellPosition }
  | { type: 'status_apply' | 'status_remove'; status: 'shield' | 'petrify'; cell?: CellPosition };

export function sameTiles(a: readonly BoardTile[], b: readonly BoardTile[]): boolean {
  if (a.length !== b.length) return false;
  const index = new Map(b.map(tile => [tile.id, tile]));
  return a.every(tile => {
    const other = index.get(tile.id);
    return other?.value === tile.value && other.row === tile.row && other.col === tile.col;
  });
}

export function predictPresentation(tiles: readonly BoardTile[], direction: Direction, blocked: readonly CellPosition[] = []) {
  const predicted = predictMoveTiles(tiles, direction, blocked);
  const merges: MoveResult['merges'] = [];
  for (const consumed of predicted.motions.filter(motion => motion.consumed)) {
    const survivor = predicted.motions.find(motion => !motion.consumed && motion.to.row === consumed.to.row && motion.to.col === consumed.to.col);
    if (survivor) merges.push({ survivorId: survivor.id, consumedId: consumed.id, value: consumed.value * 2, at: consumed.to });
  }
  return { tiles: predicted.tiles, result: { ...predicted, merges, spawned: null, gameOver: false } satisfies MoveResult };
}

/** Recover a single observable authoritative move; skipped snapshots use quiet interpolation. */
export function snapshotMove(before: readonly BoardTile[], after: readonly BoardTile[], blocked: readonly CellPosition[]) {
  const oldIds = new Set(before.map(tile => tile.id));
  const survivors = after.filter(tile => oldIds.has(tile.id));
  const added = after.filter(tile => !oldIds.has(tile.id));
  if (added.length > 1 || !before.length) return null;
  for (const direction of ['left', 'right', 'up', 'down'] as const) {
    const prediction = predictPresentation(before, direction, blocked);
    if (prediction.result.changed && sameTiles(prediction.tiles, survivors)) {
      return { type: 'move' as const, direction, result: { ...prediction.result, spawned: added[0] ?? null } };
    }
  }
  return null;
}
