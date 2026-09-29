/**
 * Night-market scene adapter for the five-stage ThemeMoodDirector.
 * Binds to two already exported GLBs. All animated geometry is intentionally
 * low-cost and located outside the unobstructed 4x4 gameplay area.
 */
import * as T from 'three';
import {NightMarketSpectacle} from './theme-stage-spectacle.mjs?v=mood-visible-v3';
const clamp=(x,a=0,b=1)=>Math.min(b,Math.max(a,x));
const seeded=(i,k=0)=>{const v=Math.sin((i+1)*127.1+(k+1)*311.7)*43758.5453123;return v-Math.floor(v)};
function tagMaterial(m){
  const n=m.name.toLowerCase();
  if(n.includes('lantern golden illumination'))return 'lantern';
  if(n.includes('warm ivory rice paper'))return 'paper';
  if(n.includes('mint celadon inset'))return 'jade';
  if(n.includes('turquoise ripples')||n.includes('deep teal still water'))return 'water';
  if(n.includes('warm aged imperial gilt')||n.includes('burnished pale gold'))return 'gold';
  if(n.includes('lotus center glowing coral'))return 'lotus';
  return '';
}
function makeParticles(count,color,size,seed,mode){
  const arr=new Float32Array(count*3),speed=new Float32Array(count);
  for(let i=0;i<count;i++){
    const side=i%4,a=seeded(i,seed),b=seeded(i,seed+3);
    let x=0,z=0;
    if(side===0){x=-2.86-a*.85;z=-3.9+7.8*b}
    if(side===1){x= 2.86+a*.85;z=-3.9+7.8*b}
    if(side===2){z=-3.26-a*.45;x=-3.7+7.4*b}
    if(side===3){z= 3.26+a*.45;x=-3.7+7.4*b}
    arr[3*i]=x;arr[3*i+1]=mode==='petal'?1+seeded(i,seed+10)*3.5:
      .14+seeded(i,seed+10)*3;arr[3*i+2]=z;
    speed[i]=(mode==='petal'?.11:.16)+seeded(i,seed+7)*(mode==='petal'?.21:.24);
  }
  const geo=new T.BufferGeometry();geo.setAttribute('position',new T.BufferAttribute(arr,3));
  geo.setDrawRange(0,0);
  const mat=new T.PointsMaterial({color,size,transparent:true,opacity:0,
    sizeAttenuation:true,depthWrite:false,blending:T.AdditiveBlending});
  const points=new T.Points(geo,mat);points.frustumCulled=false;
  return {points,geo,mat,arr,speed,count,mode};
}
function ring(radius,color,opacity=0,tubular=72){
  const obj=new T.Mesh(new T.TorusGeometry(radius,.018,6,tubular),
    new T.MeshBasicMaterial({color,transparent:true,opacity,depthWrite:false,
      blending:T.AdditiveBlending}));
  obj.frustumCulled=false;return obj;
}
export class ThemeStageVisual{
  constructor({scene,boardRoot,envRoot,renderer,mobile=false,sun=null,hemi=null,fill=null}){
    this.scene=scene;this.boardRoot=boardRoot;this.envRoot=envRoot;this.renderer=renderer;
    this.mobile=mobile;this.t=0;this.materials=[];this.sun=sun;this.hemi=hemi;this.fill=fill;
    this.root=new T.Group();this.root.name='ThemeStageVFX | no collision with game slots';
    scene.add(this.root);
    this.spectacle=new NightMarketSpectacle(scene,{mobile});
    this.root.add(this.spectacle.root);
    this.portal=ring(.845,0x98ffd8);this.portal.position.set(3.05,1.90,-4.04);
    this.root.add(this.portal);
    this.portalInner=ring(.756,0xffdfa2);this.portalInner.position.set(3.05,1.90,-4.018);
    this.root.add(this.portalInner);
    this.portalBloom=new T.Mesh(new T.TorusGeometry(.846,.075,5,72),
      new T.MeshBasicMaterial({color:0x83f9d2,transparent:true,opacity:0,
        depthWrite:false,blending:T.AdditiveBlending}));
    this.portalBloom.position.set(3.05,1.90,-4.045);
    this.root.add(this.portalBloom);
    this.portalLight=new T.PointLight(0xa6ffde,0,3.25,2);
    this.portalLight.position.set(3.05,2.05,-3.82);this.root.add(this.portalLight);
    this.lanternLights=[];
    for(const x of [-2.97,2.97]){
      for(const z of [-2.92,2.92]){
        if(this.mobile&&z<0)continue;
        const light=new T.PointLight(0xffb56b,0,2.95,2);
        light.position.set(x,1.32,z);this.root.add(light);this.lanternLights.push(light);
      }
    }
    // Fake localized halo sprites: portable to low-end mobile, no heavyweight postprocessing.
    const canvas=document.createElement('canvas');canvas.width=64;canvas.height=64;
    const cx=canvas.getContext('2d');
    const grad=cx.createRadialGradient(32,32,3,32,32,31);
    grad.addColorStop(0,'rgba(255,245,207,1)');
    grad.addColorStop(.25,'rgba(255,188,93,.58)');
    grad.addColorStop(.56,'rgba(255,133,47,.20)');
    grad.addColorStop(1,'rgba(255,115,19,0)');
    cx.fillStyle=grad;cx.fillRect(0,0,64,64);
    this.glowTexture=new T.CanvasTexture(canvas);
    this.lanternSprites=[];
    for(const x of [-2.97,2.97]){
      for(const z of [-2.92,2.92]){
        const m=new T.SpriteMaterial({map:this.glowTexture,color:0xffe1a2,opacity:0,
          transparent:true,depthWrite:false,blending:T.AdditiveBlending});
        const sp=new T.Sprite(m);sp.position.set(x,1.28,z);
        sp.scale.set(.91,.91,1);this.root.add(sp);this.lanternSprites.push(sp);
      }
    }
    for(let i=0;i<6;i++){
      const m=new T.SpriteMaterial({map:this.glowTexture,color:0xffc376,opacity:0,
        transparent:true,depthWrite:false,blending:T.AdditiveBlending});
      const sp=new T.Sprite(m);sp.position.set(-2.03+i*.81,2.36,-2.81);
      sp.scale.set(.52,.52,1);this.root.add(sp);this.lanternSprites.push(sp);
    }
    const pts=[[-2.51,.876,-2.51],[2.51,.876,-2.51],[2.51,.876,2.51],
      [-2.51,.876,2.51],[-2.51,.876,-2.51]].map(p=>new T.Vector3(...p));
    this.boardGlow=new T.Line(new T.BufferGeometry().setFromPoints(pts),
      new T.LineBasicMaterial({color:0xffce80,transparent:true,opacity:.04,
        depthWrite:false,blending:T.AdditiveBlending}));
    this.root.add(this.boardGlow);
    const dotGeo=new T.SphereGeometry(.046,8,6);
    this.flowDots=[];
    for(let i=0;i<(mobile?2:4);i++){
      const dot=new T.Mesh(dotGeo,new T.MeshBasicMaterial({color:0xffd998,
        transparent:true,opacity:0,depthWrite:false,blending:T.AdditiveBlending}));
      dot.position.y=.889;this.root.add(dot);this.flowDots.push(dot);
    }
    const haloGeo=new T.RingGeometry(.29,.313,54);
    this.ripples=[];
    for(const [x,z] of [[-3.15,3.66],[3.15,3.45],[-3.22,.70],[3.23,.40]]){
      const mat=new T.MeshBasicMaterial({color:0x9be9e1,side:T.DoubleSide,
        transparent:true,opacity:0,depthWrite:false,blending:T.AdditiveBlending});
      const mesh=new T.Mesh(haloGeo,mat);mesh.rotation.x=-Math.PI/2;
      mesh.position.set(x,-.139,z);this.root.add(mesh);this.ripples.push(mesh);
    }
    this.petals=makeParticles(this.mobile?34:70,0xffbecd,.088,3,'petal');
    this.sparkles=makeParticles(this.mobile?24:55,0xffdfaa,.066,7,'spark');
    this.root.add(this.petals.points,this.sparkles.points);
    this.burst=ring(.30,0xffda8d);this.burst.rotation.x=-Math.PI/2;
    this.burst.position.set(0,.914,0);this.root.add(this.burst);
    this.burstAge=10;this.burstPower=0;
    this.baseBG=new T.Color(0x171c28);
    this.festivalBG=new T.Color(0x30202c);
    this.waterHighlight=new T.Color(0x80dae5);
    this.bindEnvironment(envRoot);this.bindBoard(boardRoot);
  }
  bindEnvironment(environment){
    this.envRoot=environment;this.materials=this.materials.filter(x=>x.layer!=='environment');
    if(environment)this.registerMaterials(environment,'environment');
  }
  bindBoard(board){this.boardRoot=board;this.materials=this.materials.filter(x=>x.layer!=='board');
    if(board)this.registerMaterials(board,'board');}
  registerMaterials(root,layer){
    const seen=new Set();
    root.traverse(obj=>{
      if(!obj.isMesh)return;
      const mats=Array.isArray(obj.material)?obj.material:[obj.material];
      for(const m of mats){
        if(!m||seen.has(m))continue;seen.add(m);
        const tag=tagMaterial(m);
        if(!tag)continue;
        const original={intensity:m.emissiveIntensity??0,
          color:m.color?.clone?.(),emissive:m.emissive?.clone?.()};
        this.materials.push({m,tag,original,layer});
      }
    });
  }
  moment(event){
    if(event?.type==='merge'||event?.type==='bigMerge'||event?.type==='combo'||event?.type==='victory'){
      const cell=event.cell;
      if(cell&&Number.isFinite(cell.row)&&Number.isFinite(cell.column)){
        const spacing=1.065;
        this.burst.position.x=(cell.column-1.5)*spacing;
        this.burst.position.z=(cell.row-1.5)*spacing;
      }else{this.burst.position.x=0;this.burst.position.z=0}
      this.burstAge=0;
      this.burstPower=event.type==='victory'?2.0:event.type==='combo'?1.25:
        event.type==='bigMerge'?1.05:.55;
    }
  }
  update(dt,s){
    this.t+=dt;const pulse=clamp(s.pulse,0,1.5),fest=s.festival;
    this.renderer.toneMappingExposure=.79+.49*fest+.055*pulse;
    if(this.sun)this.sun.intensity=1.48+1.77*fest+.20*pulse;
    if(this.hemi)this.hemi.intensity=1.32+1.32*fest;
    if(this.fill)this.fill.intensity=.59+.65*fest;
    this.scene.background.copy(this.baseBG).lerp(this.festivalBG,clamp(fest*.50+.08*pulse));
    for(const {m,tag,original} of this.materials){
      if(!m?.emissive)continue;
      if(tag==='lantern'||tag==='paper'){
        m.emissive.setHex(tag==='lantern'?0xffad4d:0xffdba0);
        m.emissiveIntensity=(tag==='lantern'?.14:.045)+
          s.lantern*(tag==='lantern'?.76:.25)+pulse*.19;
      }else if(tag==='gold'){
        m.emissive.setHex(0xffc272);m.emissiveIntensity=.015+s.gold*.19+pulse*.09;
      }else if(tag==='jade'){
        m.emissive.setHex(0x69efd1);m.emissiveIntensity=.009+s.moon*.11;
      }else if(tag==='water'){
        m.emissive.setHex(0x50b8d1);m.emissiveIntensity=.015+s.water*.24;
        if(original.color)m.color.copy(original.color).lerp(this.waterHighlight,
          Math.min(.26,s.water*.20));
      }else if(tag==='lotus'){
        m.emissive.setHex(0xffd29a);m.emissiveIntensity=.13+s.moon*.49;
      }
    }
    const oscillation=Math.sin(this.t*1.65)*.055;
    this.portal.material.opacity=clamp(.012+s.moon*.30+s.victory*.46+pulse*.11,0,.88);
    this.portalInner.material.opacity=clamp(.005+s.moon*.24+s.victory*.38,0,.84);
    this.portal.scale.setScalar(1+.007*Math.sin(this.t*2.0)+.025*pulse+.06*s.victory);
    this.portalInner.scale.setScalar(1+.012*Math.cos(this.t*1.4)+.022*s.victory);
    this.portalLight.intensity=.01+s.moon*.67+s.victory*1.1;
    this.portalBloom.material.opacity=clamp(.008+s.moon*.23+s.victory*.34,0,.72);
    this.portalBloom.scale.setScalar(1+.02*s.victory+.010*Math.sin(this.t*2.1));
    for(const sprite of this.lanternSprites)
      sprite.material.opacity=clamp(.025+s.lantern*.35+pulse*.12,0,.86);
    this.boardGlow.material.opacity=clamp(.02+s.gold*.37+.20*pulse+s.victory*.24,0,.9);
    for(let i=0;i<this.lanternLights.length;i++)
      this.lanternLights[i].intensity=.06+s.lantern*.39+oscillation*.15;
    for(let i=0;i<this.flowDots.length;i++){
      const dot=this.flowDots[i],u=(this.t*(.10+.035*s.festival)+i/this.flowDots.length)%1;
      let x=0,z=0;
      if(u<.25){x=-2.51+5.02*u*4;z=-2.51}
      else if(u<.5){x=2.51;z=-2.51+5.02*(u-.25)*4}
      else if(u<.75){x=2.51-5.02*(u-.5)*4;z=2.51}
      else{x=-2.51;z=2.51-5.02*(u-.75)*4}
      dot.position.x=x;dot.position.z=z;
      dot.material.opacity=clamp((s.gold-.18)*.95+pulse*.23,0,.9);
      dot.visible=s.gold>.18;
    }
    for(let i=0;i<this.ripples.length;i++){
      const r=this.ripples[i],u=(this.t*(.18+.05*i)+i*.23)%1;
      r.scale.setScalar(.67+u*.88);
      r.material.opacity=(.02+s.water*.28)*(1-u)*(.82+.18*Math.sin(this.t*2+i)**2);
    }
    this.updateParticles(this.petals,dt,s.petals,.65);
    this.updateParticles(this.sparkles,dt,s.sparkles,.68);
    this.spectacle.update(dt,s);
    this.burstAge+=dt;
    const burstT=this.burstAge/(.76+.22*this.burstPower);
    this.burst.visible=burstT<1;
    if(this.burst.visible){
      this.burst.scale.setScalar(.42+burstT*3.5*this.burstPower);
      this.burst.material.opacity=(1-burstT)**1.7*Math.min(.85,this.burstPower*.42);
    }
    // A special delayed second outward wave for a fresh 2048 victory.
    if(s.victoryTriggered&&s.victoryAge<1.65)
      this.portalInner.material.opacity=Math.max(this.portalInner.material.opacity,
        Math.sin(Math.PI*s.victoryAge/1.65)*.73);
  }
  updateParticles(p,dt,level,maxOpacity){
    const count=Math.min(p.count,Math.round(level*p.count));
    p.geo.setDrawRange(0,count);p.mat.opacity=level*maxOpacity;
    for(let i=0;i<count;i++){
      const k=3*i;
      p.arr[k+1]+=(p.mode==='petal'?-1:1)*p.speed[i]*dt;
      p.arr[k]+=(p.mode==='petal'?.11:.03)*dt*Math.sin(this.t*.8+i*.4);
      if(p.mode==='petal'&&p.arr[k+1]<-.12)p.arr[k+1]=3.5+seeded(i,11);
      if(p.mode==='spark'&&p.arr[k+1]>3.8)p.arr[k+1]=.10;
    }
    p.geo.attributes.position.needsUpdate=true;
  }
  dispose(){
    this.spectacle.dispose();
    this.root.parent?.remove(this.root);
    for(const r of [...this.ripples,this.portal,this.portalInner,this.portalBloom,this.boardGlow,this.burst])
      r.material.dispose();
    this.ripples[0]?.geometry.dispose();this.portal.geometry.dispose();
    this.portalInner.geometry.dispose();this.portalBloom.geometry.dispose();
    this.boardGlow.geometry.dispose();this.burst.geometry.dispose();
    for(const sprite of this.lanternSprites)sprite.material.dispose();
    this.glowTexture.dispose();
    for(const dot of this.flowDots)dot.material.dispose();
    this.flowDots[0]?.geometry.dispose();
    for(const p of [this.petals,this.sparkles]){p.geo.dispose();p.mat.dispose()}
  }
}

