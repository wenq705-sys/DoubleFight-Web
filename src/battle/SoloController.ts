import { Board2048, type Direction } from '../../shared/index';
import type { BattleBoardView } from '../rendering/battle/BattleBoardView';

/** Solo authority adapts shared rule results into the same events used online. */
export class SoloController {
  readonly board = new Board2048();
  revision = 0;
  constructor(private readonly view: BattleBoardView) {}
  reset() { this.revision++; const tiles = this.board.reset(); this.view.reset(tiles); return tiles; }
  move(direction: Direction) {
    const result = this.board.move(direction);
    return { ...result, finished: this.view.present({ type: 'move', direction, result }) };
  }
  clearRandom(count: number) {
    const result = this.board.clearRandom(count);
    if (result.removed.length) void this.view.present({ type: 'skill_cast', skill: 'random_clear' });
    return { ...result, finished: this.view.present({ type: 'skill_hit', skill: 'random_clear', removed: result.removed }) };
  }
}
