export type Direction = 'left' | 'right' | 'up' | 'down';

export interface CellPosition {
  row: number;
  col: number;
}

export interface BoardTile {
  id: number;
  value: number;
  row: number;
  col: number;
}

export interface TileMotion {
  id: number;
  value: number;
  from: CellPosition;
  to: CellPosition;
  consumed: boolean;
}

export interface MergeEvent {
  survivorId: number;
  consumedId: number;
  value: number;
  at: CellPosition;
}

export interface MoveResult {
  changed: boolean;
  scoreDelta: number;
  motions: TileMotion[];
  merges: MergeEvent[];
  spawned: BoardTile | null;
  gameOver: boolean;
}

export interface ClearResult {
  removed: BoardTile[];
  gameOver: boolean;
}

export interface BoardPublicState {
  cells: number[][];
  tiles: BoardTile[];
  score: number;
  highest: number;
  canMove: boolean;
}
