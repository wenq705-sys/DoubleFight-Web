/**
 * Double Fight · 东方夜市莲灯棋台
 * Runtime-independent 5-stage mood state machine.
 * Real game supplies the highest tile reached and merge events.
 * Scene rendering and audio remain separate consumers of the same state.
 */
export const MOOD_STAGES = Object.freeze([
  Object.freeze({id:0, minTile:2,    name:'初入夜市', subtitle:'静谧 · 微光初燃', lantern:.18, moon:.055, water:.15, gold:.13, petals:0,    sparkles:0,    bloom:.04, festival:0,    music:0}),
  Object.freeze({id:1, minTile:16,   name:'夜市苏醒', subtitle:'灯影 · 一盏盏亮起', lantern:.43, moon:.20,  water:.31, gold:.28, petals:.12,  sparkles:.06,  bloom:.18, festival:.15, music:.26}),
  Object.freeze({id:2, minTile:64,   name:'夜市繁盛', subtitle:'烟火 · 花与水共舞', lantern:.77, moon:.48,  water:.58, gold:.48, petals:.38,  sparkles:.32,  bloom:.43, festival:.43, music:.51}),
  Object.freeze({id:3, minTile:256,  name:'华彩高潮', subtitle:'流光 · 满堂庆色', lantern:1.17,moon:.83,  water:.81, gold:.78, petals:.69,  sparkles:.70,  bloom:.73, festival:.78, music:.76}),
  Object.freeze({id:4, minTile:1024, name:'神灯盛会', subtitle:'圆满 · 万灯同明', lantern:1.48,moon:1.22, water:1.0, gold:1.0, petals:1.0,  sparkles:1.0, bloom:1.0,  festival:1.0, music:1.0}),
]);
const KEYS=['lantern','moon','water','gold','petals','sparkles','bloom','festival','music'];
const MAX=2048;
const clamp=(v,lo,hi)=>Math.min(hi,Math.max(lo,v));
const ease=t=>t*t*(3-2*t);
export function stageForMaxTile(value){
  const t=Number.isFinite(value)?value:2;
  for(let i=MOOD_STAGES.length-1;i>=0;i--)if(t>=MOOD_STAGES[i].minTile)return i;
  return 0;
}
function fields(stage){return Object.fromEntries(KEYS.map(k=>[k,stage[k]]));}
function interpolate(a,b,k){return a+(b-a)*k;}
export class ThemeMoodDirector{
  constructor({onStageChange=()=>{},onMoment=()=>{}}={}){
    this.onStageChange=onStageChange;this.onMoment=onMoment;
    this.reset(true);
  }
  reset(silent=false){
    this.highest=2;this.stage=0;this.stageAge=0;this.transitionAge=0;
    this.transitionDuration=1.40;this.from=fields(MOOD_STAGES[0]);
    this.to=fields(MOOD_STAGES[0]);this.current=fields(MOOD_STAGES[0]);
    this.pulse=0;this.comboPulse=0;this.victory=0;this.victoryTriggered=false;
    this.victoryAge=0;
    if(!silent)this.onStageChange({...MOOD_STAGES[0],previous:this.stage,reset:true});
    return this.snapshot();
  }
  progress(maxTile){
    if(!Number.isFinite(maxTile)||maxTile<2)return this.snapshot();
    this.highest=Math.max(this.highest,Math.min(MAX,maxTile));
    const next=stageForMaxTile(this.highest);
    if(next>this.stage){
      const previous=this.stage;
      this.from={...this.current};this.to=fields(MOOD_STAGES[next]);
      this.transitionAge=0;this.transitionDuration=1.50+.17*(next-previous);
      this.stage=next;this.stageAge=0;this.pulse=Math.max(this.pulse,.75);
      this.onStageChange({...MOOD_STAGES[next],previous,reset:false});
    }
    if(this.highest>=MAX&&!this.victoryTriggered){
      this.victoryTriggered=true;this.victory=1;this.victoryAge=0;
      this.pulse=1.28;this.comboPulse=1;
      this.onMoment({type:'victory',tile:MAX,combo:1,stage:this.stage});
    }
    return this.snapshot();
  }
  moment(type='merge',{tile=2,combo=1,cell=null}={}){
    if(type==='newMaxTile'||type==='merge'||type==='bigMerge')this.progress(tile);
    const amp=type==='combo'?1.05:type==='bigMerge'?.80:.36;
    this.pulse=Math.max(this.pulse,amp);
    if(type==='combo'||combo>=3)this.comboPulse=Math.max(this.comboPulse,Math.min(1.3,.5+combo*.15));
    if(type==='victory')this.progress(MAX);
    const payload={type,tile,combo,cell,stage:this.stage};
    if(type!=='victory')this.onMoment(payload);
    return this.snapshot();
  }
  update(delta){
    const dt=clamp(Number.isFinite(delta)?delta:0,0,.1);
    this.stageAge+=dt;this.transitionAge=Math.min(this.transitionDuration,this.transitionAge+dt);
    const t=ease(clamp(this.transitionAge/this.transitionDuration,0,1));
    for(const key of KEYS)this.current[key]=interpolate(this.from[key],this.to[key],t);
    this.pulse*=Math.exp(-3.8*dt);
    this.comboPulse*=Math.exp(-2.2*dt);
    this.victory*=Math.exp(-.72*dt);
    if(this.victoryTriggered)this.victoryAge+=dt;
    return this.snapshot();
  }
  snapshot(){
    return {highest:this.highest,stage:this.stage,stageName:MOOD_STAGES[this.stage].name,
      stageSubtitle:MOOD_STAGES[this.stage].subtitle,stageAge:this.stageAge,
      transitionProgress:clamp(this.transitionAge/this.transitionDuration,0,1),
      ...this.current,pulse:this.pulse,comboPulse:this.comboPulse,
      victory:this.victory,victoryTriggered:this.victoryTriggered,victoryAge:this.victoryAge};
  }
}

