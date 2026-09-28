import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
const $=s=>document.querySelector(s),canvas=$('#view');
const renderer=new THREE.WebGLRenderer({canvas,antialias:true,powerPreference:'high-performance'});
renderer.setPixelRatio(Math.min(devicePixelRatio,1.8));renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.32;
const scene=new THREE.Scene(),camera=new THREE.OrthographicCamera(-6,6,6,-6,.1,100);
camera.position.set(10,12,16);camera.lookAt(0,.5,0);
scene.add(new THREE.HemisphereLight(0xffe4bb,0x403550,3.2));
const key=new THREE.DirectionalLight(0xffc887,3.6);key.position.set(-4,9,5);scene.add(key);
const fill=new THREE.DirectionalLight(0x8baeff,1.4);fill.position.set(5,5,-4);scene.add(fill);
const root=new THREE.Group();scene.add(root);const loader=new GLTFLoader();
const load=n=>new Promise((ok,fail)=>loader.load(import.meta.env.BASE_URL+'night-market/'+n+'.glb',g=>ok(g.scene),undefined,fail));
const flagship=['flagship-02-dumpling','flagship-64-chef','flagship-2048-king'];
const flagshipNames=['2 · 蒸笼团子铺','64 · 熊猫名厨馆','2048 · 夜市王座'];
const collection=['01-night-newcomer','02-candied-hawthorn','03-raccoon-grill','04-lantern-rabbit','05-fox-teahouse','06-panda-chef','07-opera-diva','08-golden-toad','09-dragon-boat','10-phoenix-pavilion','11-night-market-king'];
const collectionNames=['糯米团子','糖葫芦小贩','烤串狸猫','灯笼兔','茶馆狐狸','熊猫大厨','戏台花旦','金蟾掌柜','龙舟将军','凤凰阁主','夜市牛王'];
let sets=[[],[]],which=0,selected=-1,angle=0,drag=false,lastX=0,zoom=1,environment=null,board=null,sceneMode=false;
function layout(){
 sets.forEach((group,k)=>group.forEach((f,i)=>{
  const shown=k===which&&(selected<0||selected===i);f.visible=shown;
  if(!shown)return;
  const count=group.length;
  const x=selected>=0?0:k===0?(i-1)*2.55:((i%4)-1.5)*1.55;
  const z=selected>=0?0:k===0?0:(Math.floor(i/4)-1)*1.68;
  f.userData.target=new THREE.Vector3(x,.18,z);f.userData.targetScale=selected>=0?1.42:k===0?.85:.72;
 }));
 const labels=which===0?flagshipNames:collectionNames;
 $('#status').textContent=selected<0?(which===0?'三件精致标杆 · 完整微缩场景':'11 件独立造型 · 题材探索'):labels[selected];
 $('#selected').textContent=selected<0?'全系列':labels[selected];
 $('#series').textContent=which===0?'查看 11 阶造型':'查看精致标杆';
}
function select(i){selected=i;layout();}
$('#all').onclick=()=>select(-1);
$('#previous').onclick=()=>select(selected<0?(sets[which].length-1):(selected+sets[which].length-1)%sets[which].length);
$('#next').onclick=()=>select((selected+1)%sets[which].length);
$('#series').onclick=()=>{which=1-which;selected=-1;zoom=1;layout();};
$('#setting').onclick=()=>{sceneMode=!sceneMode;if(environment)environment.visible=sceneMode;if(board)board.visible=sceneMode;$('#setting').textContent=sceneMode?'隐藏夜市':'展示夜市';};
try{
 [board,environment]=await Promise.all(['board','environment'].map(load));root.add(board,environment);board.visible=false;environment.visible=false;
 for(const [k,names] of [[0,flagship],[1,collection]]){
  for(const name of names){const f=await load(name);f.scale.setScalar(.75);f.userData.targetScale=.75;f.userData.target=new THREE.Vector3();root.add(f);sets[k].push(f);$('#loading').textContent='精品资产载入 '+(sets[0].length+sets[1].length)+'/14';}
 }
 $('#loading').hidden=true;layout();
}catch(e){$('#loading').textContent='模型加载异常：'+e.message;console.error(e);}
canvas.addEventListener('pointerdown',e=>{drag=true;lastX=e.clientX;canvas.setPointerCapture(e.pointerId);});
canvas.addEventListener('pointermove',e=>{if(drag){angle+=(e.clientX-lastX)*.006;lastX=e.clientX;}});
canvas.addEventListener('pointerup',()=>drag=false);canvas.addEventListener('pointercancel',()=>drag=false);
canvas.addEventListener('wheel',e=>{e.preventDefault();zoom=THREE.MathUtils.clamp(zoom+(e.deltaY>0?.1:-.1),.55,2.2)},{passive:false});
let frames=0,last=performance.now();
function frame(t){
 const w=innerWidth,h=innerHeight,dpr=renderer.getPixelRatio();if(canvas.width!==Math.floor(w*dpr)||canvas.height!==Math.floor(h*dpr))renderer.setSize(w,h,false);
 const aspect=w/h,base=selected>=0?5.4:which===0?8.6:10.7,span=Math.max(base,base/aspect)*zoom;
 camera.left=-span*aspect/2;camera.right=span*aspect/2;camera.top=span/2;camera.bottom=-span/2;camera.updateProjectionMatrix();
 root.rotation.y=angle;
 sets.forEach(group=>group.forEach(f=>{if(!f.visible)return;f.position.lerp(f.userData.target,.13);const s=THREE.MathUtils.lerp(f.scale.x,f.userData.targetScale,.13);f.scale.setScalar(s);}));
 renderer.render(scene,camera);frames++;if(t-last>1000){$('#perf').textContent=Math.round(frames*1000/(t-last))+' FPS · '+renderer.info.render.calls+' Draws · 精细';frames=0;last=t;}requestAnimationFrame(frame);
}requestAnimationFrame(frame);

