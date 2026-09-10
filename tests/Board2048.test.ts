import { describe, expect, it } from 'vitest';
import { Board2048 } from '../src/game/board/Board2048';

const deterministicRandom=()=>0;

describe('Board2048',()=>{
  it('merges equal tiles once per move',()=>{
    const board=new Board2048(deterministicRandom);board.load([[2,2,2,2],[0,0,0,0],[0,0,0,0],[0,0,0,0]]);
    const result=board.move('left');
    expect(result.changed).toBe(true);expect(result.scoreDelta).toBe(8);expect(result.merges.map(m=>m.value)).toEqual([4,4]);expect(board.snapshot()[0].slice(0,2)).toEqual([4,4]);
  });
  it('does not chain-merge a freshly merged tile in the same move',()=>{
    const board=new Board2048(deterministicRandom);board.load([[2,2,4,0],[0,0,0,0],[0,0,0,0],[0,0,0,0]]);board.move('left');expect(board.snapshot()[0][0]).toBe(4);expect(board.snapshot()[0][1]).toBe(4);
  });
  it('recognizes a locked board',()=>{
    const board=new Board2048(deterministicRandom);board.load([[2,4,2,4],[4,2,4,2],[2,4,2,4],[4,2,4,2]]);expect(board.canMove()).toBe(false);
  });
});
