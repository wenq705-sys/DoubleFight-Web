import './styles.css';
import { Board2048 } from './game/board/Board2048';
import type { Direction } from './game/board/types';
import { ART } from './config/artDirection';
import { GameScene } from './rendering/GameScene';
import { Hud } from './ui/Hud';
import { SoundDesign } from './audio/SoundDesign';

const app = document.querySelector<HTMLDivElement>('#app');
if (!app) throw new Error('#app root was not found.');

app.innerHTML = `
  <div class="loading" id="loading-screen">
    <div class="loading__content">
      <div class="loading__crest"><span>2</span><span>4</span><span>8</span></div>
      <div class="loading__title">正在唤醒数字王国</div>
      <div class="loading__sub">DOUBLE FIGHT · MINIATURE KINGDOM</div>
    </div>
  </div>`;

const board = new Board2048();
const scene = new GameScene(app);
const hud = new Hud(app);
const sound = new SoundDesign();
let inputLocked = false;
let pointerStart: { x: number; y: number; time: number } | null = null;

const highest = () => Math.max(2, ...board.tiles().map((tile) => tile.value));
const refresh = () => {
  hud.setScore(board.score);
  hud.setHighest(highest());
};

function reset(): void {
  scene.reset(board.reset());
  hud.hideGameOver();
  refresh();
  inputLocked = false;
}

async function move(direction: Direction): Promise<void> {
  if (inputLocked) {
    scene.clearGesture();
    return;
  }

  const result = board.move(direction);
  if (!result.changed) {
    scene.rejectDirection(direction);
    navigator.vibrate?.(7);
    return;
  }

  scene.commitDirection(direction);
  inputLocked = true;
  sound.move();
  await scene.applyMove(result);

  if (result.merges.length) {
    result.merges.forEach((merge) => sound.merge(merge.value));
    const max = Math.max(...result.merges.map((merge) => merge.value));
    if (max >= 2048) sound.legendary();
    hud.showMerge(max, result.merges.length);
    navigator.vibrate?.(
      max >= 1024 ? [30, 24, 55] :
      max >= 512 ? [24, 16, 38] :
      max >= 128 ? [18, 10, 22] :
      [10, 7, 13],
    );
  }

  refresh();
  inputLocked = false;
  if (result.gameOver) hud.showGameOver();
}

scene.canvas.addEventListener('pointerdown', (event) => {
  if (!event.isPrimary) return;
  pointerStart = { x: event.clientX, y: event.clientY, time: performance.now() };
  scene.canvas.setPointerCapture?.(event.pointerId);
});

scene.canvas.addEventListener(
  'pointermove',
  (event) => {
    if (!pointerStart) return;
    event.preventDefault();
    scene.setGesture(event.clientX - pointerStart.x, event.clientY - pointerStart.y);
  },
  { passive: false },
);

scene.canvas.addEventListener('pointerup', (event) => {
  if (!pointerStart) return;
  const dx = event.clientX - pointerStart.x;
  const dy = event.clientY - pointerStart.y;
  const elapsed = performance.now() - pointerStart.time;
  pointerStart = null;

  const distance = Math.hypot(dx, dy);
  const threshold = elapsed < 180 ? ART.mobile.swipeThresholdPx * 0.78 : ART.mobile.swipeThresholdPx;
  if (distance < threshold) {
    scene.clearGesture();
    return;
  }

  if (Math.abs(dx) > Math.abs(dy)) void move(dx > 0 ? 'right' : 'left');
  else void move(dy > 0 ? 'down' : 'up');
});

scene.canvas.addEventListener('pointercancel', () => {
  pointerStart = null;
  scene.clearGesture();
});
scene.canvas.addEventListener('contextmenu', (event) => event.preventDefault());

window.addEventListener('keydown', (event) => {
  const map: Record<string, Direction | undefined> = {
    ArrowLeft: 'left', a: 'left', A: 'left',
    ArrowRight: 'right', d: 'right', D: 'right',
    ArrowUp: 'up', w: 'up', W: 'up',
    ArrowDown: 'down', s: 'down', S: 'down',
  };
  const direction = map[event.key];
  if (!direction) return;
  event.preventDefault();
  void move(direction);
});

hud.onRestart(reset);
reset();

requestAnimationFrame(() => {
  const loading = document.querySelector<HTMLElement>('#loading-screen');
  if (!loading) return;
  setTimeout(() => {
    loading.classList.add('loading--hidden');
    setTimeout(() => loading.remove(), 420);
  }, 260);
});
