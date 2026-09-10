import './styles.css';
import { Board2048 } from './game/board/Board2048';
import type { Direction } from './game/board/types';
import { GameScene } from './rendering/GameScene';
import { Hud } from './ui/Hud';
import { SoundDesign } from './audio/SoundDesign';

const app=document.querySelector<HTMLDivElement>('#app');
if(!app)throw new Error('#app root was not found.');
app.innerHTML=`<div class="loading" id="loading-screen"><div class="loading__content"><div class="loading__castle">🏰</div><div class="loading__title">正在搭建微缩王国</div><div class="loading__sub">THREE.JS · 3D 2048 VISUAL SLICE</div></div></div>`;

const board=new Board2048();
const scene=new GameScene(app);
const hud=new Hud(app);
const sound=new SoundDesign();
let inputLocked=false;
let pointerStart:{x:number;y:number}|null=null;

const highest=()=>Math.max(2,...board.tiles().map(tile=>tile.value));
const refresh=()=>{hud.setScore(board.score);hud.setHighest(highest());};
function reset(){scene.reset(board.reset());hud.hideGameOver();refresh();inputLocked=false;}

async function move(direction:Direction):Promise<void>{
  if(inputLocked)return;const result=board.move(direction);if(!result.changed)return;
  inputLocked=true;sound.move();await scene.applyMove(result);
  if(result.merges.length){result.merges.forEach(merge=>sound.merge(merge.value));const max=Math.max(...result.merges.map(merge=>merge.value));if(max>=2048)sound.legendary();hud.showMerge(max,result.merges.length);navigator.vibrate?.(max>=512?[26,20,45]:max>=128?35:16);}
  refresh();inputLocked=false;if(result.gameOver)hud.showGameOver();
}

scene.canvas.addEventListener('pointerdown',event=>{pointerStart={x:event.clientX,y:event.clientY};scene.canvas.setPointerCapture?.(event.pointerId);});
scene.canvas.addEventListener('pointerup',event=>{if(!pointerStart)return;const dx=event.clientX-pointerStart.x,dy=event.clientY-pointerStart.y;pointerStart=null;if(Math.hypot(dx,dy)<24)return;if(Math.abs(dx)>Math.abs(dy))void move(dx>0?'right':'left');else void move(dy>0?'down':'up');});
scene.canvas.addEventListener('pointercancel',()=>{pointerStart=null;});
window.addEventListener('keydown',event=>{const map:Record<string,Direction|undefined>={ArrowLeft:'left',a:'left',A:'left',ArrowRight:'right',d:'right',D:'right',ArrowUp:'up',w:'up',W:'up',ArrowDown:'down',s:'down',S:'down'};const direction=map[event.key];if(!direction)return;event.preventDefault();void move(direction);});
hud.onRestart(reset);reset();
requestAnimationFrame(()=>{const loading=document.querySelector<HTMLElement>('#loading-screen');if(!loading)return;setTimeout(()=>{loading.classList.add('loading--hidden');setTimeout(()=>loading.remove(),420);},350);});
