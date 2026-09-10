import * as THREE from 'three';
import { ART } from '../../config/artDirection';

interface Particle { mesh: THREE.Mesh; velocity: THREE.Vector3; life: number; maxLife: number; }
interface RingEffect { mesh: THREE.Mesh; life: number; maxLife: number; }

export class Effects {
  private particles: Particle[] = [];
  private rings: RingEffect[] = [];
  constructor(private readonly parent: THREE.Object3D) {}

  merge(position: THREE.Vector3, value: number): void {
    const tier=Math.min(5,Math.max(1,Math.log2(value)-1));
    const count=5+tier*3;
    const color=value>=512?ART.colors.gold:value>=128?ART.colors.crystalBlue:0xffe6a2;
    for(let i=0;i<count;i++){
      const geometry=i%3===0?new THREE.BoxGeometry(.08,.08,.08):new THREE.SphereGeometry(.055,6,6);
      const material=new THREE.MeshStandardMaterial({color,roughness:.36,emissive:color,emissiveIntensity:value>=128?.22:.08});
      const p=new THREE.Mesh(geometry,material); p.position.copy(position).add(new THREE.Vector3(0,.65,0)); p.castShadow=true; this.parent.add(p);
      const angle=Math.random()*Math.PI*2,speed=.75+Math.random()*(.6+tier*.16),life=.4+Math.random()*.28;
      this.particles.push({mesh:p,velocity:new THREE.Vector3(Math.cos(angle)*speed,.95+Math.random()*(.6+tier*.15),Math.sin(angle)*speed),life,maxLife:life});
    }
    const ring=new THREE.Mesh(new THREE.RingGeometry(.34,.43,40),new THREE.MeshBasicMaterial({color,transparent:true,opacity:.55,side:THREE.DoubleSide,depthWrite:false}));
    ring.position.copy(position).add(new THREE.Vector3(0,.34,0)); ring.rotation.x=-Math.PI/2; this.parent.add(ring); this.rings.push({mesh:ring,life:.34,maxLife:.34});
  }

  spawn(position: THREE.Vector3): void {
    const ring=new THREE.Mesh(new THREE.RingGeometry(.28,.34,28),new THREE.MeshBasicMaterial({color:0xffffff,transparent:true,opacity:.36,side:THREE.DoubleSide,depthWrite:false}));
    ring.position.copy(position).add(new THREE.Vector3(0,.28,0));ring.rotation.x=-Math.PI/2;this.parent.add(ring);this.rings.push({mesh:ring,life:.24,maxLife:.24});
  }

  update(delta:number):void{
    for(let i=this.particles.length-1;i>=0;i--){const p=this.particles[i];p.life-=delta;p.velocity.y-=3.8*delta;p.mesh.position.addScaledVector(p.velocity,delta);const n=Math.max(0,p.life/p.maxLife);p.mesh.scale.setScalar(Math.max(.01,n));if(p.life<=0){p.mesh.removeFromParent();this.particles.splice(i,1);}}
    for(let i=this.rings.length-1;i>=0;i--){const r=this.rings[i];r.life-=delta;const progress=1-Math.max(0,r.life/r.maxLife);r.mesh.scale.setScalar(1+progress*2.2);if(r.mesh.material instanceof THREE.MeshBasicMaterial)r.mesh.material.opacity=(1-progress)*.55;if(r.life<=0){r.mesh.removeFromParent();this.rings.splice(i,1);}}
  }
}
