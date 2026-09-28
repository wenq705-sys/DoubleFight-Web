import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
const $=s=>document.querySelector(s),canvas=$('#view'),renderer=new THREE.WebGLRenderer({canvas,antialias:true,powerPreference:'high-performance'});
renderer.setPixelRatio(Math.min(devicePixelRatio,1.8));renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.35;
const scene=new THREE.Scene(),camera=new THREE.OrthographicCamera(-6,6,6,-6,.1,100);camera.position.set(10,13,16);camera.lookAt(0,0,0);
scene.add(new THREE.HemisphereLight(0xffe4bb,0x413751,3.3));const key=new THREE.DirectionalLight(0xffcb87,3.4);key.position.set(-4,9,5);scene.add(key);const fill=new THREE.DirectionalLight(0x8daeff,1.4);fill.position.set(5,5,-4);scene.add(fill);
const root=new THREE.Group();scene.add(root);const loader=new GLTFLoader();const load=n=>new Promise((ok,fail)=>loader.load(import.meta.env.BASE_URL+'night-market/'+n+'.glb',g=>ok(g.scene),undefined,fail));
const assets=['01-night-newcomer','02-candied-hawthorn','03-raccoon-grill','04-lantern-rabbit','05-fox-teahouse','06-panda-chef','07-opera-diva','08-golden-toad','09-dragon-boat','10-phoenix-pavilion','11-night-market-king'];
const names=['糯米团子','糖葫芦小贩','烤串狸猫','灯笼兔','茶馆狐狸','熊猫大厨','戏台花旦','金蟾掌柜','龙舟将军','凤凰阁主','夜市牛王'];
let figures=[],selected=-1,angle=0,drag=false,lastX=0,zoom=1,environment=null,board=null,mode='all';
function select(i){selected=i;$('#status').textContent=i<0?'全系列 · 11 个等级独立 GLB':(2**(i+1))+' · '+names[i];figures.forEach((f,j)=>{f.userData.targetScale=selected<0?.76:j===i?1.65:.50;f.visible=selected<0||j===i;});$('#selected').textContent=selected<0?'全系列':names[i];}
$('#all').onclick=()=>select(-1);$('#previous').onclick=()=>select((selected<0?10:selected+10)%11);$('#next').onclick=()=>select((selected+1)%11);
$('#setting').onclick=()=>{mode=mode==='all'?'scene':'all';if(environment)environment.visible=mode==='scene';if(board)board.visible=mode==='scene';$('#setting').textContent=mode==='scene'?'隐藏夜市':'展示夜市';};
try{
 [board,environment]=await Promise.all(['board','environment'].map(load));root.add(board,environment);board.visible=false;environment.visible=false;
 for(let i=0;i<11;i++){const f=await load(assets[i]);f.scale.setScalar(.76);f.userData.targetScale=.76;const col=i%4,row=Math.floor(i/4);f.position.set((col-1.5)*1.50,.15,(row-1)*1.65);root.add(f);figures.push(f);$('#loading').textContent='雕塑载入 '+(i+1)+'/11';}
 $('#loading').hidden=true;select(-1);
}catch(e){$('#loading').textContent='模型加载异常：'+e.message;console.error(e);}
canvas.addEventListener('pointerdown',e=>{drag=true;lastX=e.clientX;canvas.setPointerCapture(e.pointerId);});canvas.addEventListener('pointermove',e=>{if(drag){angle+=(e.clientX-lastX)*.006;lastX=e.clientX;}});canvas.addEventListener('pointerup',()=>drag=false);canvas.addEventListener('pointercancel',()=>drag=false);
canvas.addEventListener('wheel',e=>{e.preventDefault();zoom=THREE.MathUtils.clamp(zoom+(e.deltaY>0?.10:-.10),.60,2.2)},{passive:false});
let fps=0,last=performance.now();
function frame(t){const w=innerWidth,h=innerHeight,dpr=renderer.getPixelRatio();if(canvas.width!==Math.floor(w*dpr)||canvas.height!==Math.floor(h*dpr))renderer.setSize(w,h,false);
 const aspect=w/h,span=(selected<0?Math.max(10.7,10.7/aspect):Math.max(5.8,5.8/aspect))*zoom;camera.left=-span*aspect/2;camera.right=span*aspect/2;camera.top=span/2;camera.bottom=-span/2;camera.updateProjectionMatrix();
 root.rotation.y=angle;figures.forEach((f,i)=>{const col=i%4,row=Math.floor(i/4),target=selected<0?new THREE.Vector3((col-1.5)*1.50,.15,(row-1)*1.65):new THREE.Vector3(0,.20,0);f.position.lerp(target,.13);const s=THREE.MathUtils.lerp(f.scale.x,f.userData.targetScale,.13);f.scale.setScalar(s);if(selected===i)f.rotation.y=Math.sin(t*.0004)*.13;else f.rotation.y=0;});
 renderer.render(scene,camera);fps++;if(t-last>1000){$('#perf').textContent=Math.round(fps*1000/(t-last))+' FPS · '+renderer.info.render.calls+' Draws';fps=0;last=t;}requestAnimationFrame(frame);}requestAnimationFrame(frame);
