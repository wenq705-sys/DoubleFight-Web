import type { Direction } from '../../../shared/game/types';
import { isThemeId } from '../../../src/config/themes';
import type { DouyinApi } from './api';
import { DouyinPlatform } from '../../../src/platform/douyin/DouyinPlatform';
import { DouyinRenderLoop } from '../../../src/platform/douyin/DouyinRenderLoop';
import { OnlineClient } from '../../../src/network/OnlineClient';
import { DouyinSoloScene } from './soloScene';
import { DouyinCommercial } from './commercial';
import { DouyinSocial } from './social';
import { DOUYIN_PRODUCT_CONFIG } from './config';
import { DouyinAudio } from './audio';
import { DouyinAuthClient } from './auth';
import { DouyinEngagement } from './engagement';
import { installM212ProductPass } from './m212ProductPass';
import { installM212RetentionHub } from './m212RetentionHub';
import { configureRuntimeMaterials } from '../../../src/rendering/RuntimeMaterialPolicy';

declare const tt: DouyinApi;

const platform = new DouyinPlatform(tt);
const client = new OnlineClient(DOUYIN_PRODUCT_CONFIG.socketUrl, platform.socket);
const commercial = new DouyinCommercial(tt);
const social = new DouyinSocial(tt);
const audio = new DouyinAudio(tt);
const engagement = new DouyinEngagement(tt);
const auth = new DouyinAuthClient(tt, platform, DOUYIN_PRODUCT_CONFIG.apiUrl, token => {
  platform.socket.setAuthorization(token);
  if (!token) client.close();
});
const canvas = platform.createCanvas(); // First call is the single on-screen canvas.

function lockGameViewportGestures(): void {
  const canvasTarget = canvas as typeof canvas & {
    style?: {
      touchAction?: string;
      msTouchAction?: string;
      userSelect?: string;
      webkitUserSelect?: string;
    };
  };

  if (canvasTarget.style) {
    canvasTarget.style.touchAction = 'none';
    canvasTarget.style.msTouchAction = 'none';
    canvasTarget.style.userSelect = 'none';
    canvasTarget.style.webkitUserSelect = 'none';
  }

  const prevent = (event: Event) => event.preventDefault();
  const add = (name: string) => {
    try { canvasTarget.addEventListener?.(name, prevent, { passive: false }); }
    catch { try { canvasTarget.addEventListener?.(name, prevent); } catch { /* host canvas may not expose DOM events */ } }
  };
  for (const name of ['touchstart', 'touchmove', 'gesturestart', 'gesturechange', 'gestureend']) add(name);

  const doc = (globalThis as typeof globalThis & { document?: Document }).document;
  if (!doc) return;
  try {
    doc.documentElement.style.touchAction = 'none';
    doc.body && (doc.body.style.touchAction = 'none');
    let viewport = doc.querySelector<HTMLMetaElement>('meta[name="viewport"]');
    if (!viewport) {
      viewport = doc.createElement('meta');
      viewport.name = 'viewport';
      doc.head?.appendChild(viewport);
    }
    viewport.content = 'width=device-width,initial-scale=1,maximum-scale=1,minimum-scale=1,user-scalable=no,viewport-fit=cover';
    for (const name of ['gesturestart', 'gesturechange', 'gestureend']) {
      doc.addEventListener(name, prevent, { passive: false });
    }
    doc.addEventListener('touchmove', event => {
      const touchEvent = event as TouchEvent;
      if (touchEvent.touches.length > 1) event.preventDefault();
    }, { passive: false });
  } catch {
    // Native mini-game runtimes do not expose a DOM; tt touch suppression still applies.
  }
}
lockGameViewportGestures();

const runtimeInfo = tt.getSystemInfoSync();
const isDevtools = runtimeInfo.platform === 'devtools';
// Helium currently exposes a stable WebGL1 path. Real iOS/Android devices keep
// the WebGL2-first production path so the original toon rendering is preserved.
const context = isDevtools
  ? (canvas.getContext('webgl', { antialias: true, alpha: false })
    ?? canvas.getContext('experimental-webgl', { antialias: true, alpha: false }))
  : (canvas.getContext('webgl2', { antialias: true, alpha: false })
    ?? canvas.getContext('webgl', { antialias: true, alpha: false })
    ?? canvas.getContext('experimental-webgl', { antialias: true, alpha: false }));

if (!context) throw new Error('Double Fight requires a WebGL context in the Douyin runtime.');
const contextVersion = String(context.getParameter(context.VERSION) ?? '');
configureRuntimeMaterials(/WebGL\s*2/i.test(contextVersion));

const savedTheme = platform.storage.getItem('doublefight-theme');
const theme = isThemeId(savedTheme) ? savedTheme : 'kingdom';
const game = new DouyinSoloScene(platform, client, commercial, social, audio, canvas, context, theme, auth);
installM212ProductPass(game, platform, client, auth, commercial);
installM212RetentionHub(game, platform, auth, social, commercial, engagement);
const sharedRoom = DOUYIN_PRODUCT_CONFIG.launch.sharedRoomInvitesEnabled ? social.launchRoomCode() : null;
if (DOUYIN_PRODUCT_CONFIG.launch.onlineEnabled && sharedRoom) game.openSharedRoom(sharedRoom);
const unsubscribeRoomInvite = DOUYIN_PRODUCT_CONFIG.launch.onlineEnabled
  && DOUYIN_PRODUCT_CONFIG.launch.sharedRoomInvitesEnabled
  ? social.subscribeRoomInvite(code => game.openSharedRoom(code))
  : () => {};

const touch = platform.createSwipeInput(
  (direction: Direction) => game.handleDirection(direction),
  (x, y) => game.handleTap(x, y),
);

client.subscribe((_state, message) => {
  if (message?.type === 'welcome') client.ping();
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
    platform.refreshSystemInfo();
    game.refreshSystemLayout();
    void auth.refresh().then(() => {
      if (DOUYIN_PRODUCT_CONFIG.launch.onlineEnabled) client.connect();
      else client.close();
    });
  },
  () => {
    touch.setActive(false);
    client.close();
  },
);

platform.lifecycle.show();
void auth.start().then(() => {
  game.refreshAccountState();
});
void unsubscribeRoomInvite;
void loop;
