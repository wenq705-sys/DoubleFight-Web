import type { Direction } from '../../../shared/game/types';
import type { DouyinApi } from './api';
import { DouyinPlatform } from '../../../src/platform/douyin/DouyinPlatform';
import { DouyinRenderLoop } from '../../../src/platform/douyin/DouyinRenderLoop';
import { OnlineClient } from '../../../src/network/OnlineClient';
import { DouyinSoloScene } from './soloScene';

declare const tt: DouyinApi;

const platform = new DouyinPlatform(tt);
const client = new OnlineClient('wss://game.whvwayfare.online/ws', platform.socket);
const canvas = platform.createCanvas(); // First call is the single on-screen canvas.
const context = canvas.getContext('webgl2', { antialias: true, alpha: false })
  ?? canvas.getContext('webgl', { antialias: true, alpha: false })
  ?? canvas.getContext('experimental-webgl', { antialias: true, alpha: false });

if (!context) throw new Error('Double Fight requires a WebGL context in the Douyin runtime.');

const savedTheme = platform.storage.getItem('doublefight-theme');
const theme = savedTheme === 'palace' ? 'palace' : 'kingdom';
const game = new DouyinSoloScene(platform, canvas, context, theme);

const touch = platform.createSwipeInput((direction: Direction) => {
  void game.move(direction);
});

client.subscribe((state, message) => {
  if (message?.type === 'welcome') {
    console.log(`[M2.10.2 socket] welcome v${message.protocolVersion}`);
    client.ping();
  }
  if (message?.type === 'pong') console.log(`[M2.10.2 socket] pong ${state.latencyMs ?? 0}ms`);
  if (state.lastError) console.warn(`[M2.10.2 socket] ${state.lastError}`);
});

const loop = new DouyinRenderLoop(
  platform.lifecycle,
  {
    request: callback => requestAnimationFrame(callback),
    cancel: handle => cancelAnimationFrame(handle),
  },
  () => game.render(),
  () => {
    touch.setActive(true);
    client.connect();
  },
  () => {
    touch.setActive(false);
    client.close();
  },
);

platform.lifecycle.show();
void platform.account.bootstrap().then(result => console.log(`[M2.10.2 account] ${result.status}`));
void loop;
