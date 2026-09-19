import {
  MATCH_FORMAT_LABEL,
  formatMatchClock,
  matchTimerPhase,
  type Direction,
} from '../../../shared/index';
import { MAX_PIECE_VALUE, THEMES, pieceName, type ThemeId } from '../../../src/config/themes';
import type { PresentationEvent } from '../../../src/battle/PresentationEvents';
import { competitiveRankLabel } from '../../../src/meta/productMeta';
import type { DouyinPlatform } from '../../../src/platform/douyin/DouyinPlatform';
import type { OnlineClient } from '../../../src/network/OnlineClient';
import type { DouyinAuthClient } from './auth';
import type { DouyinCommercial } from './commercial';
import { formatDuration, loadThemeMastery, recordAscension, recordDiscovery } from './metaProgress';
import type { DouyinSoloScene } from './soloScene';
import { drawDouyinAvatar, drawPremiumPanel, drawSCoinIcon, drawUiIcon, fitText, hitTarget, uiMetrics, type UiIcon } from './uiSystem';

type Rect = { x: number; y: number; width: number; height: number };
type SceneInternals = Record<string, any>;

type PassState = {
  runStartedAt: number | null;
  runHighest: number;
  ascended: boolean;
  flight: { value: number; startedAt: number; duration: number } | null;
  profileOpen: boolean;
  profileBusy: boolean;
  profileMessage: string | null;
  perfTime: number;
  perfFrames: number;
  goodWindows: number;
  nextFlightHudAt: number;
  nextOnlineHudAt: number;
};

/** Adds M2.12 product presentation without changing Board2048 or Protocol v6. */
export function installM212ProductPass(
  game: DouyinSoloScene,
  platform: DouyinPlatform,
  client: OnlineClient,
  auth: DouyinAuthClient,
  commercial: DouyinCommercial,
): void {
  const scene = game as unknown as SceneInternals;
  const state: PassState = {
    runStartedAt: null,
    runHighest: 2,
    ascended: false,
    flight: null,
    profileOpen: false,
    profileBusy: false,
    profileMessage: null,
    perfTime: 0,
    perfFrames: 0,
    goodWindows: 0,
    nextFlightHudAt: 0,
    nextOnlineHudAt: 0,
  };

  // Premium gameplay surfaces remain Banner-free. Rewarded/interstitial stay.
  commercial.hideBanner();

  const originalShowHome = scene.showHome.bind(scene) as () => void;
  scene.showHome = () => { originalShowHome(); commercial.hideBanner(); };

  const originalStartSolo = scene.startSolo.bind(scene) as () => void;
  scene.startSolo = () => {
    state.runStartedAt = null;
    state.runHighest = 2;
    state.ascended = false;
    state.flight = null;
    state.profileOpen = false;
    state.profileBusy = false;
    state.profileMessage = null;
    originalStartSolo();
    state.runHighest = game.highest;
    recordDiscovery(platform.storage, game.theme, state.runHighest);
  };

  const originalMove = game.move.bind(game);
  game.move = async (direction: Direction) => {
    const candidate = number(scene.visualTime);
    const changed = await originalMove(direction);
    if (changed && game.currentMode === 'solo' && state.runStartedAt === null) state.runStartedAt = candidate;
    return changed;
  };

  const originalFeedback = scene.handlePresentationFeedback.bind(scene) as (event: PresentationEvent) => void;
  scene.handlePresentationFeedback = (event: PresentationEvent) => {
    originalFeedback(event);
    if (game.currentMode !== 'solo' || event.type !== 'merge' || event.value <= state.runHighest) return;
    state.runHighest = event.value;
    recordDiscovery(platform.storage, game.theme, event.value);
    state.flight = { value: event.value, startedAt: number(scene.visualTime), duration: 0.72 };

    if (event.value >= MAX_PIECE_VALUE && !state.ascended && state.runStartedAt !== null) {
      state.ascended = true;
      const elapsedMs = Math.max(1, Math.round((number(scene.visualTime) - state.runStartedAt) * 1000));
      recordAscension(platform.storage, game.theme, elapsedMs);
    }
    scene.refreshHud();
  };

  const originalTap = game.handleTap.bind(game);
  game.handleTap = (x: number, y: number) => {
    const info = platform.getSystemInfo();
    if (state.profileOpen) {
      const close = profileCloseRect(info.width, scene.hudTop());
      const sync = profileSyncRect(info.width, info.height);
      if (hit(x, y, close)) {
        state.profileOpen = false;
        state.profileMessage = null;
        platform.haptics.trigger('light');
        scene.refreshHud();
        return;
      }
      if (!state.profileBusy && auth.current.status === 'authenticated' && hit(x, y, sync)) {
        state.profileBusy = true;
        state.profileMessage = null;
        platform.haptics.trigger('light');
        scene.refreshHud();
        void auth.bindDouyinProfile().then(result => {
          state.profileMessage = result === 'updated' ? '已更新抖音资料' : result === 'cancelled' ? '已取消授权' : result === 'unavailable' ? '当前环境暂不支持' : '更新失败，请稍后重试';
          if (result === 'updated') {
            platform.haptics.trigger('success');
            scene.refreshAccountState();
            const socket = client.snapshot();
            if (!socket.room && socket.matchmaking.status === 'idle' && socket.match?.phase !== 'playing') {
              client.close();
              client.connect();
            }
          }
        }).finally(() => {
          state.profileBusy = false;
          if (!scene.disposed) scene.refreshHud();
        });
        return;
      }
      return;
    }

    if (game.currentMode === 'home' && !scene.settingsOpen && !scene.onboardingOpen) {
      if (hit(x, y, profileRect(info.width, scene.hudTop()))) {
        state.profileOpen = true;
        platform.haptics.trigger('light');
        scene.refreshHud();
        return;
      }
    }
    originalTap(x, y);
  };

  const originalRefresh = scene.refreshHud.bind(scene) as () => void;
  scene.refreshHud = () => {
    originalRefresh();
    const info = platform.getSystemInfo();
    const ctx = scene.uiContext as CanvasRenderingContext2D;
    const width = Math.max(1, Math.round(info.width));
    const height = Math.max(1, Math.round(info.height));
    const scale = Math.min(2, Math.max(1, info.pixelRatio));
    ctx.setTransform(scale, 0, 0, scale, 0, 0);

    const nativeModal = Boolean(scene.settingsOpen || scene.exitConfirm || scene.joinPadOpen);
    if (!nativeModal && !scene.onboardingOpen) {
      if (game.currentMode === 'home') drawHomeMeta(ctx, width, scene.hudTop(), game, auth, platform);
      if (game.currentMode === 'solo') drawSoloMeta(ctx, width, height, state, number(scene.visualTime));
      if (game.currentMode === 'online') drawOnlineMeta(ctx, width, height, scene);
      if (state.profileOpen) drawProfile(ctx, width, height, auth, platform, game.theme, scene.hudTop(), state);
    }
    scene.uiTexture.needsUpdate = true;
  };

  const originalRender = game.render.bind(game);
  game.render = () => {
    originalRender();
    const now = number(scene.visualTime);
    if (state.flight && now >= state.nextFlightHudAt) {
      state.nextFlightHudAt = now + 1 / 30;
      scene.refreshHud();
      if (now - state.flight.startedAt >= state.flight.duration) state.flight = null;
    }

    // Matching is not a duel yet, so the base scene does not schedule dynamic
    // HUD uploads. Refresh at a modest cadence for elapsed time + scan pulse.
    if (game.currentMode === 'online' && scene.online.snapshot().mode === 'matching' && now >= state.nextOnlineHudAt) {
      state.nextOnlineHudAt = now + 1 / 12;
      scene.refreshHud();
    }


  };

  // Medium-first quality avoids the current "start high, stutter, then drop" path.
  const originalApply = scene.applyQuality.bind(scene) as (quality: 'high' | 'medium' | 'low', dpr: number) => void;
  scene.applyQuality = (quality: 'high' | 'medium' | 'low', dpr: number) => {
    originalApply(quality, dpr);
    scene.renderer.shadowMap.enabled = quality === 'high';
  };
  scene.samplePerformance = (delta: number) => {
    if (!Number.isFinite(delta) || delta <= 0) return;
    state.perfTime += delta;
    state.perfFrames += 1;
    if (state.perfTime < 2) return;
    const fps = state.perfFrames / state.perfTime;
    state.perfTime = 0;
    state.perfFrames = 0;
    if (fps < 44) { state.goodWindows = 0; scene.applyQuality('low', 1); return; }
    if (fps < 54) { state.goodWindows = 0; scene.applyQuality('medium', 1.2); return; }
    if (fps >= 58) {
      state.goodWindows += 1;
      if (state.goodWindows >= 4) { scene.applyQuality('high', 1.45); state.goodWindows = 0; }
    } else state.goodWindows = Math.max(0, state.goodWindows - 1);
  };

  scene.scene.traverse((object: SceneInternals) => {
    if (!object.isDirectionalLight || !object.castShadow || !object.shadow) return;
    object.shadow.mapSize.set(512, 512);
    object.shadow.map?.dispose?.();
    object.shadow.map = null;
  });
  scene.applyQuality('medium', 1.2);
  scene.refreshHud();
  void client;
}

function drawHomeMeta(
  ctx: CanvasRenderingContext2D,
  width: number,
  top: number,
  game: DouyinSoloScene,
  auth: DouyinAuthClient,
  platform: DouyinPlatform,
): void {
  const player = auth.current.status === 'authenticated' ? auth.current.player : null;
  const rating = player?.season?.rating ?? player?.pvp.rating ?? 1000;
  const balance = player?.rewards.currency ?? 0;
  const profile = profileRect(width, top);

  round(ctx, profile.x, profile.y, profile.width, profile.height, 15);
  ctx.fillStyle = 'rgba(8,27,35,.88)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,225,145,.35)';
  ctx.stroke();
  drawDouyinAvatar(ctx, platform, player?.avatarUrl, profile.x + 22, profile.y + profile.height / 2, 30, player?.displayName ?? '游客', '#236B83');
  ctx.textAlign = 'left';
  ctx.fillStyle = '#fff0bf';
  ctx.font = '900 11px sans-serif';
  fitText(ctx, player?.displayName ?? '游客玩家', profile.width - 52, 11, 900, 8.5);
  ctx.fillText(player?.displayName ?? '游客玩家', profile.x + 43, profile.y + 15);
  ctx.fillStyle = '#D4E2E1';
  ctx.font = '800 9.5px sans-serif';
  ctx.fillText(competitiveRankLabel(rating), profile.x + 43, profile.y + 31);

  const metrics = uiMetrics(width, platform.getSystemInfo().height, platform.getSystemInfo().safeArea, platform.getSystemInfo().menuButton?.bottom ?? 0);
  const coinW = metrics.compact ? 82 : 88;
  const coinX = width - metrics.edge - coinW;
  const coinRect = { x: coinX, y: profile.y, width: coinW, height: 40 };
  drawPremiumPanel(ctx, coinRect, true);
  drawSCoinIcon(ctx, coinX + 18, profile.y + 20, 24, true);
  ctx.textAlign = 'left';
  ctx.fillStyle = '#ffe69a';
  ctx.font = '900 12px sans-serif';
  ctx.fillText(balance.toLocaleString('zh-CN'), coinX + 35, profile.y + 20);
}

function drawSoloMeta(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  state: PassState,
  visualTime: number,
): void {
  if (!state.flight) return;
  const p = Math.min(1, Math.max(0, (visualTime - state.flight.startedAt) / state.flight.duration));
  if (p >= 1) return;

  const ease = 1 - Math.pow(1 - p, 3);
  const targetX = width / 2;
  const targetY = Math.max(76, height * 0.13);
  const x = width * 0.52 + (targetX - width * 0.52) * ease;
  const y = height * 0.48 + (targetY - height * 0.48) * ease - Math.sin(Math.PI * p) * 54;

  ctx.save();
  ctx.beginPath();
  ctx.arc(x, y, 14 - p * 5, 0, Math.PI * 2);
  ctx.fillStyle = `rgba(249,211,105,${0.92 - p * 0.28})`;
  ctx.shadowColor = '#ffe58a';
  ctx.shadowBlur = 18;
  ctx.fill();
  ctx.beginPath();
  ctx.arc(x, y, 19 - p * 7, 0, Math.PI * 2);
  ctx.strokeStyle = `rgba(255,236,168,${0.62 - p * 0.42})`;
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.restore();
}

function drawOnlineMeta(ctx: CanvasRenderingContext2D, width: number, height: number, scene: SceneInternals): void {
  const snap = scene.online.snapshot();
  const top = scene.hudTop();
  if (snap.mode === 'lobby') {
    round(ctx, width / 2 - 120, top + 7, 240, 62, 20);
    ctx.fillStyle = 'rgba(10,26,34,.94)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(242,205,105,.42)';
    ctx.stroke();
    ctx.textAlign = 'center';
    ctx.fillStyle = '#fff0bd';
    ctx.font = '900 21px sans-serif';
    ctx.fillText('准备出战', width / 2, top + 29);
    ctx.fillStyle = '#a8c4c5';
    ctx.font = '750 10px sans-serif';
    ctx.fillText(MATCH_FORMAT_LABEL, width / 2, top + 51);
    return;
  }
  if (snap.mode === 'matching') {
    const pulse = (Math.sin(number(scene.visualTime) * 4.2) + 1) / 2;
    const cy = height * 0.40;
    round(ctx, width / 2 - 132, cy - 92, 264, 184, 28);
    ctx.fillStyle = 'rgba(5,17,24,.80)';
    ctx.fill();
    ctx.strokeStyle = `rgba(242,205,105,${0.28 + pulse * 0.35})`;
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(width / 2, cy - 20, 28 + pulse * 7, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(91,213,205,${0.4 + pulse * 0.45})`;
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.textAlign = 'center';
    ctx.fillStyle = '#fff0bd';
    ctx.font = '900 15px sans-serif';
    drawUiIcon(ctx, 'pvp', width / 2 - 62, cy + 29, 16, '#ffe09a');
    ctx.fillText('寻找同级对手', width / 2 + 9, cy + 30);
    const elapsed = snap.state.matchmaking.joinedAt
      ? Math.max(0, (Date.now() - snap.state.matchmaking.joinedAt) / 1000)
      : 0;
    ctx.fillStyle = '#D6E5E4';
    ctx.font = '700 10px sans-serif';
    ctx.fillText(MATCH_FORMAT_LABEL, width / 2, cy + 49);
    ctx.fillStyle = '#c8d7d6';
    ctx.font = '800 10px sans-serif';
    ctx.fillText(`已搜索 ${elapsed.toFixed(1)}s · 队列 ${Math.max(1, snap.state.matchmaking.queueSize)}`, width / 2, cy + 69);
    return;
  }
  if (snap.mode !== 'playing' && snap.mode !== 'result') return;

  const remaining = scene.online.remainingMs();
  const phase = matchTimerPhase(remaining);
  const pulse = phase === 'final_countdown' ? 1 + Math.sin(number(scene.visualTime) * 12) * 0.06 : 1;
  const rect = { x: width / 2 - 49 * pulse, y: top + 8, width: 98 * pulse, height: 43 };
  round(ctx, rect.x, rect.y, rect.width, rect.height, 18);
  ctx.fillStyle = phase === 'final_countdown' ? 'rgba(125,35,31,.96)'
    : phase === 'decisive' ? 'rgba(117,69,25,.95)'
      : phase === 'last_minute' ? 'rgba(80,65,25,.94)' : 'rgba(8,30,38,.95)';
  ctx.fill();
  ctx.strokeStyle = phase === 'normal' ? '#77d7cf' : '#ffd36d';
  ctx.lineWidth = 1.4;
  ctx.stroke();
  ctx.textAlign = 'center';
  ctx.fillStyle = '#fff2c5';
  ctx.font = phase === 'final_countdown' ? '900 22px sans-serif' : '900 20px sans-serif';
  ctx.fillText(formatMatchClock(remaining), width / 2, top + 29);
  if (phase !== 'normal' && phase !== 'finished') {
    ctx.fillStyle = '#ffd877';
    ctx.font = '800 10px sans-serif';
    ctx.fillText(phase === 'last_minute' ? '最后一分钟' : phase === 'decisive' ? '决胜时刻' : '最终倒计时', width / 2, top + 54);
  }
}

function drawProfile(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  auth: DouyinAuthClient,
  platform: DouyinPlatform,
  theme: ThemeId,
  hudTop: number,
  state: PassState,
): void {
  const bg = theme === 'palace' ? '#D88F6E' : '#72BEDA';
  const ink = '#17343C';
  const paper = '#FFF0C9';
  const accent = theme === 'palace' ? '#A94D55' : '#236B83';
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, width, height);

  const close = profileCloseRect(width, hudTop);
  drawUiIcon(ctx, 'back', close.x + close.width / 2, close.y + close.height / 2, 20, ink);
  const player = auth.current.status === 'authenticated' ? auth.current.player : null;
  const rating = player?.pvp.rating ?? 1000;
  const cardX = 24;
  const cardW = width - 48;
  const headerY = Math.max(hudTop + 54, 84);

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = ink;
  ctx.font = '900 24px sans-serif';
  ctx.fillText('我的资料', width / 2, headerY);

  round(ctx, cardX, headerY + 30, cardW, 118, 22);
  ctx.fillStyle = paper;
  ctx.fill();
  ctx.strokeStyle = ink;
  ctx.lineWidth = 2;
  ctx.stroke();

  drawDouyinAvatar(ctx, platform, player?.avatarUrl, cardX + 42, headerY + 72, 48, player?.displayName ?? '游客', accent);

  ctx.textAlign = 'left';
  ctx.fillStyle = ink;
  fitText(ctx, player?.displayName ?? '游客玩家', cardW - 118, 18, 900, 12);
  ctx.fillText(player?.displayName ?? '游客玩家', cardX + 78, headerY + 60);
  ctx.font = '800 11px sans-serif';
  ctx.fillStyle = '#38565D';
  ctx.fillText(`${competitiveRankLabel(rating)} · 竞技分 ${rating}`, cardX + 78, headerY + 84);
  ctx.fillText(player?.avatarUrl ? '已绑定抖音资料' : '可绑定抖音昵称头像', cardX + 78, headerY + 106);

  drawSCoinIcon(ctx, cardX + cardW - 68, headerY + 73, 24, true);
  ctx.fillStyle = ink;
  ctx.font = '900 16px sans-serif';
  ctx.fillText(String(player?.rewards.currency ?? 0), cardX + cardW - 50, headerY + 73);

  (['kingdom', 'palace'] as ThemeId[]).forEach((world, index) => {
    const rowY = headerY + 166 + index * 82;
    const highest = Number(platform.storage.getItem(`doublefight-highest-${world}`) ?? 2);
    const best = Number(platform.storage.getItem(`doublefight-best-${world}`) ?? 0);
    const mastery = loadThemeMastery(platform.storage, world);
    round(ctx, cardX, rowY, cardW, 66, 18);
    ctx.fillStyle = world === 'palace' ? '#F7D3C1' : '#D9F0E1';
    ctx.fill();
    ctx.strokeStyle = ink;
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.textAlign = 'left';
    ctx.fillStyle = ink;
    ctx.font = '900 13px sans-serif';
    ctx.fillText(THEMES[world].label, cardX + 16, rowY + 19);
    ctx.font = '800 10px sans-serif';
    ctx.fillText(`已到达 ${pieceName(world, highest)} · 最高分 ${best.toLocaleString('zh-CN')}`, cardX + 16, rowY + 40);
    ctx.textAlign = 'right';
    ctx.fillText(mastery.bestAscensionMs ? `最快 ${formatDuration(mastery.bestAscensionMs)}` : '尚未登顶', cardX + cardW - 16, rowY + 19);
  });

  const sync = profileSyncRect(width, height);
  round(ctx, sync.x, sync.y, sync.width, sync.height, 22);
  ctx.fillStyle = state.profileBusy || !player ? '#9AA8A7' : '#145E70';
  ctx.fill();
  ctx.strokeStyle = '#17343C';
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.textAlign = 'center';
  ctx.fillStyle = '#FFF8E8';
  ctx.font = '900 15px sans-serif';
  ctx.fillText(state.profileBusy ? '正在更新…' : player?.avatarUrl ? '更新抖音资料' : '使用抖音昵称头像', width / 2, sync.y + sync.height / 2);

  if (state.profileMessage) {
    ctx.fillStyle = ink;
    ctx.font = '800 11px sans-serif';
    ctx.fillText(state.profileMessage, width / 2, sync.y + sync.height + 24);
  }
}

function profileCloseRect(width: number, hudTop: number): Rect {
  return { x: 16, y: Math.max(16, hudTop), width: 46, height: 46 };
}

function profileSyncRect(width: number, height: number): Rect {
  return { x: 40, y: height - 112, width: width - 80, height: 52 };
}

function profileRect(width: number, top: number): Rect {
  return { x: 16, y: top + 76, width: Math.min(146, width * 0.38), height: 44 };
}

function number(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function hit(x: number, y: number, rect: Rect): boolean {
  return hitTarget(x, y, rect, 44);
}

function round(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number): void {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + width - r, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + r);
  ctx.lineTo(x + width, y + height - r);
  ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
  ctx.lineTo(x + r, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}
