import './styles.css';
import { Board2048 } from './game/board/Board2048';
import type { Direction } from './game/board/types';
import { ART } from './config/artDirection';
import { THEMES, type ThemeId } from './config/themes';
import { GameScene } from './rendering/GameScene';
import { Hud } from './ui/Hud';
import { SoundDesign } from './audio/SoundDesign';

const app = document.querySelector<HTMLDivElement>('#app');
if (!app) throw new Error('#app root was not found.');

app.innerHTML = `
  <div class="loading" id="loading-screen">
    <div class="loading__content">
      <div class="loading__crest"><span>2</span><span>4</span><span>8</span></div>
      <div class="loading__title">正在开启宫廷棋局</div>
      <div class="loading__sub">DOUBLE FIGHT · 3D 2048</div>
    </div>
  </div>`;

const board = new Board2048();
const scene = new GameScene(app);
const hud = new Hud(app);
const sound = new SoundDesign();

let inputLocked = false;
let pointerStart: { x: number; y: number; time: number } | null = null;
let skillCharges = 3;
let theme: ThemeId = localStorage.getItem('doublefight-theme') === 'kingdom' ? 'kingdom' : 'palace';

const highest = () => Math.max(2, ...board.tiles().map((tile) => tile.value));

const refresh = () => {
  hud.setScore(board.score);
  hud.setHighest(highest());
  hud.setSkillCharges(skillCharges);
};

function applyTheme(nextTheme: ThemeId): void {
  theme = nextTheme;
  localStorage.setItem('doublefight-theme', theme);
  scene.setTheme(theme, board.tiles());
  hud.setTheme(THEMES[theme]);
}

function reset(): void {
  const initial = board.reset();
  skillCharges = 3;
  scene.reset(initial);
  hud.hideGameOver();
  refresh();
  inputLocked = false;
}

async function useRandomClear(): Promise<void> {
  if (inputLocked) return;
  if (skillCharges <= 0) {
    hud.showSkillEmpty();
    navigator.vibrate?.(8);
    return;
  }

  const result = board.clearRandom(2);
  if (result.removed.length === 0) {
    hud.showSkillEmpty();
    return;
  }

  inputLocked = true;
  skillCharges -= 1;
  hud.setSkillCharges(skillCharges);
  hud.playSkillFx(theme);
  sound.skill();
  navigator.vibrate?.([22, 18, 38, 20, 62]);
  hud.hideGameOver();

  await scene.applyClearSkill(result.removed);
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
    hud.showMerge(max, result.merges.length, theme);
    navigator.vibrate?.(
      max >= 1024 ? [32, 22, 58] :
      max >= 512 ? [26, 16, 42] :
      max >= 128 ? [19, 9, 24] :
      [11, 6, 14],
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
  const threshold = elapsed < 180 ? ART.mobile.swipeThresholdPx * 0.76 : ART.mobile.swipeThresholdPx;
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
  if (direction) {
    event.preventDefault();
    void move(direction);
    return;
  }
  if (event.code === 'Space') {
    event.preventDefault();
    void useRandomClear();
  }
});

hud.onRestart(reset);
hud.onSkill(() => { void useRandomClear(); });
hud.onThemeToggle(() => {
  if (inputLocked) return;
  applyTheme(theme === 'palace' ? 'kingdom' : 'palace');
});

reset();
applyTheme(theme);

requestAnimationFrame(() => {
  const loading = document.querySelector<HTMLElement>('#loading-screen');
  if (!loading) return;
  setTimeout(() => {
    loading.classList.add('loading--hidden');
    setTimeout(() => loading.remove(), 420);
  }, 260);
});
