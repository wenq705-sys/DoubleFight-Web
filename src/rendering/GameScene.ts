import * as THREE from 'three';
import type { BoardTile, MoveResult } from '../game/board/types';
import { ART } from '../config/artDirection';
import { KingdomEnvironment } from './environment/KingdomEnvironment';
import { TileFactory, type TileVisual } from './tiles/TileFactory';
import { Effects } from './vfx/Effects';

type Tween={elapsed:number;duration:number;update:(t:number)=>void;complete?:()=>void};
type TileInstance=TileVisual&{value:number};

export class GameScene {
  readonly canvas: HTMLCanvasElement;
  private readonly scene=new THREE.Scene();
  private readonly camera=new THREE.PerspectiveCamera(39,1,.1,100);
  private readonly renderer:THREE.WebGLRenderer;
  private readonly world=new THREE.Group();
  private readonly tileLayer=new THREE.Group();
  private readonly environment=new KingdomEnvironment();
  private readonly tileFactory=new TileFactory();
  private readonly effects:Effects;
  private readonly tiles=new Map<number,TileInstance>();
  private readonly tweens:Tween[]=[];
  private readonly clock=new THREE.Clock();
  private cameraShake=0;
  private readonly cameraHome=new THREE.Vector3(8.65,11.2,13.2);
  private readonly cameraTarget=new THREE.Vector3(0,.55,.65);
  private disposed=false;

  constructor(container:HTMLElement){
    this.scene.background=new THREE.Color(ART.colors.sky);this.scene.fog=new THREE.Fog(ART.colors.skyFog,20,43);
    this.renderer=new THREE.WebGLRenderer({antialias:true,alpha:false,powerPreference:'high-performance'});
    this.renderer.outputColorSpace=THREE.SRGBColorSpace;this.renderer.toneMapping=THREE.ACESFilmicToneMapping;this.renderer.toneMappingExposure=1.03;
    this.renderer.shadowMap.enabled=true;this.renderer.shadowMap.type=THREE.PCFSoftShadowMap;this.renderer.setPixelRatio(Math.min(window.devicePixelRatio,1.7));
    container.appendChild(this.renderer.domElement);this.canvas=this.renderer.domElement;
    this.scene.add(this.world);this.world.add(this.environment.root);this.world.add(this.tileLayer);this.effects=new Effects(this.world);
    this.configureLighting();this.camera.position.copy(this.cameraHome);this.camera.lookAt(this.cameraTarget);this.resize();window.addEventListener('resize',this.resize);this.animate();
  }

  reset(tiles:BoardTile[]):void{this.tiles.forEach(tile=>tile.root.removeFromParent());this.tiles.clear();this.tweens.splice(0);tiles.forEach(tile=>this.addTile(tile,true));}

  async applyMove(result:MoveResult):Promise<void>{
    if(!result.changed)return;
    const movements=result.motions.map(motion=>new Promise<void>(resolve=>{
      const visual=this.tiles.get(motion.id);if(!visual){resolve();return;}
      const start=visual.root.position.clone(),target=this.cellPosition(motion.to.row,motion.to.col);
      this.tweens.push({elapsed:0,duration:ART.motion.moveMs/1000,update:t=>{const e=1-Math.pow(1-t,3);visual.root.position.lerpVectors(start,target,e);visual.root.rotation.z=Math.sin(Math.PI*t)*.035;},complete:()=>{visual.root.position.copy(target);visual.root.rotation.z=0;resolve();}});
    }));
    await Promise.all(movements);
    result.merges.forEach(merge=>{
      const consumed=this.tiles.get(merge.consumedId);consumed?.root.removeFromParent();this.tiles.delete(merge.consumedId);
      const survivor=this.tiles.get(merge.survivorId);survivor?.root.removeFromParent();this.tiles.delete(merge.survivorId);
      const tile={id:merge.survivorId,value:merge.value,row:merge.at.row,col:merge.at.col};const visual=this.addTile(tile,false);
      visual.root.scale.set(1.18,.78,1.18);const pos=this.cellPosition(merge.at.row,merge.at.col);this.effects.merge(pos,merge.value);this.mergeBounce(visual.root,merge.value);
      this.cameraShake=Math.max(this.cameraShake,merge.value>=512?.23:merge.value>=128?.12:.055);
    });
    if(result.spawned){this.addTile(result.spawned,true);this.effects.spawn(this.cellPosition(result.spawned.row,result.spawned.col));}
  }

  dispose():void{this.disposed=true;window.removeEventListener('resize',this.resize);this.renderer.dispose();}

  private addTile(tile:BoardTile,spawn:boolean):TileInstance{
    const visual=this.tileFactory.create(tile.value),instance:TileInstance={...visual,value:tile.value};instance.root.position.copy(this.cellPosition(tile.row,tile.col));instance.root.name=`Tile-${tile.id}-${tile.value}`;this.tileLayer.add(instance.root);this.tiles.set(tile.id,instance);
    if(spawn){instance.root.scale.setScalar(.01);const y=instance.root.position.y;this.tweens.push({elapsed:0,duration:ART.motion.spawnMs/1000,update:t=>{const s=this.easeOutBack(t);instance.root.scale.setScalar(s);instance.root.position.y=y+Math.sin(Math.PI*t)*.17;},complete:()=>{instance.root.scale.setScalar(1);instance.root.position.y=y;}});}
    return instance;
  }

  private mergeBounce(root:THREE.Group,value:number):void{const y=root.position.y,d=value>=512?.42:ART.motion.mergeMs/1000;this.tweens.push({elapsed:0,duration:d,update:t=>{const p=Math.sin(Math.PI*t),s=1-t;root.scale.set(1+p*.18*s,1-p*.14*s,1+p*.18*s);root.position.y=y+Math.sin(Math.PI*t)*(value>=512?.34:.2);},complete:()=>{root.scale.setScalar(1);root.position.y=y;}});}

  private configureLighting():void{
    this.scene.add(new THREE.HemisphereLight(0xf5fbff,0x6e9052,2.15));
    const sun=new THREE.DirectionalLight(0xfff0c9,3.15);sun.position.set(-8,15,7);sun.castShadow=true;sun.shadow.mapSize.set(1536,1536);sun.shadow.camera.left=-10;sun.shadow.camera.right=10;sun.shadow.camera.top=10;sun.shadow.camera.bottom=-10;sun.shadow.bias=-.00035;this.scene.add(sun);
    const warm=new THREE.DirectionalLight(0xffb878,1.05);warm.position.set(8,5.5,-3);this.scene.add(warm);const blue=new THREE.DirectionalLight(0xb9eaff,.55);blue.position.set(-3,4,-8);this.scene.add(blue);
  }

  private cellPosition(row:number,col:number):THREE.Vector3{return new THREE.Vector3((col-1.5)*ART.board.gap,.29,(row-1.5)*ART.board.gap+ART.board.centerZ);}
  private readonly resize=():void=>{const w=window.innerWidth,h=window.innerHeight;this.renderer.setSize(w,h);this.camera.aspect=w/h;this.camera.fov=w<620?44:39;this.camera.updateProjectionMatrix();};
  private animate=():void=>{if(this.disposed)return;requestAnimationFrame(this.animate);const delta=Math.min(.033,this.clock.getDelta()),time=this.clock.elapsedTime;
    for(let i=this.tweens.length-1;i>=0;i--){const tw=this.tweens[i];tw.elapsed+=delta;const p=Math.min(1,tw.elapsed/tw.duration);tw.update(p);if(p>=1){tw.complete?.();this.tweens.splice(i,1);}}
    this.environment.update(time);this.effects.update(delta);this.tiles.forEach((tile,id)=>tile.animatedParts.forEach((part,j)=>{part.rotation.y+=delta*(.45+j*.15);part.rotation.z+=Math.sin(time*1.4+id+j)*.00035;}));
    const shake=this.cameraShake;this.cameraShake*=Math.pow(.015,delta);this.camera.position.copy(this.cameraHome);if(shake>.002){this.camera.position.x+=(Math.random()-.5)*shake;this.camera.position.y+=(Math.random()-.5)*shake*.45;}this.camera.lookAt(this.cameraTarget);this.renderer.render(this.scene,this.camera);
  };
  private easeOutBack(t:number):number{const c1=1.70158,c3=c1+1;return 1+c3*Math.pow(t-1,3)+c1*Math.pow(t-1,2);}
}
