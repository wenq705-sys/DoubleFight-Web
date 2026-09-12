import type { BoardTile, CellPosition, Direction } from './types';

const SIZE = 4;

export interface PredictedMotion {
  id: number;
  value: number;
  from: CellPosition;
  to: CellPosition;
  consumed: boolean;
}

export interface PredictedMove {
  changed: boolean;
  tiles: BoardTile[];
  motions: PredictedMotion[];
  scoreDelta: number;
}

/**
 * Client-side latency hiding only.
 *
 * Computes movement/merge positions without spawning a new tile. Petrified/blocked
 * cells split a movement line into independent segments exactly like the shared board.
 */
export function predictMoveTiles(
  inputTiles: readonly BoardTile[],
  direction: Direction,
  blockedCells: readonly CellPosition[] = [],
): PredictedMove {
  const grid = Array.from({ length: SIZE }, () => Array<BoardTile | null>(SIZE).fill(null));
  for (const tile of inputTiles) {
    if (tile.row < 0 || tile.row >= SIZE || tile.col < 0 || tile.col >= SIZE) continue;
    grid[tile.row][tile.col] = { ...tile };
  }

  const blocked = new Set(blockedCells.map((cell) => `${cell.row}:${cell.col}`));
  const output = Array.from({ length: SIZE }, () => Array<BoardTile | null>(SIZE).fill(null));
  for (const tile of inputTiles) {
    if (blocked.has(`${tile.row}:${tile.col}`)) {
      output[tile.row][tile.col] = { ...tile };
    }
  }
  const motions: PredictedMotion[] = [];
  let scoreDelta = 0;

  for (const line of segments(direction, blocked)) {
    const active = line
      .map((position) => ({ position, tile: grid[position.row][position.col] }))
      .filter((entry): entry is { position: CellPosition; tile: BoardTile } => entry.tile !== null);

    let outputIndex = 0;
    for (let index = 0; index < active.length; index += 1) {
      const current = active[index];
      const next = active[index + 1];
      const target = line[outputIndex];

      if (next && next.tile.value === current.tile.value) {
        const value = current.tile.value * 2;
        output[target.row][target.col] = {
          id: current.tile.id,
          value,
          row: target.row,
          col: target.col,
        };
        motions.push({
          id: current.tile.id,
          value: current.tile.value,
          from: current.position,
          to: target,
          consumed: false,
        });
        motions.push({
          id: next.tile.id,
          value: next.tile.value,
          from: next.position,
          to: target,
          consumed: true,
        });
        scoreDelta += value;
        index += 1;
      } else {
        output[target.row][target.col] = {
          id: current.tile.id,
          value: current.tile.value,
          row: target.row,
          col: target.col,
        };
        motions.push({
          id: current.tile.id,
          value: current.tile.value,
          from: current.position,
          to: target,
          consumed: false,
        });
      }
      outputIndex += 1;
    }
  }

  const tiles = output.flatMap((row) => row.filter((tile): tile is BoardTile => tile !== null));
  const changed = serialize(inputTiles) !== serialize(tiles);
  return {
    changed,
    tiles: changed ? tiles : inputTiles.map((tile) => ({ ...tile })),
    motions: changed ? motions : [],
    scoreDelta: changed ? scoreDelta : 0,
  };
}

function segments(direction: Direction, blocked: ReadonlySet<string>): CellPosition[][] {
  const result: CellPosition[][] = [];
  for (const line of lines(direction)) {
    let segment: CellPosition[] = [];
    for (const position of line) {
      if (blocked.has(`${position.row}:${position.col}`)) {
        if (segment.length > 0) result.push(segment);
        segment = [];
      } else {
        segment.push(position);
      }
    }
    if (segment.length > 0) result.push(segment);
  }
  return result;
}

function lines(direction: Direction): CellPosition[][] {
  const result: CellPosition[][] = [];
  for (let axis = 0; axis < SIZE; axis += 1) {
    const line: CellPosition[] = [];
    for (let index = 0; index < SIZE; index += 1) {
      if (direction === 'left') line.push({ row: axis, col: index });
      if (direction === 'right') line.push({ row: axis, col: SIZE - 1 - index });
      if (direction === 'up') line.push({ row: index, col: axis });
      if (direction === 'down') line.push({ row: SIZE - 1 - index, col: axis });
    }
    result.push(line);
  }
  return result;
}

function serialize(tiles: readonly BoardTile[]): string {
  return tiles
    .map((tile) => `${tile.id}:${tile.value}@${tile.row},${tile.col}`)
    .sort()
    .join('|');
}
