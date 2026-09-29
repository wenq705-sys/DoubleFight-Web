import test from 'node:test';
import assert from 'node:assert/strict';
import {MOOD_STAGES,stageForMaxTile,ThemeMoodDirector}
  from '../public/theme-preview/nightmarket-diorama/theme-stage-core.mjs';
test('five stage definitions with exact tile thresholds',()=>{
  assert.equal(MOOD_STAGES.length,5);
  assert.deepEqual(MOOD_STAGES.map(x=>x.minTile),[2,16,64,256,1024]);
  for(const [value,want] of [[2,0],[4,0],[8,0],[15,0],[16,1],[32,1],
    [63,1],[64,2],[128,2],[255,2],[256,3],[512,3],[1023,3],
    [1024,4],[2048,4],[4096,4]])assert.equal(stageForMaxTile(value),want,'tile '+value);
});
test('monotonic progress and no regression after removing the highest tile',()=>{
  const events=[];const d=new ThemeMoodDirector({onStageChange:e=>events.push(e)});
  [2,16,64,256,1024,256,16].forEach(v=>d.progress(v));
  assert.equal(d.stage,4);assert.equal(d.highest,1024);
  assert.deepEqual(events.map(e=>e.id),[1,2,3,4]);
  d.reset();assert.equal(d.stage,0);assert.equal(d.highest,2);
  assert.equal(events.at(-1).reset,true);
});
test('stage visuals interpolate gradually',()=>{
  const d=new ThemeMoodDirector(),initial=d.snapshot().lantern;
  d.progress(256);
  assert.equal(d.stage,3);assert.equal(d.snapshot().lantern,initial);
  d.update(.05);assert(d.snapshot().lantern>initial);
  assert(d.snapshot().lantern<MOOD_STAGES[3].lantern);
  for(let i=0;i<100;i++)d.update(.033);
  assert(Math.abs(d.snapshot().lantern-MOOD_STAGES[3].lantern)<.0001);
});
test('combo and merge effects decay independently of lasting stage',()=>{
  const moments=[];const d=new ThemeMoodDirector({onMoment:e=>moments.push(e)});
  d.moment('merge',{tile:8,combo:1});
  assert(d.snapshot().pulse>0);assert.equal(d.stage,0);
  d.moment('combo',{tile:8,combo:4,cell:{row:1,column:2}});
  assert(d.snapshot().comboPulse>=1);assert.equal(moments.at(-1).cell.column,2);
  for(let i=0;i<90;i++)d.update(.033);
  assert(d.snapshot().pulse<.01);assert(d.snapshot().comboPulse<.01);
});
test('2048 victory triggers once per run, then reset re-arms it',()=>{
  const moments=[];const d=new ThemeMoodDirector({onMoment:e=>moments.push(e)});
  d.progress(2048);d.progress(2048);d.moment('victory',{tile:2048});
  assert.equal(d.stage,4);assert.equal(d.highest,2048);
  assert.equal(moments.filter(e=>e.type==='victory').length,1);
  assert(d.snapshot().victory>0);d.reset();d.progress(2048);
  assert.equal(moments.filter(e=>e.type==='victory').length,2);
});
test('bad values are ignored and max values are capped',()=>{
  const d=new ThemeMoodDirector();
  for(const v of [NaN,Infinity,-2,0])d.progress(v);
  assert.equal(d.stage,0);
  d.progress(65536);assert.equal(d.highest,2048);
  const s=d.update(Infinity);assert(Number.isFinite(s.lantern));
});

test('real Board2048 move events drive stages, combo, and skill-clear monotonicity',async()=>{
  const {ThemeGameStageBridge}=await import(
    '../public/theme-preview/nightmarket-diorama/theme-game-bridge.mjs');
  const moments=[];
  const director=new ThemeMoodDirector({onMoment:e=>moments.push(e)});
  const bridge=new ThemeGameStageBridge(director);
  bridge.reset([{value:2},{value:4}]);
  assert.equal(director.stage,0);
  const result={changed:true,merges:[{value:16,at:{row:1,col:3}}]};
  bridge.move(result,[{value:16},{value:4}]);
  assert.equal(director.stage,1);
  assert.equal(moments.at(-1).cell.column,3);
  bridge.move({changed:true,merges:[{value:64,at:{row:0,col:0}},
    {value:32,at:{row:2,col:2}},{value:16,at:{row:3,col:0}}]},
    [{value:64},{value:2}]);
  assert.equal(director.stage,2);
  assert.equal(moments.at(-1).type,'combo');
  bridge.clearSkill([{value:2}]);assert.equal(director.stage,2);
  bridge.move({changed:false,merges:[{value:256}]},[{value:2}]);
  assert.equal(director.stage,2);
  bridge.move({changed:true,merges:[{value:2048,at:{row:2,col:1}}]},
    [{value:2048}]);
  assert.equal(director.stage,4);
  assert.equal(moments.filter(e=>e.type==='victory').length,1);
});
