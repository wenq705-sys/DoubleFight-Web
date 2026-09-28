import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {initial,spawn,move,canMove,level,names} from './game.js';
const $=s=>document.querySelector(s),canvas=$('#view'),status=$('#status'),perf=$('#perf');
const renderer=new THREE.WebGLRenderer({canvas,antialias:true,alpha:true,powerPreference:'high-performance'});
renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.3;
renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
const scene=new THREE.Scene(),camera=new THREE.OrthographicCamera(-4,4,5,-5,.1,100);
camera.position.set(7.6,11,10.5);camera.lookAt(0,0,0);
scene.add(new THREE.HemisphereLight(0xffe6b9,0x3c344f,2.8));
const key=new THREE.DirectionalLight(0xffd3a0,3);key.position.set(-3,8,4);key.castShadow=true;key.shadow.mapSize.set(1024,1024);key.shadow.camera.left=-6;key.shadow.camera.right=6;key.shadow.camera.top=6;key.shadow.camera.bottom=-6;scene.add(key);
const fill=new THREE.DirectionalLight(0x8aafff,1);fill.position.set(4,5,-3);scene.add(fill);
const root=new THREE.Group();scene.add(root);const loader=new GLTFLoader(),clock=new THREE.Clock();
const presets=[{name:'省电',dpr:1,shadow:false},{name:'标准',dpr:1.3,shadow:true},{name:'精细',dpr:1.8,shadow:true}];
let q=matchMedia('(pointer:coarse)').matches?0:1,frames=0,lastSample=performance.now(),angle=0,drag=false,startX=0,startY=0,rotating=false;
function setQuality(i){q=i;const p=presets[i];renderer.setPixelRatio(Math.min(devicePixelRatio,p.dpr));renderer.shadowMap.enabled=p.shadow;renderer.shadowMap.needsUpdate=true;key.shadow.mapSize.set(i===2?2048:1024,i===2?2048:1024);key.shadow.map?.dispose();key.shadow.map=null;renderer.setSize(innerWidth,innerHeight,false);$('#quality').textContent='画质：'+p.name;}
$('#quality').onclick=()=>setQuality((q+1)%3);setQuality(q);
const url=n=>import.meta.env.BASE_URL+'night-market/'+n+'.glb';
const load=n=>new Promise((ok,fail)=>loader.load(url(n),g=>ok(g.scene),undefined,fail));
const tiles=new THREE.Group();root.add(tiles);
let board=initial(),score=0,best=0,combo=0,over=false,won=false,mode='game',showcase=[],active=0,animations=[],sparks=[];
try{best=Number(localStorage.getItem('night-market-best')||0)||0;}catch{}
const colors=['#f6d8a4','#ffb96e','#ee9554','#df7252','#d65d50','#9bc5a1','#67b6a0','#58a9bd','#718bd2','#ad77c8','#edc76c'];
const materials=colors.map(c=>new THREE.MeshStandardMaterial({color:c,roughness:.54,metalness:.12}));
const geometry=new THREE.BoxGeometry(.79,.21,.79);
const borderGeometry=new THREE.BoxGeometry(.83,.055,.83);
const gold=new THREE.MeshStandardMaterial({color:0xf9d99a,metalness:.65,roughness:.34});
function labelTexture(value){
 const c=document.createElement('canvas');c.width=c.height=256;const x=c.getContext('2d');
 x.fillStyle='#422719';x.textAlign='center';x.textBaseline='middle';x.font='900 '+(value>=1024?79:value>=128?102:126)+'px system-ui';x.shadowColor='#fff0bf';x.shadowBlur=4;x.fillText(String(value),128,129);
 const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;return t;
}
const labelCache=new Map();
function tileObject(value){
 const l=level(value),g=new THREE.Group(),base=new THREE.Mesh(geometry,materials[l]);
 base.castShadow=true;base.receiveShadow=true;g.add(base);
 const trim=new THREE.Mesh(borderGeometry,gold);trim.position.y=-.10;g.add(trim);
 if(l>=3){const ornament=new THREE.Mesh(new THREE.TorusGeometry(.26,.025,5,16),gold);ornament.rotation.x=-Math.PI/2;ornament.position.y=.119;g.add(ornament);}
 if(l>=7){const crown=new THREE.Mesh(new THREE.ConeGeometry(.10,.16,5),gold);crown.position.set(.27,.20,-.27);g.add(crown);}
 if(!labelCache.has(value))labelCache.set(value,new THREE.MeshBasicMaterial({map:labelTexture(value),transparent:true,depthWrite:false}));
 const text=new THREE.Mesh(new THREE.PlaneGeometry(.66,.66),labelCache.get(value));text.rotation.x=-Math.PI/2;text.position.y=.116;g.add(text);
 g.userData.value=value;return g;
}
const pos=(r,c)=>new THREE.Vector3(c-1.5,.21,r-1.5);
function sync(animate=true,motions=[]){
 const old=new Map();for(const t of [...tiles.children]){old.set(t.userData.key,t);tiles.remove(t);}
 for(let r=0;r<4;r++)for(let c=0;c<4;c++)if(board[r][c]){
  const v=board[r][c],k=r+':'+c;let t=old.get(k);
  if(!t||t.userData.value!==v)t=tileObject(v);
  t.userData.key=k;const target=pos(r,c);t.position.copy(target);
  const motion=motions.find(m=>m.r===r&&m.c===c);
  if(animate&&motion&&!motion.merged&&(motion.from[0]!==r||motion.from[1]!==c)){const from=pos(...motion.from);t.position.copy(from);animations.push({object:t,start:performance.now(),duration:145,kind:'slide',from,to:target});}
  else if(animate&&(!old.has(k)||old.get(k).userData.value!==v)){t.scale.setScalar(.25);animations.push({object:t,start:performance.now(),duration:220,kind:'pop'});}
  tiles.add(t);
 }
 for(const t of old.values())if(!tiles.children.includes(t))t.traverse(o=>{if(o.geometry&&o.geometry!==geometry&&o.geometry!==borderGeometry&&o.geometry.type!=='PlaneGeometry')o.geometry.dispose()});
}
function hud(){ $('#score').textContent=score;$('#best').textContent=best;$('#combo').textContent=combo>1?'连击 ×'+combo:names[Math.min(10,Math.max(0,Math.floor(Math.log2(Math.max(2,Math.max(...board.flat()))))-1))];}
function particles(r,c,value){
 const p=pos(r,c);for(let i=0;i<Math.min(22,7+level(value)*2);i++){
  const m=new THREE.Mesh(new THREE.IcosahedronGeometry(.025+Math.random()*.027,0),i%3?gold:materials[level(value)]);m.position.copy(p);m.position.y+=.14;root.add(m);
  sparks.push({mesh:m,birth:performance.now(),vx:(Math.random()-.5)*2.5,vy:1.2+Math.random()*1.9,vz:(Math.random()-.5)*2.5});
 }
}
let audio=null,muted=false,musicEnabled=false,nextBeat=0,beat=0;
const melody=[262,330,392,523,392,330,294,392,440,587,440,349,330,392,523,659];
function musicFrame(){
 if(!musicEnabled||muted||!audio||audio.state!=='running')return;
 if(!nextBeat)nextBeat=audio.currentTime+.05;
 while(nextBeat<audio.currentTime+.15){
  const hz=melody[beat%melody.length],o=audio.createOscillator(),g=audio.createGain();
  o.type='triangle';o.frequency.value=hz;g.gain.setValueAtTime(.0001,nextBeat);
  g.gain.exponentialRampToValueAtTime(.013,nextBeat+.025);
  g.gain.exponentialRampToValueAtTime(.0001,nextBeat+.22);
  o.connect(g).connect(audio.destination);o.start(nextBeat);o.stop(nextBeat+.23);
  if(beat%4===0){const bass=audio.createOscillator(),v=audio.createGain();bass.type='sine';bass.frequency.value=hz/4;v.gain.setValueAtTime(.0001,nextBeat);v.gain.exponentialRampToValueAtTime(.022,nextBeat+.025);v.gain.exponentialRampToValueAtTime(.0001,nextBeat+.28);bass.connect(v).connect(audio.destination);bass.start(nextBeat);bass.stop(nextBeat+.29);}
  nextBeat+=.30;beat++;
 }
}
function sound(frequency=400,duration=.12,type='sine',volume=.06){
 if(muted)return;try{audio??=new (window.AudioContext||window.webkitAudioContext)();if(audio.state==='suspended')audio.resume();
 const osc=audio.createOscillator(),gain=audio.createGain(),now=audio.currentTime;osc.type=type;osc.frequency.setValueAtTime(frequency,now);osc.frequency.exponentialRampToValueAtTime(frequency*1.35,now+duration);
 gain.gain.setValueAtTime(volume,now);gain.gain.exponentialRampToValueAtTime(.001,now+duration);osc.connect(gain).connect(audio.destination);osc.start(now);osc.stop(now+duration);}catch{}
}
function banner(message){status.textContent=message;status.classList.remove('pulse');void status.offsetWidth;status.classList.add('pulse');}
function turn(dir){
 if(mode!=='game'||over)return;const result=move(board,dir);if(!result.moved)return;
 board=result.board;score+=result.score;combo=result.merges.length?combo+1:0;
 for(const m of result.merges){particles(m.r,m.c,m.value);sound(240+level(m.value)*75,.12,'triangle',.06);if(m.value>=2048&&!won){won=true;banner('🏆 夜市传奇达成！继续冲击更高纪录');setTimeout(()=>sound(880,.5,'sine',.09),160);}}
 if(!result.merges)sound(150,.045,'sine',.018);
 spawn(board);sync(true,result.motions);if(score>best){best=score;try{localStorage.setItem('night-market-best',String(best));}catch{}}
 hud();if(!canMove(board)){over=true;banner('夜市打烊 · 点击重新开局');$('#restart').textContent='重新挑战';}else if(result.merges.length&&!won)banner(combo>=3?'🔥 '+combo+' 连击 · '+result.score+' 分':'合成 +'+result.score);
}
function restart(){board=initial();spawn(board);spawn(board);score=0;combo=0;over=false;won=false;animations=[];sync(false);hud();banner('滑动棋盘 · 合成夜市传奇');$('#restart').textContent='重开';}
$('#restart').onclick=restart;
$('#mute').onclick=()=>{muted=!muted;$('#mute').textContent=muted?'开启音效':'静音';};
$('#music').onclick=()=>{musicEnabled=!musicEnabled;nextBeat=0;if(musicEnabled){sound(440,.03,'sine',.001);}$('#music').textContent=musicEnabled?'关闭音乐':'开启音乐';};
$('#mode').onclick=()=>{mode=mode==='game'?'showcase':'game';tiles.visible=mode==='game';showcase.forEach(p=>p.visible=false);if(mode==='showcase'){showcase[active].visible=true;banner('角色鉴赏 · 左右滑动旋转');$('#mode').textContent='返回游戏';$('#characters').hidden=false;}else{banner('滑动棋盘进行合成');$('#mode').textContent='角色鉴赏';$('#characters').hidden=true;}};
$('#characters').querySelectorAll('button').forEach((b,i)=>b.onclick=()=>{showcase.forEach(p=>p.visible=false);active=i;showcase[i].visible=true;banner(['街头团子','熊猫大厨','夜市牛王'][i]);});
const begin=e=>{drag=true;rotating=false;startX=e.clientX;startY=e.clientY;canvas.setPointerCapture(e.pointerId);};
canvas.addEventListener('pointerdown',begin);
canvas.addEventListener('pointermove',e=>{if(!drag)return;if(mode==='showcase'){angle+=(e.clientX-startX)*.006;startX=e.clientX;}});
function end(e){if(!drag)return;drag=false;if(mode!=='game')return;const dx=e.clientX-startX,dy=e.clientY-startY;if(Math.hypot(dx,dy)<22)return;turn(Math.abs(dx)>Math.abs(dy)?dx>0?'right':'left':dy>0?'down':'up');}
canvas.addEventListener('pointerup',end);canvas.addEventListener('pointercancel',()=>drag=false);
window.addEventListener('keydown',e=>{const dir={ArrowLeft:'left',ArrowRight:'right',ArrowUp:'up',ArrowDown:'down',a:'left',d:'right',w:'up',s:'down'}[e.key];if(dir){e.preventDefault();turn(dir);}});
try{
 const [b,environment,...characters]=await Promise.all(['board','environment','premium-dumpling','premium-panda','premium-ox'].map(load));
 for(const o of [b,environment]){o.traverse(n=>{if(n.isMesh){n.receiveShadow=true;n.castShadow=n!==environment;}});root.add(o);}
 showcase=characters;showcase.forEach(p=>{p.visible=false;p.position.set(0,.35,0);p.traverse(n=>{if(n.isMesh){n.castShadow=true;n.receiveShadow=true;}});root.add(p);});
 restart();banner('夜市开张！滑动合成棋子');
}catch(e){banner('资源加载失败：'+e.message);console.error(e);}
function frame(){
 const now=performance.now(),w=innerWidth,h=innerHeight,dpr=renderer.getPixelRatio();if(canvas.width!==Math.floor(w*dpr)||canvas.height!==Math.floor(h*dpr))renderer.setSize(w,h,false);
 const aspect=w/h,span=Math.max(8.2,7.8/aspect);camera.left=-span*aspect/2;camera.right=span*aspect/2;camera.top=span/2;camera.bottom=-span/2;camera.updateProjectionMatrix();
 root.rotation.y=mode==='showcase'?angle:0;
 for(let i=animations.length-1;i>=0;i--){const a=animations[i],t=Math.min(1,(now-a.start)/a.duration);if(a.kind==='slide')a.object.position.lerpVectors(a.from,a.to,1-Math.pow(1-t,3));else a.object.scale.setScalar(.25+.75*(1-Math.pow(1-t,3)));if(t>=1)animations.splice(i,1);}
 for(let i=sparks.length-1;i>=0;i--){const p=sparks[i],t=(now-p.birth)/1000;if(t>.6){root.remove(p.mesh);p.mesh.geometry.dispose();sparks.splice(i,1);continue;}p.mesh.position.x+=p.vx*.016;p.mesh.position.z+=p.vz*.016;p.mesh.position.y+=p.vy*.016;p.vy-=.07;p.mesh.scale.setScalar(Math.max(.01,1-t/.6));}
 if(mode==='showcase'&&showcase[active])showcase[active].position.y=.35+Math.sin(clock.getElapsedTime()*1.7)*.025;
 musicFrame();renderer.render(scene,camera);frames++;if(now-lastSample>=1000){const i=renderer.info.render;perf.textContent=Math.round(frames*1000/(now-lastSample))+' FPS | '+i.calls+' Draws\n'+i.triangles.toLocaleString()+' tris | DPR '+dpr.toFixed(1);frames=0;lastSample=now;}requestAnimationFrame(frame);
}frame();
