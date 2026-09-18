import {
  MATCH_FORMAT_LABEL,
  formatMatchClock,
  matchTimerPhase,
  type Direction,
} from '../../../shared/index';
import { MAX_PIECE_VALUE, THEMES, pieceName, type ThemeId } from '../../../src/config/themes';
import type { PresentationEvent } from '../../../src/battle/PresentationEvents';
import { competitiveRankLabel, competitiveRankProgress } from '../../../src/meta/productMeta';
import type { DouyinPlatform } from '../../../src/platform/douyin/DouyinPlatform';
import type { OnlineClient } from '../../../src/network/OnlineClient';
import type { DouyinAuthClient } from './auth';
import type { DouyinCommercial } from './commercial';
import { formatDuration, loadThemeMastery, recordAscension, recordDiscovery } from './metaProgress';
import type { DouyinSoloScene } from './soloScene';
import { drawPremiumPanel, drawSCoinIcon, drawUiIcon, fitText, hitTarget, uiMetrics, type UiIcon } from './uiSystem';

type Rect = { x: number; y: number; width: number; height: number };
type SceneInternals = Record<string, any>;

type PassState = {
  runStartedAt: number | null;
  runHighest: number;
  ascended: boolean;
  flight: { value: number; startedAt: number; duration: number } | null;
  profileOpen: boolean;
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
    if (state.profileOpen) { state.profileOpen = false; scene.refreshHud(); return; }

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
      if (state.profileOpen) drawProfile(ctx, width, height, auth, platform);
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
  ctx.textAlign = 'left';
  ctx.fillStyle = '#fff0bf';
  ctx.font = '850 11px sans-serif';
  ctx.fillText(player?.displayName ?? '游客玩家', profile.x + 12, profile.y + 15);
  ctx.fillStyle = '#a9c1c2';
  ctx.font = '700 10px sans-serif';
  ctx.fillText(competitiveRankLabel(rating), profile.x + 12, profile.y + 31);

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
    ctx.fillStyle = '#9fbabc';
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

function drawProfile(ctx: CanvasRenderingContext2D, width: number, height: number, auth: DouyinAuthClient, platform: DouyinPlatform): void {
  ctx.fillStyle = 'rgba(3,10,15,.78)';
  ctx.fillRect(0, 0, width, height);
  const panelW = Math.min(326, width - 24);
  const x = (width - panelW) / 2;
  const y = height * 0.18;
  const panelH = Math.min(470, height * 0.66);
  round(ctx, x, y, panelW, panelH, 28);
  ctx.fillStyle = 'rgba(9,28,36,.98)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(242,205,105,.5)';
  ctx.stroke();

  const player = auth.current.status === 'authenticated' ? auth.current.player : null;
  const rating = player?.pvp.rating ?? 1000;
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffe5a0';
  ctx.font = '900 23px sans-serif';
  ctx.fillText(player?.displayName ?? '游客玩家', width / 2, y + 42);
  ctx.fillStyle = '#9fd5d1';
  ctx.font = '850 12px sans-serif';
  ctx.fillText(`${competitiveRankLabel(rating)} · 竞技分 ${rating}`, width / 2, y + 70);

  const rankProgress = competitiveRankProgress(rating);
  const rankBarX = x + 52;
  const rankBarW = panelW - 104;
  round(ctx, rankBarX, y + 82, rankBarW, 5, 2.5);
  ctx.fillStyle = 'rgba(255,255,255,.13)';
  ctx.fill();
  if (rankProgress > 0) {
    round(ctx, rankBarX, y + 82, Math.max(3, rankBarW * rankProgress), 5, 2.5);
    ctx.fillStyle = '#6fd3c8';
    ctx.fill();
  }

  drawSCoinIcon(ctx, width / 2 - 35, y + 106, 24, true);
  ctx.textAlign = 'left';
  ctx.fillStyle = '#f8d979';
  ctx.font = '900 16px sans-serif';
  ctx.fillText(String(player?.rewards.currency ?? 0), width / 2 - 18, y + 106);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#d8e5e3';
  ctx.font = '800 11px sans-serif';
  ctx.fillText(`赛季  ${player?.season?.wins ?? player?.pvp.wins ?? 0}胜  ${player?.season?.losses ?? player?.pvp.losses ?? 0}负  ${player?.season?.draws ?? player?.pvp.draws ?? 0}平`, width / 2, y + 132);

  (['kingdom', 'palace'] as ThemeId[]).forEach((theme, index) => {
    const rowY = y + 174 + index * 88;
    const highest = Number(platform.storage.getItem(`doublefight-highest-${theme}`) ?? 2);
    const best = Number(platform.storage.getItem(`doublefight-best-${theme}`) ?? 0);
    const mastery = loadThemeMastery(platform.storage, theme);
    ctx.textAlign = 'left';
    ctx.fillStyle = '#fff0bc';
    ctx.font = '900 13px sans-serif';
    ctx.fillText(THEMES[theme].label, x + 24, rowY);
    ctx.fillStyle = '#b9cdce';
    ctx.font = '700 10px sans-serif';
    ctx.fillText(`已到达 · ${pieceName(theme, highest)}`, x + 24, rowY + 24);
    ctx.fillText(`最高分 ${best.toLocaleString('zh-CN')}`, x + 24, rowY + 43);
    ctx.textAlign = 'right';
    ctx.fillStyle = mastery.bestAscensionMs ? '#f1ce70' : '#758b8e';
    ctx.fillText(mastery.bestAscensionMs ? `最快 ${formatDuration(mastery.bestAscensionMs)}` : '尚未登顶', x + panelW - 24, rowY + 33);
  });

  ctx.textAlign = 'center';
  ctx.fillStyle = '#82999b';
  ctx.font = '700 10px sans-serif';
  ctx.fillText('点击任意位置返回', width / 2, y + panelH - 24);
}

function drawRankingHub(ctx: CanvasRenderingContext2D, width: number, height: number, theme: ThemeId, auth: DouyinAuthClient, platform: DouyinPlatform): void {
  ctx.fillStyle = 'rgba(3,10,15,.78)';
  ctx.fillRect(0, 0, width, height);
  const layout = rankingLayout(width, height);
  round(ctx, layout.panel.x, layout.panel.y, layout.panel.width, layout.panel.height, 28);
  ctx.fillStyle = 'rgba(9,28,36,.98)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(242,205,105,.5)';
  ctx.stroke();
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffe4a0';
  ctx.font = '900 23px sans-serif';
  ctx.fillText('排行榜', width / 2, layout.panel.y + 38);
  ctx.fillStyle = '#9eb4b6';
  ctx.font = '700 10px sans-serif';
  ctx.fillText('你的记录与排行', width / 2, layout.panel.y + 60);

  const mastery = loadThemeMastery(platform.storage, theme);
  drawRankCard(ctx, layout.ascension, '最快登顶', `${THEMES[theme].label} · ${mastery.bestAscensionMs ? formatDuration(mastery.bestAscensionMs) : '尚未登顶'}`, 'energy');
  drawRankCard(ctx, layout.solo, '最高分', '本周成绩 · 好友排行', 'rank');
  const rating = auth.current.status === 'authenticated' ? auth.current.player.pvp.rating : 1000;
  drawRankCard(ctx, layout.pvp, '竞技排行', `${competitiveRankLabel(rating)} · ${rating}`, 'pvp');
  ctx.fillStyle = '#819799';
  ctx.font = '700 10px sans-serif';
  ctx.fillText('点击空白处返回', width / 2, layout.panel.y + layout.panel.height - 20);
}

function drawOnboardingMeta(ctx: CanvasRenderingContext2D, width: number, height: number): void {
  const y = height * 0.34;
  ctx.fillStyle = 'rgba(14,42,50,.98)';
  ctx.fillRect(width / 2 - 125, y + 66, 250, 116);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#d5e1df';
  ctx.font = '700 11px sans-serif';
  ctx.fillText('角色进阶 × 技能 × 实时对决', width / 2, y + 76);
  ctx.textAlign = 'left';
  ctx.fillStyle = '#efc968';
  ctx.font = '900 10px sans-serif';
  ctx.fillText('01', width / 2 - 133, y + 112);
  ctx.fillStyle = '#f3f2e9';
  ctx.font = '850 12px sans-serif';
  ctx.fillText('滑动棋盘', width / 2 - 103, y + 106);
  ctx.fillStyle = '#9fb3b5';
  ctx.font = '650 10px sans-serif';
  ctx.fillText('相同棋子合成，解锁更高阶角色', width / 2 - 103, y + 124);
}

function drawRankCard(ctx: CanvasRenderingContext2D, rect: Rect, title: string, subtitle: string, icon: UiIcon): void {
  round(ctx, rect.x, rect.y, rect.width, rect.height, 18);
  ctx.fillStyle = 'rgba(21,54,64,.9)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(242,205,105,.28)';
  ctx.stroke();
  drawUiIcon(ctx, icon, rect.x + 24, rect.y + rect.height / 2, 20, '#f4d67e');
  ctx.textAlign = 'left';
  ctx.fillStyle = '#fff0bd';
  fitText(ctx, title, rect.width - 58, 13, 850, 10);
  ctx.fillText(title, rect.x + 44, rect.y + 23);
  ctx.fillStyle = '#a9bec0';
  fitText(ctx, subtitle, rect.width - 58, 10, 700, 8);
  ctx.fillText(subtitle, rect.x + 44, rect.y + 43);
}

function profileRect(width: number, top: number): Rect {
  return { x: 16, y: top + 76, width: Math.min(126, width * 0.34), height: 40 };
}

function rankingLayout(width: number, height: number) {
  const panelW = Math.min(320, width - 28);
  const panelH = Math.min(390, height * 0.58);
  const panel = { x: (width - panelW) / 2, y: height * 0.20, width: panelW, height: panelH };
  const cardX = panel.x + 18;
  const cardW = panel.width - 36;
  return {
    panel,
    ascension: { x: cardX, y: panel.y + 84, width: cardW, height: 62 },
    solo: { x: cardX, y: panel.y + 156, width: cardW, height: 62 },
    pvp: { x: cardX, y: panel.y + 228, width: cardW, height: 62 },
  };
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
