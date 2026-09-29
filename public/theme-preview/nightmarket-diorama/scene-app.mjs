import * as T from 'three';
import {GLTFLoader} from '../collection/GLTFLoader.js';
import {MOOD_STAGES,ThemeMoodDirector} from './theme-stage-core.mjs';
import {ThemeStageVisual} from './theme-stage-visual.mjs?v=mood-visible-v3';
import {ThemeStageAudio} from './theme-stage-audio.mjs';
import {NightMarketPlayable} from './nightmarket-playable.mjs?v=play-11-v1';
const $=id=>document.getElementById(id);
const root=$('view'),hint=$('hint'),group=new T.Group();
const mobile=matchMedia('(pointer:coarse)').matches||innerWidth<740;
let currentQuality=mobile?'mobile':'full', board=null,env=null,visual=null;
let noInput=false,autoTask=null,toastTimer=null,last=0,theta=.53,phi=.57,zoom=1;
const ren=new T.WebGLRenderer({alpha:true,antialias:true,powerPreference:'high-performance'});
ren.setPixelRatio(Math.min(devicePixelRatio||1,mobile?1.35:1.55));
ren.outputColorSpace=T.SRGBColorSpace;ren.toneMapping=T.ACESFilmicToneMapping;
ren.toneMappingExposure=1.13;ren.shadowMap.enabled=false;
root.insertBefore(ren.domElement,hint);
const scene=new T.Scene();scene.add(group);scene.background=new T.Color(0x171c28);
const hemi=new T.HemisphereLight(0xffe5ca,0x526579,2.7);scene.add(hemi);
const sun=new T.DirectionalLight(0xffdaa7,2.65);sun.position.set(-4,8,7);scene.add(sun);
const fill=new T.DirectionalLight(0xb9e5f2,1.15);fill.position.set(5,5,-5);scene.add(fill);
const cam=new T.OrthographicCamera(-6,6,6,-6,.1,120);
function cameraUpdate(){
  const radius=15;
  cam.position.set(radius*Math.sin(theta)*Math.cos(phi),radius*Math.sin(phi),
    radius*Math.cos(theta)*Math.cos(phi));
  cam.lookAt(0,.54,0);cam.zoom=zoom;cam.updateProjectionMatrix();
}
function resize(){
  const ratio=root.clientWidth/root.clientHeight;
  const v=ratio<.9?14.55:12.65;
  cam.left=-v*ratio/2;cam.right=v*ratio/2;cam.top=v/2;cam.bottom=-v/2;
  cam.updateProjectionMatrix();ren.setSize(root.clientWidth,root.clientHeight);
}
resize();cameraUpdate();
const loader=new GLTFLoader();
const load=u=>new Promise((resolve,reject)=>loader.load(u,g=>resolve(g.scene),undefined,reject));
const audio=new ThemeStageAudio();
const stageTrail=$('stageTrail'),stageTitle=$('stageTitle'),stageSub=$('stageSubtitle');
const maxLabel=$('maxTileLabel'),bar=$('stageProgress'),audioButton=$('audio-toggle');
const stageCorner=$('stageCorner');
stageTrail.innerHTML=MOOD_STAGES.map(s=>'<span data-step="'+s.id+'">'+s.name+'</span>').join('');
function toast(message,accent=false){
  const el=$('stageToast');el.textContent=message;el.classList.toggle('special',accent);
  el.classList.add('show');if(toastTimer)clearTimeout(toastTimer);
  toastTimer=setTimeout(()=>el.classList.remove('show'),2100);
}
const director=new ThemeMoodDirector({
  onStageChange({id,name,subtitle,reset}){
    stageTitle.textContent=name;stageSub.textContent=subtitle;
    stageCorner.textContent=name+' · '+MOOD_STAGES[id].minTile;
    stageCorner.className='stage-corner level'+id;
    bar.style.width=(id*25)+'%';
    for(const el of stageTrail.children){
      const step=Number(el.dataset.step);
      el.classList.toggle('current',step===id);el.classList.toggle('passed',step<id);
    }
    if(!reset&&id>0)toast('✦ '+name+' · 场景升阶',id>=3);
  },
  onMoment(e){
    visual?.moment(e);audio.moment(e.type,e.tile);
    if(e.type==='victory')toast('✧ 2048 达成 · 神灯盛会！',true);
    else if(e.type==='combo')toast('连击 ×'+e.combo+' · 夜市共鸣！');
  },
});
director.reset();
const playable=new NightMarketPlayable({
  scene,loader,canvas:ren.domElement,director,assetQuery:'play-11-v1',
  onMode(mode){
    const active=mode!=='off';
    $('view').classList.toggle('play-mode',active);
    $('playHud').hidden=!active;
    $('play-start').hidden=active;$('play-showcase').hidden=active;$('play-stop').hidden=!active;
    $('play-float').textContent=active?'← 返回演示':'🎮 开始真对局';
    for(const ctrl of document.querySelectorAll('[data-quick],[data-max],#auto-demo,#stage-reset,#merge-demo,#combo-demo'))
      ctrl.disabled=active;
    if(active){
      stopAutoplay();if(env)env.visible=true;if(visual)visual.root.visible=true;
      theta=.12;phi=mode==='showcase'?.84:1.04;zoom=1.26;cameraUpdate();
      hint.textContent=mode==='showcase'?'完整 11 阶收藏模型 · 真正放入 16 个棋格':
        '在画面内滑动 3D 棋子 · 真实合成会自动点亮夜市';
    }else{
      theta=.53;phi=.57;zoom=1;cameraUpdate();
      hint.textContent='单指旋转 · 双指缩放 · 下方可触发情绪递进';
    }
    selection('all');
  },
  onState(status){
    $('playScore').textContent=status.score.toLocaleString();
    $('playHighest').textContent=String(status.highest);
    $('playMoves').textContent=String(status.moves);
    $('playLoaded').textContent=status.loaded+'/11';
    $('playNote').textContent=status.gameOver?'棋盘已无可用移动：按「重开」开始下一局。':
      status.mode==='showcase'?'11 阶全部按真实棋格占位，点击「退出」返回。此处是美术同屏联调，不是对局结算。':
      '在上方 3D 棋盘滑动操作；键盘可使用方向键 / WASD。真合成驱动五段氛围。';
    refreshUI();
  },
});
function refreshUI(){
  const s=director.snapshot();
  maxLabel.textContent='局内最高：'+s.highest;
  stageCorner.textContent=s.stageName+' · '+s.highest;
  for(const q of document.querySelectorAll('[data-quick]')){
    const qTile=Number(q.dataset.quick);
    const isActive=qTile===2048?s.highest===2048:
      qTile===2?s.stage===0:s.highest>=qTile&&
        (qTile===1024||s.highest<(qTile===16?64:qTile===64?256:1024));
    q.classList.toggle('active',isActive);
  }
  for(const b of document.querySelectorAll('[data-max]'))
    b.classList.toggle('selected',Number(b.dataset.max)===s.highest);
}
refreshUI();
$('play-start').onclick=()=>playable.start();
$('play-showcase').onclick=()=>playable.showcase();
$('play-stop').onclick=()=>playable.stop();
$('play-float').onclick=()=>playable.active?playable.stop():playable.start();
$('play-float-showcase').onclick=()=>playable.showcase();
$('play-restart').onclick=()=>playable.restart();
document.querySelectorAll('[data-move]').forEach(button=>{
  button.onclick=()=>playable.move(button.dataset.move);
});
function stopAutoplay(){
  if(autoTask){clearTimeout(autoTask);autoTask=null}
  $('auto-demo').textContent='▶ 自动体验五段演出';
}
function advance(maxTile){
  if(playable.active)return;
  const previous=director.highest;
  director.progress(maxTile);
  if(maxTile>previous&&maxTile<2048){
    const type=maxTile>=256?'bigMerge':'merge';
    director.moment(type,{tile:maxTile,cell:{row:Math.floor(Math.random()*4),column:Math.floor(Math.random()*4)}});
    visual?.moment({type,cell:{row:1,column:2}});
    audio.moment(type,maxTile);
  }else if(maxTile<=previous&&maxTile!==2){
    toast('本局氛围只升不降 · 点击重开回到初始阶段');
  }
  refreshUI();
}
document.querySelectorAll('[data-max]').forEach(b=>b.onclick=()=>{
  stopAutoplay();
  const value=Number(b.dataset.max);
  if(value===2){director.reset();refreshUI();return}
  advance(value);
});
document.querySelectorAll('[data-quick]').forEach(q=>q.onclick=()=>{
  const tile=Number(q.dataset.quick);
  const original=document.querySelector('[data-max="'+tile+'"]');
  if(original)original.click();
});
$('merge-demo').onclick=()=>{
  director.moment('merge',{tile:director.highest,
    cell:{row:Math.floor(Math.random()*4),column:Math.floor(Math.random()*4)}});toast('棋格水纹 · 灯火回应');
};
$('combo-demo').onclick=()=>{
  director.moment('combo',{tile:director.highest,combo:4,
    cell:{row:Math.floor(Math.random()*4),column:Math.floor(Math.random()*4)}});
};
$('stage-reset').onclick=()=>{stopAutoplay();director.reset();refreshUI();toast('新的一局 · 夜市重新点亮')};
$('auto-demo').onclick=()=>{
  if(autoTask){stopAutoplay();return}
  director.reset();refreshUI();
  const seq=[16,64,256,1024,2048];let index=0;
  $('auto-demo').textContent='■ 停止自动演出';
  const step=()=>{
    advance(seq[index]);index++;
    if(index<seq.length)autoTask=setTimeout(step,index===seq.length-1?3600:2800);
    else {autoTask=setTimeout(()=>{stopAutoplay()},3000)}
  };
  autoTask=setTimeout(step,1200);
};
audioButton.onclick=async()=>{
  try{const on=await audio.toggle();audioButton.textContent=on?'♪ 关闭分层音乐':'♫ 开启分层音乐';
    audioButton.classList.toggle('selected',on)}
  catch(e){toast('声音启动失败，请检查浏览器静音设置')}
};
$('quality').textContent='画质：'+(mobile?'移动精简':'完整环境');
function selection(id){
  for(const key of ['all','board','top','reset'])$(key).classList.toggle('chosen',key===id);
}
$('all').onclick=()=>{
  if(env)env.visible=true;if(visual)visual.root.visible=true;
  theta=.53;phi=.57;zoom=1;cameraUpdate();selection('all');
};
$('board').onclick=()=>{
  if(env)env.visible=false;if(visual)visual.root.visible=false;
  theta=.49;phi=.72;zoom=1.45;cameraUpdate();selection('board');
};
$('top').onclick=()=>{
  if(env)env.visible=true;if(visual)visual.root.visible=true;
  theta=0;phi=1.558;zoom=1.04;cameraUpdate();selection('top');
};
$('reset').onclick=()=>{$('all').click()};
function disposeGLB(rootObj){
  if(!rootObj)return;rootObj.traverse(o=>{
    if(o.isMesh){o.geometry?.dispose();
      (Array.isArray(o.material)?o.material:[o.material]).forEach(m=>m?.dispose())}
  });
  rootObj.parent?.remove(rootObj);
}
let switching=false;
$('quality').onclick=async()=>{
  if(switching||!board)return;
  switching=true;const btn=$('quality');btn.disabled=true;
  const next=currentQuality==='mobile'?'full':'mobile';
  btn.textContent='切换中…';
  try{
    const newer=await load('./'+(next==='mobile'?'environment-mobile':'environment-nightmarket')+'.glb?v=nightmarket-art-v2');
    const old=env;env=newer;group.add(newer);visual.bindEnvironment(newer);
    newer.visible=old?.visible??true;disposeGLB(old);
    currentQuality=next;
    btn.textContent='画质：'+(next==='mobile'?'移动精简':'完整环境');
    toast('环境已切换 · 当前氛围阶段保持不变');
  }catch(e){btn.textContent='画质切换失败';toast('网络问题：环境模型未能载入')}
  finally{switching=false;btn.disabled=false}
};
Promise.all([
  load('./board-4x4.glb?v=nightmarket-art-v2'),
  load('./'+(mobile?'environment-mobile':'environment-nightmarket')+'.glb?v=nightmarket-art-v2'),
]).then(([b,e])=>{
  board=b;env=e;group.add(e,b);
  visual=new ThemeStageVisual({scene,boardRoot:b,envRoot:e,renderer:ren,mobile,sun,hemi,fill});
  hint.textContent='单指旋转 · 双指缩放 · 下方按钮可触发阶段递进';
  $('controls').classList.remove('loading');
}).catch(err=>{
  hint.textContent='模型加载失败，请刷新后重试';
  $('load-error').textContent=String(err?.message||err);
});
let isDrag=false,px=0,py=0,pinch=0;const cv=ren.domElement;
cv.onpointerdown=e=>{if(playable.active)return;if(e.pointerType!=='touch'||e.isPrimary){
  isDrag=true;px=e.clientX;py=e.clientY;cv.setPointerCapture?.(e.pointerId)}};
cv.onpointerup=()=>isDrag=false;cv.onpointercancel=()=>isDrag=false;
cv.onpointermove=e=>{if(playable.active||!isDrag)return;
  theta-=(e.clientX-px)*.007;phi=Math.max(.21,Math.min(1.55,phi+(e.clientY-py)*.006));
  px=e.clientX;py=e.clientY;cameraUpdate()};
cv.addEventListener('wheel',e=>{e.preventDefault();zoom=Math.max(.67,Math.min(2.6,
  zoom*(1-e.deltaY*.00075)));cameraUpdate()},{passive:false});
cv.addEventListener('touchmove',e=>{
  if(playable.active)return;
  if(e.touches.length===2){e.preventDefault();isDrag=false;
    const d=Math.hypot(e.touches[0].clientX-e.touches[1].clientX,
      e.touches[0].clientY-e.touches[1].clientY);
    if(pinch)zoom=Math.max(.67,Math.min(2.6,zoom*d/pinch));pinch=d;cameraUpdate()}
  else pinch=0;
},{passive:false});
function frame(t){
  requestAnimationFrame(frame);
  if(!last){last=t;return}const diff=t-last;if(diff<30)return;last=t;
  const state=director.update(Math.min(diff/1000,.085));
  audio.update(state);visual?.update(Math.min(diff/1000,.085),state);
  playable.update(Math.min(diff/1000,.085));
  ren.render(scene,cam);
}
requestAnimationFrame(frame);
addEventListener('resize',resize);
addEventListener('pagehide',()=>{stopAutoplay();audio.dispose();playable.dispose();visual?.dispose()},{once:true});

