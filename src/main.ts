import './styles.css';
import { Board2048 } from './game/board/Board2048';
import type { Direction } from './game/board/types';
import { ART } from './config/artDirection';
import { THEMES, type ThemeId } from './config/themes';
import { GameScene } from './rendering/GameScene';
import { Hud } from './ui/Hud';
import { HomeScreen } from './ui/HomeScreen';
import { OnlineLobby } from './ui/OnlineLobby';
import { DuelScreen } from './ui/DuelScreen';
import { OnlineClient } from './network/OnlineClient';
import { SoundDesign } from './audio/SoundDesign';

const app = document.querySelector<HTMLDivElement>('#app');
if (!app) throw new Error('#app root was not found.');

app.innerHTML = `
  <div class="loading" id="loading-screen">
    <div class="loading__content">
      <div class="loading__crest"><span>2</span><span>4</span><span>8</span></div>
      <div class="loading__title">正在开启双数世界</div>
      <div class="loading__sub">DOUBLE FIGHT · 3D 2048</div>
    </div>
  </div>`;

const board = new Board2048();
const scene = new GameScene(app);
const hud = new Hud(app);
const sound = new SoundDesign();

let inputLocked = false;
let inGame = false;
let pointerStart: { x: number; y: number; time: number } | null = null;
let skillCharges = 3;
let theme: ThemeId = localStorage.getItem('doublefight-theme') === 'kingdom' ? 'kingdom' : 'palace';

const home = new HomeScreen(app, theme);
const onlineEndpoint = resolveOnlineEndpoint();
const onlineClient = new OnlineClient(onlineEndpoint);
const onlineLobby = new OnlineLobby(app, onlineClient, Boolean(onlineEndpoint));
const duelScreen = new DuelScreen(app, onlineClient);

const highest = () => Math.max(2, ...board.tiles().map((tile) => tile.value));

const persistThemeRecord = (): void => {
  const scoreKey = `doublefight-best-${theme}`;
  const highestKey = `doublefight-highest-${theme}`;
  const best = Math.max(board.score, Number(localStorage.getItem(scoreKey) ?? 0));
  const maxTile = Math.max(highest(), Number(localStorage.getItem(highestKey) ?? 2));
  localStorage.setItem(scoreKey, String(best));
  localStorage.setItem(highestKey, String(maxTile));
};

const refresh = () => {
  hud.setScore(board.score);
  hud.setHighest(highest(), theme);
  hud.setSkillCharges(skillCharges);
  persistThemeRecord();
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

function openHome(): void {
  inGame = false;
  inputLocked = false;
  pointerStart = null;
  scene.setHomeMode(true);
  hud.setVisible(false);
  home.refreshRecord();
  home.show(theme);
}

function startGame(nextTheme: ThemeId): void {
  applyTheme(nextTheme);
  reset();
  inGame = true;
  scene.setHomeMode(false);
  hud.setVisible(true);
  home.hide();
}

async function useRandomClear(): Promise<void> {
  if (!inGame || inputLocked) return;
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
  if (!inGame) return;
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
  if (!inGame || !event.isPrimary) return;
  pointerStart = { x: event.clientX, y: event.clientY, time: performance.now() };
  scene.canvas.setPointerCapture?.(event.pointerId);
});

scene.canvas.addEventListener(
  'pointermove',
  (event) => {
    if (!inGame || !pointerStart) return;
    event.preventDefault();
    scene.setGesture(event.clientX - pointerStart.x, event.clientY - pointerStart.y);
  },
  { passive: false },
);

scene.canvas.addEventListener('pointerup', (event) => {
  if (!inGame || !pointerStart) return;
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
  if (!inGame) return;
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
  if (event.key === 'Escape') openHome();
});

hud.onRestart(reset);
hud.onSkill(() => { void useRandomClear(); });
hud.onHome(openHome);

home.onOnline((nextTheme) => {
  theme = nextTheme;
  localStorage.setItem('doublefight-theme', theme);
  home.hide();
  scene.setHomeMode(true);
  hud.setVisible(false);
  onlineLobby.show(theme);
});

onlineLobby.onClose(() => {
  onlineLobby.setTheme(theme);
  home.show(theme);
});

duelScreen.onEnter(() => {
  inGame = false;
  inputLocked = false;
  pointerStart = null;
  onlineLobby.hideForMatch();
  home.hide();
  hud.setVisible(false);
  scene.setHomeMode(true);
});

duelScreen.onExit(() => {
  onlineLobby.show(theme);
});

home.onPreview((nextTheme) => {
  if (nextTheme === theme) return;
  applyTheme(nextTheme);
  scene.prewarmTheme(nextTheme);
});
home.onStart(startGame);

reset();
applyTheme(theme);
openHome();

function resolveOnlineEndpoint(): string {
  const query = new URLSearchParams(window.location.search).get('ws');
  if (query?.startsWith('ws://') || query?.startsWith('wss://')) return query;

  const viteEnv = (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env;
  const configured = viteEnv?.VITE_WS_URL?.trim();
  if (configured?.startsWith('ws://') || configured?.startsWith('wss://')) return configured;

  if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
    return 'ws://localhost:8787/ws';
  }
  return '';
}

requestAnimationFrame(() => {
  const loading = document.querySelector<HTMLElement>('#loading-screen');
  if (!loading) return;
  setTimeout(() => {
    loading.classList.add('loading--hidden');
    setTimeout(() => loading.remove(), 420);
  }, 260);
});
