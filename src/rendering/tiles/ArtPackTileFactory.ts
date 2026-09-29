import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { normalizePieceValue } from '../../config/themes';
import type { ArtThemeDefinition } from '../../config/artThemeSchema';
import { canLoadArtThemeModels, loadArtThemeGLB } from '../loaders/ArtThemeAssetLoader';
import type { TileVisual } from './TileFactory';

const INVISIBLE = new THREE.MeshBasicMaterial({visible:false,depthWrite:false});
const ENVELOPE = new THREE.BoxGeometry(1.48,2.52,1.43);
const LOADING_SHAPE = new THREE.OctahedronGeometry(.26,0);
/**
 * One model pipeline for ALL manifest-driven art themes.
 * Each rank is a self-contained GLB; sources are decoded and cached once per theme/rank.
 * Character mesh dimensions are separate from the invisible shared sizing proxy.
 */
export class ArtPackTileFactory {
  private readonly loader=new GLTFLoader();
  private readonly sourceCache=new Map<number,Promise<THREE.Group|null>>();
  private readonly glints=new Map<number,THREE.MeshStandardMaterial>();
  constructor(private readonly theme: ArtThemeDefinition){}
  warmup(values:number[]):void{
    if(!canLoadArtThemeModels())return;
    for(const value of values.slice(0,3))void this.load(normalizePieceValue(value));
  }
  create(value:number):TileVisual{
    const rank=normalizePieceValue(value);
    const tier=Math.max(0,Math.log2(rank)-1);
    const root=new THREE.Group();
    root.name=this.theme.id+'_character_'+rank;
    const proxy=new THREE.Mesh(ENVELOPE,INVISIBLE);
    proxy.name='portable silhouette sizing proxy';
    proxy.scale.y=1+tier*.05;
    proxy.position.y=2.52*proxy.scale.y*.5;
    root.add(proxy);
    let accent=this.glints.get(rank);
    if(!accent){
      accent=new THREE.MeshStandardMaterial({
        color:new THREE.Color(this.theme.render.accent),
        emissive:new THREE.Color(this.theme.render.secondary),
        emissiveIntensity:.26,roughness:.32,metalness:.18,
      });
      this.glints.set(rank,accent);
    }
    const loading=new THREE.Mesh(LOADING_SHAPE,accent);
    loading.position.y=.52;loading.name='temporary rank loading sparkle';
    root.add(loading);
    if(canLoadArtThemeModels())void this.load(rank).then(source=>{
      if(!source)return; // A failed asset cannot break the authoritative 2048 board.
      const copy=source.clone(true);
      const bounds=new THREE.Box3().setFromObject(copy);
      if(bounds.isEmpty())return;
      const box=bounds.getSize(new THREE.Vector3());
      const center=bounds.getCenter(new THREE.Vector3());
      const factor=Math.min(
        1.48/Math.max(.01,box.x),
        (2.43+tier*.11)/Math.max(.01,box.y),
        1.44/Math.max(.01,box.z),
      );
      copy.scale.setScalar(factor);
      copy.position.set(-center.x*factor,-bounds.min.y*factor+.015,-center.z*factor);
      copy.name='authored_GLTF_LOD_'+this.theme.id+'_'+rank;
      root.remove(loading);root.add(copy);
    });
    return {root,animatedParts:[]};
  }
  private load(value:number):Promise<THREE.Group|null>{
    if(!canLoadArtThemeModels())return Promise.resolve(null);
    const previous=this.sourceCache.get(value);
    if(previous)return previous;
    const file=this.theme.assets.tiles[String(value)];
    const promise=new Promise<THREE.Group|null>(resolve=>{
      if(!file){resolve(null);return}
      loadArtThemeGLB(this.loader,this.theme.id,file,result=>{
        const model=result.scene;
        model.traverse(obj=>{
          if(obj instanceof THREE.Mesh){
            obj.castShadow=false;obj.receiveShadow=false;obj.frustumCulled=true;
          }
        });
        resolve(model);
      },error=>{
        console.warn('[ArtPack] rank GLB not available',this.theme.id,value,error);
        resolve(null);
      });
    });
    this.sourceCache.set(value,promise);return promise;
  }
}

