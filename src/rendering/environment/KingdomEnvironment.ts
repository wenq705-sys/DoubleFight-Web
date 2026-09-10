import * as THREE from 'three';
import { ART } from '../../config/artDirection';

const C = ART.colors;
const toon = (color: number) => new THREE.MeshToonMaterial({ color });
const standard = (color: number, roughness = 0.8, metalness = 0) => new THREE.MeshStandardMaterial({ color, roughness, metalness });
function addMesh(parent: THREE.Object3D, geometry: THREE.BufferGeometry, material: THREE.Material, position: [number, number, number]): THREE.Mesh {
  const value = new THREE.Mesh(geometry, material); value.position.set(...position); value.castShadow = true; value.receiveShadow = true; parent.add(value); return value;
}
const box = (p: THREE.Object3D, s: [number,number,number], c: number, pos: [number,number,number]) => addMesh(p, new THREE.BoxGeometry(...s), toon(c), pos);
const cyl = (p: THREE.Object3D, r: number, h: number, c: number, pos: [number,number,number], seg=16) => addMesh(p, new THREE.CylinderGeometry(r,r,h,seg), toon(c), pos);
const cone = (p: THREE.Object3D, r: number, h: number, c: number, pos: [number,number,number], seg=16) => addMesh(p, new THREE.ConeGeometry(r,h,seg), toon(c), pos);

export class KingdomEnvironment {
  readonly root = new THREE.Group();
  readonly flags: THREE.Object3D[] = [];
  private readonly water: THREE.Mesh;

  constructor() {
    this.root.name = 'KingdomEnvironment';
    box(this.root,[13.9,1.15,14.7],C.stoneShade,[0,-1.05,.72]);
    box(this.root,[13.35,.62,14.15],C.grass,[0,-.31,.72]);
    box(this.root,[11.65,.18,11.6],C.grassLight,[0,.06,.48]);
    this.createBoard(); this.createWalls(); this.createCastle(); this.createTrees(); this.createMountains(); this.createFlags();
    this.water = addMesh(this.root,new THREE.BoxGeometry(5.4,.09,2.8),new THREE.MeshStandardMaterial({color:C.water,roughness:.16,transparent:true,opacity:.76}),[0,-.55,-6.78]);
    const bridge = new THREE.Group(); bridge.position.set(0,-.22,-6.75); this.root.add(bridge);
    for(let z=-1.05;z<=1.05;z+=.35) box(bridge,[2.4,.13,.28],0xd9a35d,[0,0,z]);
  }

  update(time: number): void {
    this.flags.forEach((flag,index)=>{flag.rotation.z=-.07+Math.sin(time*2.1+index*.7)*.04; flag.scale.x=1+Math.sin(time*3+index)*.025;});
    if(this.water.material instanceof THREE.MeshStandardMaterial) this.water.material.opacity=.74+Math.sin(time*1.1)*.025;
  }

  private createBoard(): void {
    for(let row=0;row<4;row++) for(let col=0;col<4;col++) {
      const x=(col-1.5)*ART.board.gap, z=(row-1.5)*ART.board.gap+ART.board.centerZ;
      box(this.root,[2.18,.14,2.18],C.stoneShade,[x,.08,z]);
      box(this.root,[1.96,.16,1.96],(row+col)%2?0xa7d779:0xb6df87,[x,.18,z]);
    }
  }

  private createWalls(): void {
    for(let x=-5.8;x<=5.8;x+=1.18){box(this.root,[.94,.78,.72],C.stone,[x,.42,-5.55]);box(this.root,[.94,.78,.72],C.stone,[x,.42,6.9]);}
    for(let z=-4.45;z<=5.8;z+=1.18){box(this.root,[.72,.78,.94],C.stone,[-5.78,.42,z]);box(this.root,[.72,.78,.94],C.stone,[5.78,.42,z]);}
  }

  private createCastle(): void {
    const g=new THREE.Group(); g.position.z=6.45; this.root.add(g);
    box(g,[4.6,2.1,1.15],C.stone,[0,1,0]); box(g,[1.2,3,1.28],C.stone,[-2,1.35,-.02]); box(g,[1.2,3,1.28],C.stone,[2,1.35,-.02]);
    cyl(g,.82,3.1,C.stone,[-3.05,1.42,-.08]); cyl(g,.82,3.1,C.stone,[3.05,1.42,-.08]);
    cone(g,.96,1.42,C.coralLight,[-3.05,3.67,-.08]); cone(g,.96,1.42,C.royalBlueLight,[3.05,3.67,-.08]); cone(g,.88,1.28,C.royalBlueLight,[0,3.25,-.08]);
    box(g,[1.05,1.4,.18],C.woodDark,[0,.64,-.65]); for(let x=-2.1;x<=2.1;x+=.7) box(g,[.34,.38,.4],C.stone,[x,2.2,-.35]);
  }

  private createTrees(): void {
    const positions:[number,number,number][]=[[-5,-4.15,.95],[5,-4,1.08],[-5.1,4.75,1.03],[5.05,4.95,1],[-5.25,1.35,.82],[5.3,1.8,.9]];
    positions.forEach(([x,z,s],i)=>{const g=new THREE.Group();g.position.set(x,.2,z);g.scale.setScalar(s);this.root.add(g);cyl(g,.14,.8,C.woodDark,[0,.38,0],8);cone(g,.72,1.35,i%2?0x5eaf58:0x68bb5d,[0,1.18,0],10);cone(g,.56,1.15,0x82cf72,[0,1.74,0],10);});
  }

  private createMountains(): void {
    const a=new THREE.MeshToonMaterial({color:0xaadbf2,transparent:true,opacity:.72}), b=new THREE.MeshToonMaterial({color:0xb5dfcf,transparent:true,opacity:.62});
    const p:[number,number,number][]=[[-8.5,2.8,2.3],[-6.7,5.6,2],[7.1,4.9,2.4],[8.9,1.9,2.1],[-7.6,-1.3,1.8],[7.7,-1,1.7]];
    p.forEach(([x,z,s],i)=>{const m=addMesh(this.root,new THREE.ConeGeometry(s,s*3.4,4),i%2?a:b,[x,s*1.15,z]);m.rotation.y=Math.PI/4;m.castShadow=false;});
  }

  private createFlags(): void {
    const specs:[number,number,number][]=[[-5.35,-1.1,C.royalBlue],[5.35,-1.1,C.coral],[-5.35,3.95,C.royalBlue],[5.35,3.95,C.coral]];
    specs.forEach(([x,z,c])=>{cyl(this.root,.05,1.85,C.woodDark,[x,1,z],8);const f=addMesh(this.root,new THREE.BoxGeometry(.78,.44,.035),standard(c),[x+.38,1.63,z]);this.flags.push(f);});
  }
}
