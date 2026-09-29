/**
 * LARGE-FORM stage silhouette layer; keeps 4x4 play footprint unobstructed.
 * Designed to make each night-market mood unmistakable on a 375px phone.
 * Material lighting by itself is too subtle: these are real add-on scene actors.
 */
import * as T from 'three';
const clamp=(a,min=0,max=1)=>Math.max(min,Math.min(max,a));
const petalsA=new T.Color(0xffa3a9),petalsB=new T.Color(0xffd9b7);
const jade=new T.Color(0x7fdace),gold=new T.Color(0xffd37a);
function radialTexture(){
  const c=document.createElement('canvas');c.width=c.height=128;
  const ctx=c.getContext('2d'),g=ctx.createRadialGradient(64,64,2,64,64,64);
  g.addColorStop(0,'rgba(255,251,220,1)');
  g.addColorStop(.12,'rgba(255,235,165,.94)');
  g.addColorStop(.32,'rgba(255,173,72,.54)');
  g.addColorStop(.65,'rgba(255,125,38,.17)');
  g.addColorStop(1,'rgba(255,115,20,0)');
  ctx.fillStyle=g;ctx.fillRect(0,0,128,128);return new T.CanvasTexture(c);
}
function sprite(map,x,y,z,size,col,opacity=0){
  const m=new T.SpriteMaterial({map,color:col,transparent:true,opacity,depthWrite:false,
    blending:T.AdditiveBlending,toneMapped:false});
  const sp=new T.Sprite(m);sp.position.set(x,y,z);sp.scale.set(size,size,1);
  sp.frustumCulled=false;return sp;
}
function circle(x,y,z,r,material){
  const pts=[];
  for(let i=0;i<=80;i++){
    const a=2*Math.PI*i/80;pts.push(new T.Vector3(x+r*Math.cos(a),y,z+r*Math.sin(a)));
  }
  return new T.Line(new T.BufferGeometry().setFromPoints(pts),material);
}
function flowerGroup(entries,tex){
  const g=new T.Group();
  const vs=[],colors=[],cv=new T.Color();
  const centers=[],cc=[];
  for(let fi=0;fi<entries.length;fi++){
    const {x,z}=entries[fi],scale=entries[fi].scale*1.84,y=-.11,petalN=7;
    for(let j=0;j<petalN;j++){
      const a=j*2*Math.PI/petalN+fi*.24;
      const dx=Math.cos(a),dz=Math.sin(a),tx=-dz,tz=dx;
      const rr=.15*scale,width=.077*scale;
      const center=[x+dx*.038,y+.020,z+dz*.038];
      const l=[x+dx*rr*.69+tx*width,y+.055,z+dz*rr*.69+tz*width];
      const tip=[x+dx*rr*1.35,y+.11*scale,z+dz*rr*1.35];
      const r=[x+dx*rr*.69-tx*width,y+.055,z+dz*rr*.69-tz*width];
      for(const v of [center,l,tip,center,tip,r]){
        vs.push(...v);cv.copy(j%2?petalsA:petalsB).multiplyScalar(1.15);
        colors.push(cv.r,cv.g,cv.b);
      }
    }
    centers.push(x,y+.047,z);
    cc.push(1,.83,.42);
    const halo=sprite(tex,x,.005,z,.90*scale,0xffbf65);
    halo.material.opacity=0;g.add(halo);
  }
  const geo=new T.BufferGeometry();
  geo.setAttribute('position',new T.Float32BufferAttribute(vs,3));
  geo.setAttribute('color',new T.Float32BufferAttribute(colors,3));
  geo.computeVertexNormals();
  const petals=new T.Mesh(geo,new T.MeshBasicMaterial({
    side:T.DoubleSide,vertexColors:true,transparent:true,opacity:0,depthWrite:false,
    toneMapped:false,blending:T.NormalBlending}));
  g.add(petals);
  const cgeo=new T.BufferGeometry();cgeo.setAttribute('position',new T.Float32BufferAttribute(centers,3));
  cgeo.setAttribute('color',new T.Float32BufferAttribute(cc,3));
  const core=new T.Points(cgeo,new T.PointsMaterial({vertexColors:true,size:.15,
    sizeAttenuation:true,transparent:true,opacity:0,
    depthWrite:false,blending:T.AdditiveBlending}));
  g.add(core);g.userData.fade=0;return g;
}
function cloudBanner(sign){
  const g=new T.Group(),v=[],colors=[],indices=[];
  const x=sign*3.70,z=-2.97;
  for(let i=0;i<=28;i++){
    const u=i/28;
    const xx=x+sign*.06*Math.sin(4*Math.PI*u),yy=.51+2.85*u,
       zz=z+.11*Math.sin(2*Math.PI*u);
    const width=.30*(1-.29*u);
    for(const w of [-1,1]){
      v.push(xx+w*width,yy,zz+.03*w*Math.sin(5*Math.PI*u));
      const col=i%5===0?[1,.74,.30]:[.98,.17,.13];colors.push(...col);
    }
    if(i<28){const n=i*2;indices.push(n,n+1,n+2,n+1,n+3,n+2);}
  }
  const geo=new T.BufferGeometry();
  geo.setAttribute('position',new T.Float32BufferAttribute(v,3));
  geo.setAttribute('color',new T.Float32BufferAttribute(colors,3));geo.setIndex(indices);
  geo.computeVertexNormals();
  const flag=new T.Mesh(geo,new T.MeshBasicMaterial({
    side:T.DoubleSide,vertexColors:true,transparent:true,opacity:0,depthWrite:false,toneMapped:false}));
  g.add(flag);
  const cap=new T.Mesh(new T.SphereGeometry(.09,9,7),
    new T.MeshBasicMaterial({color:0xffcf75,transparent:true,opacity:0,toneMapped:false}));
  cap.position.set(x,3.38,z);g.add(cap);
  return g;
}
function hangingLanterns(tex,mobile){
  const group=new T.Group(),n=mobile?5:8;
  const geo=new T.CylinderGeometry(.185,.203,.42,6),capGeo=new T.CylinderGeometry(.216,.216,.038,6);
  const base=new T.MeshBasicMaterial({color:0xffaf57,transparent:true,opacity:0,toneMapped:false});
  const capMat=new T.MeshBasicMaterial({color:0xf5c877,transparent:true,opacity:0,toneMapped:false});
  for(let i=0;i<n;i++){
    const a=i/n*2*Math.PI;
    const x=2.55*Math.sin(a),z=-4.33-.26*Math.cos(a);
    const h=4.03+.36*Math.sin(i*1.7);
    const lamp=new T.Group();lamp.position.set(x,h,z);
    const glass=new T.Mesh(geo,base.clone());lamp.add(glass);
    for(const dy of [-.218,.218]){
      const ring=new T.Mesh(capGeo,capMat.clone());ring.position.y=dy;lamp.add(ring);
    }
    const halo=sprite(tex,0,0,0,1.48,0xffb36a);lamp.add(halo);
    const tassel=new T.Mesh(new T.ConeGeometry(.037,.20,5),
      new T.MeshBasicMaterial({color:0xed4a3c,transparent:true,opacity:0,toneMapped:false}));
    tassel.position.y=-.33;lamp.add(tassel);
    group.add(lamp);
  }
  group.userData.fade=0;return group;
}
function festivalArc(tex){
  const group=new T.Group();const vs=[];
  for(let i=0;i<=76;i++){
    const u=i/76,x=-3.35+6.7*u;
    // Entire golden arch stays in the back, above the roof.
    const y=3.82+1.05*Math.sin(Math.PI*u);
    vs.push(new T.Vector3(x,y,-4.24));
  }
  const mat=new T.LineBasicMaterial({color:0xffca70,
    transparent:true,opacity:0,depthWrite:false,blending:T.AdditiveBlending,toneMapped:false});
  const arc=new T.Line(new T.BufferGeometry().setFromPoints(vs),mat);group.add(arc);
  for(let i=0;i<11;i++){
    const u=(i+.5)/11,x=-3.35+6.7*u,y=3.82+1.05*Math.sin(Math.PI*u);
    const gl=sprite(tex,x,y,-4.22,.84,0xffd989);group.add(gl);
  }
  group.userData.fade=0;return group;
}
export class NightMarketSpectacle{
  constructor(scene,{mobile=false}={}){
    this.scene=scene;this.root=new T.Group();
    this.root.name='STAGE SILHOUETTES | visible festival changes behind board';
    scene.add(this.root);this.mobile=mobile;this.t=0;
    this.tex=radialTexture();
    this.phases=[];
    const flowerSlots=[
      {x:-2.27,z:3.53,scale:1.25},{x:2.36,z:3.61,scale:1.10},
      {x:-3.15,z:2.32,scale:.98},{x:3.19,z:2.02,scale:1.0},
      {x:-.96,z:3.89,scale:.85},{x:1.08,z:3.90,scale:.85},
      {x:-3.43,z:-.45,scale:.90},{x:3.42,z:-.56,scale:.94},
      {x:-2.00,z:4.04,scale:.72},{x:2.10,z:4.05,scale:.72},
      {x:-3.38,z:-1.92,scale:.70},{x:3.39,z:-2.00,scale:.75},
    ];
    const phaseSlots=[flowerSlots.slice(0,2),flowerSlots.slice(2,6),
      flowerSlots.slice(6,8),flowerSlots.slice(8,12)];
    for(const slots of phaseSlots){
      const g=flowerGroup(mobile?slots.slice(0,Math.ceil(slots.length*.75)):slots,this.tex);
      this.root.add(g);this.phases.push(g);
    }
    this.banners=[cloudBanner(-1)];
    this.banners.forEach(b=>this.root.add(b));
    this.aerial=hangingLanterns(this.tex,mobile);this.root.add(this.aerial);
    this.arch=festivalArc(this.tex);this.root.add(this.arch);
    this.moonHalo=sprite(this.tex,3.05,1.9,-4.04,3.10,0xb5f9df);
    this.moonHalo.material.color.setHex(0x94eedd);this.root.add(this.moonHalo);
    // Four festival beacons sit beyond all four corner posts.
    this.beacons=[];
    for(const x of [-3.13,3.13])for(const z of [-3.13,3.13]){
      const sp=sprite(this.tex,x,1.34,z,2.05,0xffad5d);this.root.add(sp);
      this.beacons.push(sp);
    }
    this.waterVeil=new T.Group();this.root.add(this.waterVeil);
    for(const [x,z] of [[-1.7,3.72],[1.62,3.69],[-3.27,1.4],[3.33,1.35]]){
      const r=circle(x,-.13,z,.28,new T.LineBasicMaterial({
        color:0x88f3df,transparent:true,opacity:0,depthWrite:false,
        blending:T.AdditiveBlending}));
      this.waterVeil.add(r);
    }
    // Visibly growing golden trim: these sit on the EXTERIOR wooden apron, not in gameplay cells.
    this.trim=new T.Group();this.root.add(this.trim);
    const trimMat=()=>new T.MeshBasicMaterial({color:0xffd475,transparent:true,
      opacity:0,depthWrite:false,toneMapped:false,blending:T.AdditiveBlending});
    this.frontTrim=new T.Mesh(new T.BoxGeometry(5.14,.047,.031),trimMat());
    this.frontTrim.position.set(0,.487,2.753);this.trim.add(this.frontTrim);
    this.topTrim=new T.Mesh(new T.BoxGeometry(5.13,.018,.026),trimMat());
    this.topTrim.position.set(0,.860,2.566);this.trim.add(this.topTrim);
    this.roofTrim=new T.Mesh(new T.BoxGeometry(5.15,.037,.041),trimMat());
    this.roofTrim.position.set(0,2.48,-2.782);this.trim.add(this.roofTrim);
    this.frontGlimmers=[];
    for(let i=0;i<9;i++){
      const x=-2.18+i*.545;
      const f=sprite(this.tex,x,.51,2.79,.53,0xffd077);
      this.root.add(f);this.frontGlimmers.push(f);
    }
    // Stage 4 celestial moon, behind the whole building, never in the 4x4 picking plane.
    this.heaven=new T.Group();this.root.add(this.heaven);
    const moonMaterial=new T.MeshBasicMaterial({color:0xffecc0,transparent:true,
      opacity:0,depthWrite:false,toneMapped:false,side:T.DoubleSide});
    this.skyMoon=new T.Mesh(new T.CircleGeometry(.78,48),moonMaterial);
    this.skyMoon.position.set(2.72,4.15,-5.15);this.heaven.add(this.skyMoon);
    this.skyMoonHalo=sprite(this.tex,2.72,4.15,-5.08,3.10,0xffca74);
    this.heaven.add(this.skyMoonHalo);
    this.skyMoonRing=new T.Mesh(new T.TorusGeometry(.91,.027,6,64),
      new T.MeshBasicMaterial({color:0xffd18a,transparent:true,opacity:0,
        depthWrite:false,toneMapped:false,blending:T.AdditiveBlending}));
    this.skyMoonRing.position.set(2.72,4.15,-5.04);this.heaven.add(this.skyMoonRing);
    // Night market becomes a celebration: firework sunbursts are above, BEHIND the stall.
    this.fireworks=[];
    for(let star=0;star<2;star++){
      const cx=star===0?-2.68:2.37,cy=star===0?4.05:4.89,cz=-4.72;
      const verts=[];
      for(let i=0;i<12;i++){
        const a=Math.PI*2*i/12,inner=.14,outer=.48+(i%3)*.07;
        verts.push(cx+inner*Math.cos(a),cy+inner*Math.sin(a),cz,
                   cx+outer*Math.cos(a),cy+outer*Math.sin(a),cz);
      }
      const geo=new T.BufferGeometry();
      geo.setAttribute('position',new T.Float32BufferAttribute(verts,3));
      const lines=new T.LineSegments(geo,new T.LineBasicMaterial({color:star?0xffddb0:0xff957c,
        transparent:true,opacity:0,depthWrite:false,toneMapped:false,
        blending:T.AdditiveBlending}));
      this.heaven.add(lines);this.fireworks.push(lines);
      const core=sprite(this.tex,cx,cy,cz,.83,star?0xffd38a:0xff958a);
      this.heaven.add(core);this.fireworks.push(core);
    }
    // Whole foreground pond reveals dancing soft-jade currents after Stage 2.
    this.pondCurrents=new T.Group();this.root.add(this.pondCurrents);
    for(let k=0;k<8;k++){
      const points=[];
      const z=3.35+k*.134;
      for(let i=0;i<=36;i++){
        const t=i/36,x=-3.22+6.44*t;
        points.push(new T.Vector3(x,-.139,z+.035*Math.sin(t*5*Math.PI+k*.4)));
      }
      const current=new T.Line(new T.BufferGeometry().setFromPoints(points),
        new T.LineBasicMaterial({color:0x9af6db,transparent:true,opacity:0,
          depthWrite:false,toneMapped:false,blending:T.AdditiveBlending}));
      this.pondCurrents.add(current);
    }
    this.victoryBurst=new T.Group();this.root.add(this.victoryBurst);
    const pts=[],cols=[];
    for(let i=0;i<(mobile?32:60);i++){
      const a=2*Math.PI*(i+.18)/ (mobile?32:60);
      const radius=1.7+2.1*(i%4)/4,fy=.35+i%5*.25;
      const x=radius*Math.cos(a),z=-4.20+radius*.33*Math.sin(a);
      pts.push(x,fy+3.0,z);
      const c=i%3===0?gold:(i%3===1?jade:petalsB);
      cols.push(c.r,c.g,c.b);
    }
    const geo=new T.BufferGeometry();
    geo.setAttribute('position',new T.Float32BufferAttribute(pts,3));
    geo.setAttribute('color',new T.Float32BufferAttribute(cols,3));
    const points=new T.Points(geo,new T.PointsMaterial({size:.12,vertexColors:true,
      transparent:true,opacity:0,depthWrite:false,blending:T.AdditiveBlending}));
    this.victoryBurst.add(points);
    this.latestState=null;
  }
  update(dt,state){
    this.t+=dt;this.latestState=state;
    // The four phase progressions are separated perceptually even at 375 CSS pixels.
    const l=state.lantern;
    const intensities=[
      clamp((l-.19)/.24),
      clamp((l-.47)/.30),
      clamp((l-.84)/.33),
      clamp((l-1.20)/.28),
    ];
    this.phases.forEach((g,i)=>{
      const target=intensities[i],strength=target*(.86+.14*Math.sin(this.t*1.1+i)**2);
      g.userData.fade=strength;
      g.visible=strength>.002;
      for(const ch of g.children){
        if(ch.material)ch.material.opacity=ch.isSprite?strength*.49:strength;
      }
    });
    const stage2=intensities[1];
    const stage3=intensities[2],stage4=intensities[3];
    for(const b of this.banners){
      b.visible=stage3>.003;
      for(const ch of b.children)ch.material.opacity=stage3*(ch.isMesh ? .82 : 1);
      b.rotation.y=.012*Math.sin(this.t*1.6);
    }
    this.frontTrim.material.opacity=clamp(stage2*.53+stage3*.24+stage4*.21);
    this.topTrim.material.opacity=clamp(stage2*.36+stage3*.22+stage4*.35);
    this.roofTrim.material.opacity=clamp(stage2*.32+stage3*.30+stage4*.30);
    for(let i=0;i<this.frontGlimmers.length;i++){
      const f=this.frontGlimmers[i];
      f.material.opacity=clamp(stage2*.12+stage3*.26+stage4*.30)*
        (.73+.27*Math.sin(this.t*2+i*.57)**2);
    }
    this.pondCurrents.visible=stage2>.01;
    for(let i=0;i<this.pondCurrents.children.length;i++){
      this.pondCurrents.children[i].material.opacity=clamp(
        stage2*.16+stage3*.19+stage4*.16)*(.66+.34*Math.sin(this.t*1.65+i*.64)**2);
    }
    this.heaven.visible=stage4>.001;
    this.skyMoon.material.opacity=stage4*.77;
    this.skyMoonHalo.material.opacity=stage4*.76;
    this.skyMoonRing.material.opacity=stage4*.90;
    this.skyMoonRing.scale.setScalar(1+.04*Math.sin(this.t*1.2));
    for(const f of this.fireworks)f.material.opacity=
      stage4*(.50+.43*Math.sin(this.t*2.3)**2);
    this.aerial.visible=stage3>.003;
    for(let i=0;i<this.aerial.children.length;i++){
      const lamp=this.aerial.children[i];lamp.position.y+=
        dt*.022*Math.sin(this.t*.6+i*.7);
      for(const ch of lamp.children)if(ch.material)
        ch.material.opacity=stage3*(ch.isSprite ? .93 : 1);
    }
    this.arch.visible=stage4>.003;
    for(const ch of this.arch.children)if(ch.material)
      ch.material.opacity=stage4*(ch.isSprite ? .78 : .92);
    this.moonHalo.material.opacity=clamp(.015+state.moon*.53+state.victory*.34);
    this.moonHalo.scale.setScalar(2.10+state.moon*.70+state.victory*.47);
    for(let i=0;i<this.beacons.length;i++){
      this.beacons[i].material.opacity=clamp(.012+l*.39+
        state.pulse*.14,.0,.73);
    }
    for(let i=0;i<this.waterVeil.children.length;i++){
      const o=this.waterVeil.children[i],u=(this.t*.16+i*.21)%1;
      o.scale.setScalar(.35+2.0*u);
      o.material.opacity=clamp(state.water*.62*(1-u),0,.7);
    }
    const burst=this.victoryBurst.children[0];
    burst.material.opacity=clamp(state.victory*1.2,0,1);
    burst.scale.setScalar(1+state.victory*.35);
  }
  dispose(){
    this.root.parent?.remove(this.root);
    const meshes=new Set(),mats=new Set();
    this.root.traverse(o=>{
      if(o.geometry)meshes.add(o.geometry);
      if(o.material)for(const m of Array.isArray(o.material)?o.material:[o.material])mats.add(m);
    });
    meshes.forEach(g=>g.dispose());mats.forEach(m=>m.dispose());this.tex.dispose();
  }
}

