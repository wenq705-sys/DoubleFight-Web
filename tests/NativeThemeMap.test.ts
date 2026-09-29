import { describe,it,expect,vi } from 'vitest';
import {THEME_MAP_CARDS,playableTheme} from '../src/config/themeCatalog';
import {
  drawNativeThemeMap,layoutNativeThemeMap,nextThemeMapIndex,
} from '../platform/douyin/src/nativeThemeMap';

function fakeCanvas(){
  const labels:string[]=[];
  const gradient={addColorStop:vi.fn()};
  const noop=()=>{};
  const ctx=new Proxy({
    fillText:(label:string)=>{labels.push(label);},
    createLinearGradient:()=>gradient,
    createRadialGradient:()=>gradient,
    save:noop,restore:noop,beginPath:noop,moveTo:noop,lineTo:noop,
    quadraticCurveTo:noop,closePath:noop,fill:noop,stroke:noop,
    fillRect:noop,translate:noop,scale:noop,ellipse:noop,arc:noop,
  },{
    get(target,prop){return (target as Record<PropertyKey,unknown>)[prop]??noop},
    set(target,prop,value){(target as Record<PropertyKey,unknown>)[prop]=value;return true;},
  });
  return {ctx:ctx as unknown as CanvasRenderingContext2D,labels};
}
describe('Shared Web + Douyin five-island mainline map',()=>{
  it('registers all original mainline cards; preserves unfinished islands as visibly locked',()=>{
    expect(THEME_MAP_CARDS.map(c=>c.id)).toEqual([
      'kingdom','palace','nightmarket','candy','snow',
    ]);
    expect(THEME_MAP_CARDS.map(c=>Boolean(c.locked))).toEqual([
      false,false,false,true,true,
    ]);
    expect(THEME_MAP_CARDS.filter(c=>playableTheme(c.id)).length).toBe(3);
  });
  it('works at iPhone widths, with five distinct tappable dot targets',()=>{
    for(const [width,height,safe,top] of [
      [393,852,34,108],[375,812,28,96],[320,667,20,80],
    ] as const){
      const l=layoutNativeThemeMap(width,height,safe,top);
      expect(l.dots).toHaveLength(THEME_MAP_CARDS.length);
      expect(l.solo.y).toBeGreaterThan(l.heroBottom);
      expect(l.online.y).toBeGreaterThan(l.solo.y+l.solo.height);
      expect(l.collection.x).toBeGreaterThan(0);
      expect(l.collection.x+l.collection.width).toBeLessThan(l.rank.x);
      expect(l.rank.x+l.rank.width).toBeLessThan(l.daily.x);
      expect(l.daily.x+l.daily.width).toBeLessThanOrEqual(width);
      expect(l.footerY).toBeLessThan(height);
      expect(l.previous.x+l.previous.width).toBeLessThan(l.hero.x+20);
      expect(l.next.x).toBeGreaterThan(l.hero.x+l.hero.width-20);
    }
  });
  it('clamps carousel navigation instead of silently wrapping 3 themes',()=>{
    expect(nextThemeMapIndex(0,-1)).toBe(0);
    expect(nextThemeMapIndex(2,1)).toBe(3);
    expect(nextThemeMapIndex(4,1)).toBe(4);
    expect(nextThemeMapIndex(4,-1)).toBe(3);
  });
  it('paints the full native map and clear waiting states without Web DOM',()=>{
    const unlocked=fakeCanvas();
    drawNativeThemeMap(unlocked.ctx,{
      width:393,height:852,hudTop:108,safeBottomInset:34,
      selected:2,best:700,highest:128,sidebarReward:false,
    });
    expect(unlocked.labels).toContain('双数对决');
    expect(unlocked.labels).toContain('东方夜市·莲灯盛会');
    expect(unlocked.labels).toContain('进入世界');
    expect(unlocked.labels.some(label=>label.includes('在线对决 · 暂未开放'))).toBe(true);
    const locked=fakeCanvas();
    drawNativeThemeMap(locked.ctx,{
      width:393,height:852,hudTop:108,safeBottomInset:34,
      selected:3,best:0,highest:2,sidebarReward:false,
    });
    expect(locked.labels).toContain('糖果王国');
    expect(locked.labels).toContain('🔒  敬请期待');
    expect(locked.labels).toContain('新岛屿建设中');
  });
});

