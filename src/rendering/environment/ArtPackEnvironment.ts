import * as THREE from 'three';
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';
import {ART} from '../../config/artDirection';
import type {ArtThemeDefinition} from '../../config/artThemeSchema';
import type {BoardTile,Direction,MoveResult} from '../../game/board/types';
import {loadArtThemeGLB} from '../loaders/ArtThemeAssetLoader';

type Glow={material:THREE.MeshStandardMaterial;intensity:number;tag:string};
type Overlay={stage:number;root:THREE.Group;age:number;scale:number};
const clamp=(n:number,a=0,b=1)=>Math.min(b,Math.max(a,n));
/**
 * Default reusable 4x4 3D environment. No theme-specific scene code needed.
 *
 * Authors may supply stage overlay GLBs in theme.json.assets.overlays:
 * [{stage:1,file:"stage/awakening.glb"},...,{stage:4,file:"stage/festival.glb"}]
 *
 * Overlay visibility, color lighting and the score-driven mood are automatic.
 * A custom existing theme may still use a bespoke visual preset separately.
 */
export class ArtPackEnvironment {
  readonly root=new THREE.Group();
  private readonly frame=new THREE.Group();
  private readonly fallback=new THREE.Group();
  private readonly loader=new GLTFLoader();
  private readonly glows:Glow[]=[];
  private readonly overlays:Overlay[]=[];
  private readonly pending=new Set<string>();
  private readonly frameScale:number;
  private readonly mobile:boolean;
  private readonly theme:ArtThemeDefinition;
  private stage=0;
  private maxTile=2;
  private stageIntensity=0;
  private pulse=0;
  private elapsed=0;
  private victoryPlayed=false;
  private disposed=false;
  constructor(theme:ArtThemeDefinition,detail:'full'|'duel'|'board'='full'){
    this.theme=theme;
    this.root.name='ArtPack | '+theme.id;
    this.frameScale=ART.board.gap/theme.placement.gridGap;
    this.frame.scale.setScalar(this.frameScale);
    this.frame.position.set(0,
      theme.placement.gameSurfaceY-theme.placement.artFloorY*this.frameScale,
      ART.board.centerZ-theme.placement.centerZ*this.frameScale);
    this.root.add(this.frame);
    this.mobile=detail!=='full'||typeof window==='undefined'||
      typeof window.matchMedia!=='function'||window.matchMedia('(pointer: coarse)').matches;
    this.makeFallback();
    this.loadModel(theme.assets.board,'board');
    if(detail!=='board'){
      this.loadModel(this.mobile||!theme.assets.environmentFull
        ? theme.assets.environmentMobile:theme.assets.environmentFull,'environment');
    }
  }
  get moodStage():number{return this.stage}
  get moodName():string{return this.theme.mood.labels[this.stage]}
  get reachedValue():number{return this.maxTile}
  resetMood(tiles:readonly BoardTile[]=[]):void{
    this.stage=0;this.maxTile=2;this.stageIntensity=0;this.pulse=0;
    this.victoryPlayed=false;
    this.advance(Math.max(2,...tiles.map(tile=>tile.value)));
    for(const overlay of this.overlays){
      overlay.root.visible=overlay.stage<=this.stage;
      overlay.age=0;
    }
  }
  onBoardMove(result:MoveResult):void{
    if(!result.changed||!result.merges.length)return;
    const biggest=Math.max(...result.merges.map(m=>m.value));
    this.advance(biggest);
    this.pulse=Math.max(this.pulse,result.merges.length>=3?1.12:biggest>=256?.98:.55);
  }
  private advance(value:number):void{
    this.maxTile=Math.max(this.maxTile,value);
    let next=0;
    for(let i=0;i<this.theme.mood.thresholds.length;i++)
      if(this.maxTile>=this.theme.mood.thresholds[i])next=i;
    if(next>this.stage){
      this.stage=next;this.pulse=Math.max(this.pulse,.72);
      for(const overlay of this.overlays)if(overlay.stage<=next)overlay.root.visible=true;
      for(const spec of this.theme.assets.overlays??[]){
        if(spec.stage<=next&&!this.pending.has(spec.file)){
          this.pending.add(spec.file);this.loadModel(spec.file,'overlay',spec.stage);
        }
      }
    }
    if(this.maxTile>=2048&&!this.victoryPlayed){
      this.victoryPlayed=true;this.pulse=1.45;
    }
  }
  setGesture(_dx:number,_dy:number,strength:number):void{
    this.pulse=Math.max(this.pulse,Math.min(.12,strength*.12));
  }
  clearGesture():void{/* No gameplay changes while dragging. */}
  pulseDirection(_direction:Direction):void{this.pulse=Math.max(this.pulse,.19)}
  impact(value:number,_where:THREE.Vector3):void{
    this.pulse=Math.max(this.pulse,value>=256?.91:.45);
  }
  update(_time:number,delta:number):void{
    if(this.disposed||!this.root.visible)return;
    const dt=clamp(delta,0,.055);this.elapsed+=dt;
    this.stageIntensity+=(this.stage-this.stageIntensity)*(1-Math.exp(-dt*2.3));
    this.pulse*=Math.exp(-dt*4);
    for(const {material,intensity,tag} of this.glows){
      const stagePower=this.stageIntensity*.18;
      const modulation=.032*Math.sin(this.elapsed*1.5);
      material.emissiveIntensity=intensity+
        stagePower*(tag==='lantern'||tag==='paper'?1.28:tag==='water'?.49:.78)
        +this.pulse*.16+modulation;
    }
    for(const overlay of this.overlays){
      if(!overlay.root.visible)continue;
      overlay.age=Math.min(1,overlay.age+dt*.85);
      const grow=.72+.28*(overlay.age*overlay.age*(3-2*overlay.age));
      overlay.root.scale.setScalar(overlay.scale*grow);
    }
  }
  private makeFallback():void{
    const gap=this.theme.placement.gridGap,level=this.theme.placement.artFloorY;
    const platform=new THREE.Mesh(
      new THREE.BoxGeometry(5.50*gap/1.065,.20,5.50*gap/1.065),
      new THREE.MeshStandardMaterial({color:this.theme.render.accent,roughness:.6}));
    platform.position.y=level-.09;this.fallback.add(platform);
    const geometry=new THREE.BoxGeometry(gap*.87,.042,gap*.87);
    const face=new THREE.MeshStandardMaterial({color:0xe7c5a7,roughness:.5});
    for(let row=0;row<4;row++)for(let col=0;col<4;col++){
      const tile=new THREE.Mesh(geometry,face);
      tile.position.set((col-1.5)*gap,level-.019,(row-1.5)*gap);
      this.fallback.add(tile);
    }
    this.fallback.name='Temporary grid while authored GLB loads';
    this.frame.add(this.fallback);
  }
  private loadModel(file:string,kind:'board'|'environment'|'overlay',stage=0):void{
    loadArtThemeGLB(this.loader,this.theme.id,file,result=>{
      if(this.disposed)return;
      const root=result.scene;
      root.name=this.theme.id+' | '+kind+(stage?' | stage '+stage:'');
      const converted=new Map<THREE.Material,THREE.Material>();
      root.traverse(node=>{
        if(!(node instanceof THREE.Mesh))return;
        node.castShadow=false;node.receiveShadow=false;
        const convert=(material:THREE.Material)=>{
          if(converted.has(material))return converted.get(material)!;
          const copy=material.clone();converted.set(material,copy);
          if(copy instanceof THREE.MeshStandardMaterial){
            const name=copy.name.toLowerCase();
            for(const [tag,keywords] of Object.entries(this.theme.mood.glowMaterialKeys??{})){
              if(keywords.some(part=>name.includes(part.toLowerCase()))){
                this.glows.push({material:copy,intensity:copy.emissiveIntensity,tag});
                if(copy.emissive.getHex()===0)copy.emissive.set(this.theme.render.accent);
                break;
              }
            }
          }
          return copy;
        };
        node.material=Array.isArray(node.material)
          ? node.material.map(convert):convert(node.material);
      });
      this.frame.add(root);
      if(kind==='board'){
        this.fallback.removeFromParent();
        this.fallback.traverse(node=>{
          if(node instanceof THREE.Mesh){
            node.geometry.dispose();
            if(Array.isArray(node.material))node.material.forEach(m=>m.dispose());
            else node.material.dispose();
          }
        });
      }
      if(kind==='overlay'){
        const entry={stage,root,age:0,scale:1};
        root.visible=stage<=this.stage;
        this.overlays.push(entry);
      }
    },error=>console.warn('[ArtPack] missing asset',this.theme.id,file,error));
  }
  dispose():void{this.disposed=true;this.root.removeFromParent();this.glows.length=0;this.overlays.length=0}
}
