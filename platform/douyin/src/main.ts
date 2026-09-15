import type { Direction } from '../../../shared/game/types';
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
const context = canvas.getContext('webgl2', { antialias: true, alpha: false })
  ?? canvas.getContext('webgl', { antialias: true, alpha: false })
  ?? canvas.getContext('experimental-webgl', { antialias: true, alpha: false });

if (!context) throw new Error('Double Fight requires a WebGL context in the Douyin runtime.');

const savedTheme = platform.storage.getItem('doublefight-theme');
const theme = savedTheme === 'palace' ? 'palace' : 'kingdom';
const game = new DouyinSoloScene(platform, client, commercial, social, audio, canvas, context, theme, auth);
installM212ProductPass(game, platform, client, auth, commercial);
installM212RetentionHub(game, platform, auth, social, engagement);
const sharedRoom = social.launchRoomCode();
if (sharedRoom) game.openSharedRoom(sharedRoom);
const unsubscribeRoomInvite = social.subscribeRoomInvite(code => game.openSharedRoom(code));

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
    void auth.start().then(() => client.connect());
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
