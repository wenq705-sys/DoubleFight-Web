/**
 * Actual on-board 3D 2048 game using the repository's original shared Board2048,
 * NOT a duplicate tile-merging rules implementation.
 * Source high detail models remain untouched; playable scenes use 11 bounded LODs.
 */
import * as T from 'three';
import {Board2048} from './board2048-shared.mjs';
import {ThemeGameStageBridge} from './theme-game-bridge.mjs';
export const TILE_VALUES=Object.freeze([2,4,8,16,32,64,128,256,512,1024,2048]);
const CODE=v=>String(Math.min(2048,Math.max(2,v))).padStart(4,'0');
const CELL=1.065,FLOOR=.868;
const pos=(row,col)=>new T.Vector3((col-1.5)*CELL,FLOOR,(row-1.5)*CELL);
const clamp=(v,a,b)=>Math.min(b,Math.max(a,v));
const ease=t=>1-(1-t)**4;
const placeholderGeo=new T.DodecahedronGeometry(.20,1);
const placeholderMat=new T.MeshStandardMaterial({color:0xf4ce95,roughness:.30,metalness:.22});
const shadowGeo=new T.CircleGeometry(.30,20);
const shadowMat=new T.MeshBasicMaterial({color:0x402a20,transparent:true,
  opacity:.13,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-1});
export class NightMarketPlayable{
  constructor({scene,loader,canvas,director,onState=()=>{},onMode=()=>{},assetQuery='play-11-v1'}){
    this.root=new T.Group();this.root.name='Playable 4x4 | collectible LOD character tiles';
    scene.add(this.root);this.root.visible=false;
    this.loader=loader;this.canvas=canvas;this.director=director;
    this.bridge=new ThemeGameStageBridge(director);this.onState=onState;this.onMode=onMode;
    this.assetQuery=assetQuery;this.board=new Board2048();
    this.templates=new Map();this.views=new Map();
    this.mode='off';this.busy=false;this.animation=null;this.moveCount=0;
    this.startPoint=null;this.elapsed=0;
    this.onDown=e=>{
      if(this.mode!=='play'||!e.isPrimary)return;
      this.startPoint={x:e.clientX,y:e.clientY};
      this.canvas.setPointerCapture?.(e.pointerId);
    };
    this.onUp=e=>{
      if(this.mode!=='play'||!this.startPoint)return;
      const dx=e.clientX-this.startPoint.x,dy=e.clientY-this.startPoint.y;
      this.startPoint=null;if(Math.hypot(dx,dy)<21)return;
      this.move(Math.abs(dx)>Math.abs(dy)?(dx>0?'right':'left'):(dy>0?'down':'up'));
    };
    this.onKey=e=>{
      if(this.mode!=='play')return;
      const dir=({ArrowUp:'up',ArrowDown:'down',ArrowLeft:'left',ArrowRight:'right',
        w:'up',s:'down',a:'left',d:'right',W:'up',S:'down',A:'left',D:'right'})[e.key];
      if(!dir)return;
      e.preventDefault();this.move(dir);
    };
    canvas.addEventListener('pointerdown',this.onDown);
    canvas.addEventListener('pointerup',this.onUp);
    canvas.addEventListener('pointercancel',()=>{this.startPoint=null});
    window.addEventListener('keydown',this.onKey);
  }
  get active(){return this.mode!=='off'}
  state(){
    return {mode:this.mode,busy:this.busy,score:this.board.score,moves:this.moveCount,
      highest:Math.max(2,...(this.mode==='showcase'?TILE_VALUES:this.board.tiles().map(t=>t.value))),
      visible:this.views.size,loaded:this.templates.size};
  }
  notify(){this.onState(this.state())}
  loadTile(value){
    const known=TILE_VALUES.includes(value)?value:2048;
    if(this.templates.has(known))return this.templates.get(known);
    const path='./tiles/'+CODE(known)+'.glb?v='+this.assetQuery;
    const task=new Promise((resolve,reject)=>{
      this.loader.load(path,g=>{
        const asset=g.scene;
        const bounds=new T.Box3().setFromObject(asset);
        if(bounds.isEmpty())throw new Error('Model empty: '+known);
        const span=new T.Vector3();bounds.getSize(span);
        const maxHeight=known===8?1.17:1.29;
        const uniform=Math.min(.79/Math.max(.02,span.x),maxHeight/Math.max(.02,span.y),
          .80/Math.max(.02,span.z));
        const ctr=new T.Vector3();bounds.getCenter(ctr);
        asset.traverse(o=>{if(o.isMesh){o.castShadow=false;o.receiveShadow=false;}});
        resolve({source:asset,scale:uniform,bounds,center:ctr,value:known});
      },undefined,reject);
    }).catch(err=>{console.warn('[NightMarketPlayable] failed tile asset',known,err);return null});
    this.templates.set(known,task);
    return task;
  }
  preload(values=[2,4,8]){values.forEach(v=>void this.loadTile(v));}
  removeTile(id){
    const actor=this.views.get(id);
    if(!actor)return;
    actor.userData.retired=true;
    actor.removeFromParent();this.views.delete(id);
  }
  clearTiles(){
    for(const id of Array.from(this.views.keys()))this.removeTile(id);
    this.animation=null;this.busy=false;
  }
  addTile(tile,spawn=false){
    const actor=new T.Group();actor.name='tile-'+tile.id+'-'+tile.value;
    actor.position.copy(pos(tile.row,tile.col));
    actor.userData.value=tile.value;actor.userData.retired=false;
    const contents=new T.Group();contents.name='optimized character';
    actor.add(contents);
    const placeholder=new T.Mesh(placeholderGeo,placeholderMat);
    placeholder.name='streaming placeholder';placeholder.position.y=.28;
    contents.add(placeholder);
    const shadow=new T.Mesh(shadowGeo,shadowMat);
    shadow.rotation.x=-Math.PI/2;shadow.position.y=.011;
    actor.add(shadow);
    this.root.add(actor);this.views.set(tile.id,actor);
    if(spawn)actor.scale.setScalar(.28);
    void this.loadTile(tile.value).then(info=>{
      if(!info||actor.userData.retired||actor.userData.value!==tile.value)return;
      const model=info.source.clone(true);
      model.scale.setScalar(info.scale);
      model.position.set(-info.center.x*info.scale,
        -info.bounds.min.y*info.scale+.018,
        -info.center.z*info.scale);
      contents.remove(placeholder);contents.add(model);
      actor.userData.loaded=true;this.notify();
    });
    return actor;
  }
  start(){
    this.mode='play';this.root.visible=true;
    this.clearTiles();this.moveCount=0;
    const tiles=this.board.reset();
    this.bridge.reset(tiles);
    this.preload();
    for(const tile of tiles)this.addTile(tile,true);
    this.onMode(this.mode);this.notify();
    return this.state();
  }
  showcase(){
    this.mode='showcase';this.root.visible=true;
    this.clearTiles();this.preload(TILE_VALUES);
    const catalogue=TILE_VALUES.map((value,i)=>({
      id:9000+i,value,row:Math.floor(i/4),col:i%4
    }));
    for(const tile of catalogue)this.addTile(tile);
    this.bridge.reset([]);
    this.director.progress(1024);
    this.onMode(this.mode);this.notify();
    return this.state();
  }
  stop(){
    this.clearTiles();this.mode='off';this.root.visible=false;
    this.director.reset();this.onMode(this.mode);this.notify();
  }
  restart(){if(this.mode==='showcase')return this.showcase();return this.start();}
  move(direction){
    if(this.mode!=='play'||this.busy)return false;
    const result=this.board.move(direction);
    if(!result.changed){
      if(result.gameOver)this.onState({...this.state(),gameOver:true});
      return false;
    }
    this.moveCount++;this.busy=true;
    this.bridge.move(result,this.board.tiles());
    for(const merge of result.merges)this.preload([merge.value]);
    const moved=[];
    for(const motion of result.motions){
      const actor=this.views.get(motion.id);
      if(!actor)continue;
      moved.push({actor,start:actor.position.clone(),
        end:pos(motion.to.row,motion.to.col),consumed:motion.consumed});
    }
    this.animation={result,moved,t:0,duration:.17};
    this.notify();
    return true;
  }
  finishMove(){
    const anim=this.animation;if(!anim)return;
    const {result}=anim;
    for(const merge of result.merges){
      this.removeTile(merge.consumedId);this.removeTile(merge.survivorId);
      const actor=this.addTile({
        id:merge.survivorId,value:merge.value,row:merge.at.row,col:merge.at.col},true);
      actor.userData.bounce=0;
    }
    if(result.spawned)this.addTile(result.spawned,true);
    this.animation=null;this.busy=false;this.notify();
    if(result.gameOver)this.onState({...this.state(),gameOver:true});
  }
  update(dt){
    this.elapsed+=dt;
    if(!this.active)return;
    if(this.animation){
      const a=this.animation;a.t+=dt;
      const q=clamp(a.t/a.duration,0,1),factor=ease(q);
      for(const m of a.moved){
        m.actor.position.lerpVectors(m.start,m.end,factor);
        m.actor.position.y+=Math.sin(Math.PI*q)*.018;
      }
      if(q>=1)this.finishMove();
    }
    // Spawn-and-merge elasticity with no new per-frame geometry allocation.
    for(const actor of this.views.values()){
      if(actor.scale.x>=.998)continue;
      const k=1-Math.exp(-dt*16);
      const scalar=actor.scale.x+(1-actor.scale.x)*k;
      actor.scale.setScalar(scalar);
    }
  }
  dispose(){
    this.stop();
    this.canvas.removeEventListener('pointerdown',this.onDown);
    this.canvas.removeEventListener('pointerup',this.onUp);
    window.removeEventListener('keydown',this.onKey);
    this.root.removeFromParent();
    this.templates.clear();this.views.clear();
  }
}

