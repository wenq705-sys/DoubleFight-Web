import { Board2048 } from '../../../shared/game/Board2048';
import type { Direction } from '../../../shared/game/types';
import type { DouyinApi } from './api';
import { DouyinBoardProbe } from './board';
import { DouyinLifecycle } from './lifecycle';
import { DouyinSocketProbe } from './socket';
import { DouyinSwipeInput } from './touch';

declare const tt: DouyinApi;

const canvas = tt.createCanvas(); // The first call obtains the on-screen canvas.
const context = canvas.getContext('webgl2', { antialias: true, alpha: false })
  ?? canvas.getContext('webgl', { antialias: true, alpha: false })
  ?? canvas.getContext('experimental-webgl', { antialias: true, alpha: false });
let presentation: DouyinBoardProbe | null = null;
if (context) {
  try { presentation = new DouyinBoardProbe(tt, canvas, context); }
  catch (error) { console.error('[M2.9 gate1] Three.js renderer failed:', error); }
} else {
  console.error('[M2.9 gate1] tt.createCanvas() did not provide a WebGL context');
}

// The shared board remains testable even when a device cannot construct WebGL.
const fallbackBoard = presentation ? null : new Board2048(() => 0.42);
fallbackBoard?.reset();
const socket = new DouyinSocketProbe(tt);
const touch = new DouyinSwipeInput(tt, (direction: Direction) => {
  if (presentation) presentation.move(direction);
  else {
    const result = fallbackBoard!.move(direction);
    console.log(`[M2.9 gate2] ${direction} changed=${result.changed} score=${fallbackBoard!.score}`);
  }
});
const lifecycle = new DouyinLifecycle(tt, {
  request: callback => requestAnimationFrame(callback),
  cancel: handle => cancelAnimationFrame(handle),
}, () => presentation?.render(), () => {
  touch.setActive(true);
  socket.connect();
}, () => {
  touch.setActive(false);
  socket.close();
});
lifecycle.show();
