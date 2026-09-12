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
  private blocked = new Set<string>();
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
    this.blocked.clear();
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
      blockedCells: this.blockedCells(),
      score: this._score,
      highest: Math.max(2, ...tiles.map((tile) => tile.value)),
      canMove: this.canMove(),
    };
  }

  tiles(): BoardTile[] {
    return this.grid.flatMap((row) => row.filter((cell): cell is BoardTile => cell !== null));
  }

  blockedCells(): CellPosition[] {
    return [...this.blocked]
      .map((key) => {
        const [row, col] = key.split(':').map(Number);
        return { row, col };
      })
      .sort((a, b) => a.row - b.row || a.col - b.col);
  }

  setBlockedCells(cells: readonly CellPosition[]): void {
    const next = new Set<string>();
    for (const cell of cells) {
      if (!this.inBounds(cell)) continue;
      next.add(this.key(cell));
    }
    this.blocked = next;
  }

  blockRandomEmpty(): CellPosition | null {
    const empty = this.emptyCells();
    if (empty.length === 0) return null;
    const position = empty[Math.min(empty.length - 1, Math.floor(this.random() * empty.length))];
    this.blocked.add(this.key(position));
    return { ...position };
  }

  /** Freeze one real occupied tile. The tile remains visible and fixed in place. */
  blockRandomTile(): CellPosition | null {
    const candidates = this.tiles().filter((tile) => !this.isBlocked(tile));
    if (candidates.length === 0) return null;
    const tile = candidates[Math.min(candidates.length - 1, Math.floor(this.random() * candidates.length))];
    const position = { row: tile.row, col: tile.col };
    this.blocked.add(this.key(position));
    return position;
  }

  clearBlockedCells(): CellPosition[] {
    const cleared = this.blockedCells();
    this.blocked.clear();
    return cleared;
  }

  /** Reposition all non-frozen tiles among all non-frozen cells. */
  shuffleTiles(): boolean {
    const movable = this.tiles().filter((tile) => !this.isBlocked(tile));
    if (movable.length < 2) return false;

    const candidates: CellPosition[] = [];
    for (let row = 0; row < SIZE; row += 1) {
      for (let col = 0; col < SIZE; col += 1) {
        const position = { row, col };
        if (!this.isBlocked(position)) candidates.push(position);
      }
    }

    for (let index = candidates.length - 1; index > 0; index -= 1) {
      const swapIndex = Math.min(index, Math.floor(this.random() * (index + 1)));
      [candidates[index], candidates[swapIndex]] = [candidates[swapIndex], candidates[index]];
    }

    const original = movable.map((tile) => ({ row: tile.row, col: tile.col }));
    let targets = candidates.slice(0, movable.length);
    let changed = movable.some((tile, index) => tile.row !== targets[index].row || tile.col !== targets[index].col);

    if (!changed && targets.length > 1) {
      targets = [...targets.slice(1), targets[0]];
      changed = true;
    }
    if (!changed) return false;

    for (const tile of movable) this.grid[tile.row][tile.col] = null;
    movable.forEach((tile, index) => {
      const target = targets[index];
      tile.row = target.row;
      tile.col = target.col;
      this.grid[target.row][target.col] = tile;
    });

    return original.some((position, index) =>
      position.row !== movable[index].row || position.col !== movable[index].col);
  }

  emptyCells(): CellPosition[] {
    const empty: CellPosition[] = [];
    for (let row = 0; row < SIZE; row += 1) {
      for (let col = 0; col < SIZE; col += 1) {
        const position = { row, col };
        if (!this.grid[row][col] && !this.isBlocked(position)) empty.push(position);
      }
    }
    return empty;
  }

  move(direction: Direction): MoveResult {
    const before = this.serialize();
    const next = this.emptyGrid();
    for (const position of this.blockedCells()) {
      const frozen = this.grid[position.row][position.col];
      if (frozen) next[position.row][position.col] = { ...frozen };
    }
    const motions: TileMotion[] = [];
    const merges: MergeEvent[] = [];
    let scoreDelta = 0;

    for (const line of this.segments(direction)) {
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
    const occupied = this.tiles().filter((tile) => !this.isBlocked(tile));
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
    if (this.emptyCells().length > 0) return true;

    for (let row = 0; row < SIZE; row += 1) {
      for (let col = 0; col < SIZE; col += 1) {
        const current = { row, col };
        if (this.isBlocked(current)) continue;
        const value = this.grid[row][col]?.value;
        if (value === undefined) continue;

        const right = { row, col: col + 1 };
        if (
          col + 1 < SIZE &&
          !this.isBlocked(right) &&
          this.grid[row][col + 1]?.value === value
        ) return true;

        const down = { row: row + 1, col };
        if (
          row + 1 < SIZE &&
          !this.isBlocked(down) &&
          this.grid[row + 1][col]?.value === value
        ) return true;
      }
    }
    return false;
  }

  /** Debug/test helper. Production server remains authoritative over calls to this. */
  load(values: number[][], score = 0): void {
    if (values.length !== SIZE || values.some((row) => row.length !== SIZE)) {
      throw new Error('Board2048.load expects a 4x4 matrix.');
    }

    this.blocked.clear();
    this._score = Math.max(0, Math.floor(score));
    this.grid = values.map((row, rowIndex) =>
      row.map((value, colIndex) =>
        value
          ? { id: this.nextId++, value, row: rowIndex, col: colIndex }
          : null,
      ),
    );
  }

  private spawnRandom(): BoardTile | null {
    const empty = this.emptyCells();
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

  private segments(direction: Direction): CellPosition[][] {
    const segments: CellPosition[][] = [];

    for (const line of this.lines(direction)) {
      let segment: CellPosition[] = [];
      for (const position of line) {
        if (this.isBlocked(position)) {
          if (segment.length > 0) segments.push(segment);
          segment = [];
        } else {
          segment.push(position);
        }
      }
      if (segment.length > 0) segments.push(segment);
    }

    return segments;
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

  private isBlocked(position: CellPosition): boolean {
    return this.blocked.has(this.key(position));
  }

  private key(position: CellPosition): string {
    return `${position.row}:${position.col}`;
  }

  private inBounds(position: CellPosition): boolean {
    return position.row >= 0 && position.row < SIZE && position.col >= 0 && position.col < SIZE;
  }

  private emptyGrid(): Cell[][] {
    return Array.from({ length: SIZE }, () => Array<Cell>(SIZE).fill(null));
  }

  private serialize(): string {
    return JSON.stringify(this.snapshot());
  }
}
