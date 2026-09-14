import { Board2048 } from '../../../shared/game/Board2048';
import type { Direction } from '../../../shared/game/types';
import type { DouyinApi } from './api';
import { DouyinBoardProbe } from './board';
import { DouyinPlatform } from '../../../src/platform/douyin/DouyinPlatform';
import { DouyinRenderLoop } from '../../../src/platform/douyin/DouyinRenderLoop';
import { OnlineClient } from '../../../src/network/OnlineClient';

declare const tt: DouyinApi;

const platform = new DouyinPlatform(tt);
const client = new OnlineClient('wss://game.whvwayfare.online/ws', platform.socket);
const canvas = platform.createCanvas(); // The first call obtains the on-screen canvas.
const context = canvas.getContext('webgl2', { antialias: true, alpha: false })
  ?? canvas.getContext('webgl', { antialias: true, alpha: false })
  ?? canvas.getContext('experimental-webgl', { antialias: true, alpha: false });
let presentation: DouyinBoardProbe | null = null;
if (context) {
  try { presentation = new DouyinBoardProbe(platform.getSystemInfo(), canvas, context); }
  catch (error) { console.error('[M2.9 gate1] Three.js renderer failed:', error); }
} else {
  console.error('[M2.9 gate1] tt.createCanvas() did not provide a WebGL context');
}

// The shared board remains testable even when a device cannot construct WebGL.
const fallbackBoard = presentation ? null : new Board2048(() => 0.42);
fallbackBoard?.reset();
const touch = platform.createSwipeInput((direction: Direction) => {
  if (presentation) presentation.move(direction);
  else fallbackBoard!.move(direction);
});
client.subscribe((state, message) => {
  if (message?.type === 'welcome') { console.log(`[M2.10 socket] welcome v${message.protocolVersion}`); client.ping(); }
  if (message?.type === 'pong') console.log(`[M2.10 socket] pong ${state.latencyMs ?? 0}ms`);
  if (state.lastError) console.warn(`[M2.10 socket] ${state.lastError}`);
});
const loop = new DouyinRenderLoop(platform.lifecycle, {
  request: callback => requestAnimationFrame(callback),
  cancel: handle => cancelAnimationFrame(handle),
}, () => presentation?.render(), () => {
  touch.setActive(true);
  client.connect();
}, () => {
  touch.setActive(false);
  client.close();
});
platform.lifecycle.show();
void platform.account.bootstrap().then(result => console.log(`[M2.10 account] ${result.status}`));
void loop;
