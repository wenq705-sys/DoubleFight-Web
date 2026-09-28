import {describe,it,expect} from 'vitest';
import {initial,spawn,move,canMove,level} from './game.js';
describe('night market 2048',()=>{
 it('spawns only in free cells',()=>{const b=initial();spawn(b,()=>0);expect(b[0][0]).toBe(2);expect(b.flat().filter(Boolean)).toHaveLength(1)});
 it('merges once per pair and scores correctly',()=>{const b=initial();b[0]=[2,2,2,2];const m=move(b,'left');expect(m.board[0]).toEqual([4,4,0,0]);expect(m.score).toBe(8);expect(m.merges).toHaveLength(2)});
 it('does not chain merge newly created tiles',()=>{const b=initial();b[0]=[2,2,4,0];expect(move(b,'left').board[0]).toEqual([4,4,0,0])});
 it('supports all four directions',()=>{const b=initial();b[0][0]=2;b[1][0]=2;expect(move(b,'down').board[3][0]).toBe(4);expect(move(b,'up').board[0][0]).toBe(4)});
 it('detects game over',()=>{const b=Array.from({length:4},(_,r)=>Array.from({length:4},(_,c)=>((r+c)%2?4:2)));expect(canMove(b)).toBe(false);b[0][0]=4;expect(canMove(b)).toBe(true)});
 it('caps display tier',()=>expect(level(4096)).toBe(10));
});
