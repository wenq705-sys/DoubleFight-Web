import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
const canvas=document.querySelector('#view'), status=document.querySelector('#status');
const renderer=new THREE.WebGLRenderer({canvas,antialias:true,alpha:true,powerPreference:'high-performance'});
renderer.setPixelRatio(Math.min(devicePixelRatio,1.6));renderer.outputColorSpace=THREE.SRGBColorSpace;
renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.32;renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
const scene=new THREE.Scene();const camera=new THREE.OrthographicCamera(-3.65,3.65,3.65,-3.65,.1,100);
camera.position.set(6,-8,7);camera.lookAt(0,0,.3);
scene.add(new THREE.HemisphereLight(0xffe9c2,0x45384c,3.2));
const key=new THREE.DirectionalLight(0xffd5a0,3.2);key.position.set(-3,-4,8);key.castShadow=true;key.shadow.mapSize.set(1024,1024);key.shadow.camera.left=-6;key.shadow.camera.right=6;key.shadow.camera.top=6;key.shadow.camera.bottom=-6;key.shadow.bias=-.0003;scene.add(key);
const fill=new THREE.DirectionalLight(0x94b5ff,1.1);fill.position.set(4,3,4);scene.add(fill);
const root=new THREE.Group();scene.add(root);const loader=new GLTFLoader();
const url=(name)=>import.meta.env.BASE_URL+'theme-factory/dist/night-market/'+name+'.glb';
const load=(name)=>new Promise((ok,fail)=>loader.load(url(name),g=>ok(g.scene),undefined,fail));
let active=null,angle=0,drag=false,last=0;
try{
const board=await load('board');board.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=true}});root.add(board);const environment=await load('environment');environment.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=true}});root.add(environment);
const pieces=await Promise.all(['premium-dumpling','premium-panda','premium-ox'].map(load));
pieces.forEach(p=>{p.visible=false;p.position.set(0,-.2,.35);p.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=true}});root.add(p)});
function choose(i){if(active)active.visible=false;active=pieces[i];active.visible=true;status.textContent='拖动旋转 · 当前：'+['街头团子','熊猫大厨','夜市牛王'][i]}
document.querySelectorAll('button').forEach((b,i)=>b.onclick=()=>choose(i));choose(1);
}catch(e){status.textContent='资源加载失败：'+e.message;console.error(e)}
canvas.addEventListener('pointerdown',e=>{drag=true;last=e.clientX;canvas.setPointerCapture(e.pointerId)});
canvas.addEventListener('pointermove',e=>{if(drag){angle+=(e.clientX-last)*.007;last=e.clientX}});
canvas.addEventListener('pointerup',()=>drag=false);canvas.addEventListener('pointercancel',()=>drag=false);
function frame(){const w=innerWidth,h=innerHeight;renderer.setSize(w,h,false);const aspect=w/h,span=Math.max(9.8,9.5/aspect);camera.left=-span*aspect/2;camera.right=span*aspect/2;camera.top=span/2;camera.bottom=-span/2;camera.updateProjectionMatrix();root.rotation.z=angle;renderer.render(scene,camera);requestAnimationFrame(frame)}frame();
