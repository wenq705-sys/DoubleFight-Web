import type {
  BoardPublicState,
  BoardTile,
  CellPosition,
  ClearResult,
  Direction,
  MergeEvent,
  MoveResult,
  TileMotion,
} from './types';
import type { RandomSource } from './SeededRandom';

const SIZE = 4;
type Cell = BoardTile | null;
type RandomInput = (() => number) | RandomSource;

export class Board2048 {
  private grid: Cell[][] = this.emptyGrid();
  private nextId = 1;
  private _score = 0;
  private readonly random: () => number;

  constructor(random: RandomInput = Math.random) {
    this.random = typeof random === 'function' ? random : () => random.next();
  }

  get score(): number {
    return this._score;
  }

  reset(): BoardTile[] {
    this.grid = this.emptyGrid();
    this._score = 0;
    this.nextId = 1;
    const first = this.spawnRandom();
    const second = this.spawnRandom();
    return [first, second].filter((tile): tile is BoardTile => tile !== null);
  }

  snapshot(): ReadonlyArray<ReadonlyArray<number>> {
    return this.grid.map((row) => row.map((cell) => cell?.value ?? 0));
  }

  publicState(): BoardPublicState {
    const tiles = this.tiles();
    return {
      cells: this.snapshot().map((row) => [...row]),
      tiles: tiles.map((tile) => ({ ...tile })),
      score: this._score,
      highest: Math.max(2, ...tiles.map((tile) => tile.value)),
      canMove: this.canMove(),
    };
  }

  tiles(): BoardTile[] {
    return this.grid.flatMap((row) => row.filter((cell): cell is BoardTile => cell !== null));
  }

  move(direction: Direction): MoveResult {
    const before = this.serialize();
    const next = this.emptyGrid();
    const motions: TileMotion[] = [];
    const merges: MergeEvent[] = [];
    let scoreDelta = 0;

    for (const line of this.lines(direction)) {
      const active = line
        .map((position) => ({ position, tile: this.grid[position.row][position.col] }))
        .filter((entry): entry is { position: CellPosition; tile: BoardTile } => entry.tile !== null);

      let outputIndex = 0;
      for (let i = 0; i < active.length; i += 1) {
        const current = active[i];
        const target = line[outputIndex];
        const nextEntry = active[i + 1];

        if (nextEntry && nextEntry.tile.value === current.tile.value) {
          const mergedValue = current.tile.value * 2;
          next[target.row][target.col] = {
            id: current.tile.id,
            value: mergedValue,
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
            id: nextEntry.tile.id,
            value: nextEntry.tile.value,
            from: nextEntry.position,
            to: target,
            consumed: true,
          });
          merges.push({
            survivorId: current.tile.id,
            consumedId: nextEntry.tile.id,
            value: mergedValue,
            at: target,
          });
          scoreDelta += mergedValue;
          i += 1;
        } else {
          next[target.row][target.col] = {
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

    this.grid = next;
    const changed = this.serialize() !== before;
    if (!changed) {
      return {
        changed: false,
        scoreDelta: 0,
        motions: [],
        merges: [],
        spawned: null,
        gameOver: !this.canMove(),
      };
    }

    this._score += scoreDelta;
    const spawned = this.spawnRandom();
    return {
      changed: true,
      scoreDelta,
      motions,
      merges,
      spawned,
      gameOver: !this.canMove(),
    };
  }

  clearRandom(count = 2): ClearResult {
    const occupied = this.tiles();
    if (occupied.length === 0 || count <= 0) {
      return { removed: [], gameOver: !this.canMove() };
    }

    const pool = [...occupied];
    const removed: BoardTile[] = [];
    const targetCount = Math.min(Math.floor(count), pool.length);

    for (let index = 0; index < targetCount; index += 1) {
      const pickIndex = Math.min(pool.length - 1, Math.floor(this.random() * pool.length));
      const [tile] = pool.splice(pickIndex, 1);
      if (!tile) continue;
      this.grid[tile.row][tile.col] = null;
      removed.push({ ...tile });
    }

    return { removed, gameOver: !this.canMove() };
  }

  canMove(): boolean {
    if (this.grid.some((row) => row.some((cell) => cell === null))) return true;

    for (let row = 0; row < SIZE; row += 1) {
      for (let col = 0; col < SIZE; col += 1) {
        const value = this.grid[row][col]?.value;
        if (col + 1 < SIZE && this.grid[row][col + 1]?.value === value) return true;
        if (row + 1 < SIZE && this.grid[row + 1][col]?.value === value) return true;
      }
    }
    return false;
  }

  /** Debug/test helper. Production server remains authoritative over calls to this. */
  load(values: number[][]): void {
    if (values.length !== SIZE || values.some((row) => row.length !== SIZE)) {
      throw new Error('Board2048.load expects a 4x4 matrix.');
    }

    this.grid = values.map((row, rowIndex) =>
      row.map((value, colIndex) =>
        value
          ? { id: this.nextId++, value, row: rowIndex, col: colIndex }
          : null,
      ),
    );
  }

  private spawnRandom(): BoardTile | null {
    const empty: CellPosition[] = [];
    for (let row = 0; row < SIZE; row += 1) {
      for (let col = 0; col < SIZE; col += 1) {
        if (!this.grid[row][col]) empty.push({ row, col });
      }
    }

    if (empty.length === 0) return null;
    const position = empty[Math.floor(this.random() * empty.length)];
    const value = this.random() < 0.9 ? 2 : 4;
    const tile: BoardTile = {
      id: this.nextId++,
      value,
      row: position.row,
      col: position.col,
    };
    this.grid[position.row][position.col] = tile;
    return tile;
  }

  private lines(direction: Direction): CellPosition[][] {
    const lines: CellPosition[][] = [];
    for (let axis = 0; axis < SIZE; axis += 1) {
      const line: CellPosition[] = [];
      for (let index = 0; index < SIZE; index += 1) {
        if (direction === 'left') line.push({ row: axis, col: index });
        if (direction === 'right') line.push({ row: axis, col: SIZE - 1 - index });
        if (direction === 'up') line.push({ row: index, col: axis });
        if (direction === 'down') line.push({ row: SIZE - 1 - index, col: axis });
      }
      lines.push(line);
    }
    return lines;
  }

  private emptyGrid(): Cell[][] {
    return Array.from({ length: SIZE }, () => Array<Cell>(SIZE).fill(null));
  }

  private serialize(): string {
    return JSON.stringify(this.snapshot());
  }
}
