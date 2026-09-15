import {
  MATCH_FORMAT_LABEL,
  formatMatchClock,
  matchTimerPhase,
  type Direction,
  type MatchPlayerState,
} from '../../../shared/index';
import {
  MAX_PIECE_VALUE,
  THEMES,
  pieceName,
  type ThemeId,
} from '../../../src/config/themes';
import { competitiveRankLabel } from '../../../src/meta/productMeta';
import type { PresentationEvent } from '../../../src/battle/PresentationEvents';
import type { DouyinPlatform } from '../../../src/platform/douyin/DouyinPlatform';
import type { OnlineClient } from '../../../src/network/OnlineClient';
import type { DouyinAuthClient } from './auth';
import type { DouyinCommercial } from './commercial';
import { formatDuration, loadThemeMastery, recordAscension, recordDiscovery } from './metaProgress';
import type { DouyinSoloScene } from './soloScene';

type Rect = { x: number; y: number; width: number; height: number };
type InternalScene = DouyinSoloScene & Record<string, any>;

type HighestFlight = {
  value: number;
  startedAt: number;
  duration: number;
};

interface MetaPassState {
  runStartedAt: number | null;
  runHighest: number;
  ascended: boolean;
  highestFlight: HighestFlight | null;
  profileOpen: boolean;
  rankingOpen: boolean;
  perfTime: number;
  perfFrames: number;
  goodWindows: number;
}

/**
 * M2.12 presentation extension.
 *
 * Kept outside the already-large DouyinSoloScene so the meta/retention pass can
 * be reviewed and removed independently. TypeScript `private` members compile
 * to normal instance members here; this adapter intentionally decorates only
 * presentation/runtime methods and never mutates Board2048/PvP protocol rules.
 */
export function installM212ProductPass(
  game: DouyinSoloScene,
  platform: DouyinPlatform,
  client: OnlineClient,
  auth: DouyinAuthClient,
  commercial: DouyinCommercial,
): void {
  const scene = game as InternalScene;
  const state: MetaPassState = {
    runStartedAt: null,
    runHighest: 2,
    ascended: false,
    highestFlight: null,
    profileOpen: false,
    rankingOpen: false,
    perfTime: 0,
    perfFrames: 0,
    goodWindows: 0,
  };

  // Premium Home/Battle surfaces stay ad-free. Rewarded and interstitial flows
  // remain available; Banner can be reintroduced on future secondary surfaces.
  commercial.hideBanner();

  const originalShowHome = scene.showHome.bind(scene);
  scene.showHome = () => {
    originalShowHome();
    commercial.hideBanner();
  };

  const originalStartSolo = scene.startSolo.bind(scene);
  scene.startSolo = () => {
    state.runStartedAt = null;
    state.runHighest = 2;
    state.ascended = false;
    state.highestFlight = null;
    state.profileOpen = false;
    state.rankingOpen = false;
    originalStartSolo();
  };

  // Use the first successful move as the Solo run clock origin. visualTime is
  // tied to the render loop, so time spent backgrounded is naturally excluded.
  const originalMove = game.move.bind(game);
  game.move = async (direction: Direction) => {
    const candidateStart = scene.visualTime as number;
    const changed = await originalMove(direction);
    if (changed && game.currentMode === 'solo' && state.runStartedAt === null) {
      state.runStartedAt = candidateStart;
    }
    return changed;
  };

  const originalFeedback = scene.handlePresentationFeedback.bind(scene);
  scene.handlePresentationFeedback = (event: PresentationEvent) => {
    originalFeedback(event);
    if (game.currentMode !== 'solo' || event.type !== 'merge' || event.value <= state.runHighest) return;

    state.runHighest = event.value;
    recordDiscovery(platform.storage, game.theme, event.value);
    state.highestFlight = { value: event.value, startedAt: scene.visualTime, duration: 0.72 };

    if (event.value >= MAX_PIECE_VALUE && !state.ascended && state.runStartedAt !== null) {
      state.ascended = true;
      const elapsedMs = Math.max(1, Math.round((scene.visualTime - state.runStartedAt) * 1000));
      const result = recordAscension(platform.storage, game.theme, elapsedMs);
      const badge = result.first ? '首次登顶' : result.personalBest ? 'NEW PB' : '登顶成功';
      scene.notice = {
        text: `${badge} · ${pieceName(game.theme, MAX_PIECE_VALUE)} · ${formatDuration(elapsedMs)}`,
        until: scene.visualTime + 2.4,
      };
      platform.haptics.trigger('success');
    }
    scene.refreshHud();
  };

  const originalHandleTap = game.handleTap.bind(game);
  game.handleTap = (x: number, y: number) => {
    const info = platform.getSystemInfo();
    if (state.profileOpen) {
      state.profileOpen = false;
      scene.refreshHud();
      return;
    }
    if (state.rankingOpen) {
      const panel = rankingLayout(info.width, info.height);
      if (hit(x, y, panel.solo)) {
        void scene.social.openSoloRank().then((ok: boolean) => {
          if (!ok) scene.notice = { text: 'Solo 周榜暂不可用', until: scene.visualTime + 1.3 };
          scene.refreshHud();
        });
        return;
      }
      if (hit(x, y, panel.ascension)) {
        const mastery = loadThemeMastery(platform.storage, game.theme);
        scene.notice = {
          text: mastery.bestAscensionMs
            ? `${THEMES[game.theme].label} · PB ${formatDuration(mastery.bestAscensionMs)}`
            : '先完成一次登顶，解锁竞速纪录',
          until: scene.visualTime + 1.6,
        };
        scene.refreshHud();
        return;
      }
      if (hit(x, y, panel.pvp)) {
        const rating = auth.current.status === 'authenticated' ? auth.current.player.pvp.rating : 1000;
        scene.notice = { text: `竞技赛季 · ${competitiveRankLabel(rating)} · ${rating}`, until: scene.visualTime + 1.6 };
        scene.refreshHud();
        return;
      }
      state.rankingOpen = false;
      scene.refreshHud();
      return;
    }

    if (game.currentMode === 'home') {
      const profile = profileRect(info.width, scene.hudTop());
      if (hit(x, y, profile)) {
        state.profileOpen = true;
        platform.haptics.trigger('light');
        scene.refreshHud();
        return;
      }
      const homeLayout = scene.homeLayout(info.width, info.height, info.safeArea.bottom);
      if (homeLayout?.rank && hit(x, y, homeLayout.rank)) {
        state.rankingOpen = true;
        platform.haptics.trigger('light');
        scene.refreshHud();
        return;
      }
    }
    originalHandleTap(x, y);
  };

  const originalRefreshHud = scene.refreshHud.bind(scene);
  scene.refreshHud = () => {
    originalRefreshHud();
    const info = platform.getSystemInfo();
    const ctx = scene.uiContext as CanvasRenderingContext2D;
    const width = Math.max(1, Math.round(info.width));
    const height = Math.max(1, Math.round(info.height));
    const scale = Math.min(2, Math.max(1, info.pixelRatio));
    ctx.setTransform(scale, 0, 0, scale, 0, 0);

    if (game.currentMode === 'home') drawHomeMeta(ctx, width, scene.hudTop(), game, auth, platform);
    if (game.currentMode === 'solo') drawSoloMeta(ctx, width, height, game, platform, state);
    if (game.currentMode === 'online') drawOnlineMeta(ctx, width, height, scene, client);
    if (state.profileOpen) drawProfile(ctx, width, height, auth, platform);
    if (state.rankingOpen) drawRankingHub(ctx, width, height, game.theme, auth, platform);
    scene.uiTexture.needsUpdate = true;
  };

  // Replace Douyin's high-first adaptation with a medium-first policy.
  const originalApplyQuality = scene.applyQuality.bind(scene);
  scene.applyQuality = (quality: 'high' | 'medium' | 'low', maxDpr: number) => {
    originalApplyQuality(quality, maxDpr);
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

    if (fps < 44) {
      state.goodWindows = 0;
      scene.applyQuality('low', 1);
      return;
    }
    if (fps < 54) {
      state.goodWindows = 0;
      scene.applyQuality('medium', 1.2);
      return;
    }
    if (fps >= 58) {
      state.goodWindows += 1;
      if (state.goodWindows >= 4) {
        scene.applyQuality('high', 1.45);
        state.goodWindows = 0;
      }
    } else {
      state.goodWindows = Math.max(0, state.goodWindows - 1);
    }
  };

  // Smaller shadow maps are sufficient for the cardboard/toy aesthetic.
  scene.scene.traverse((object: any) => {
    if (!object?.isDirectionalLight || !object.castShadow || !object.shadow) return;
    object.shadow.mapSize.set(512, 512);
    object.shadow.map?.dispose?.();
    object.shadow.map = null;
  });
  scene.applyQuality('medium', 1.2);

  // Initial redraw must happen after all wrappers are installed.
  scene.refreshHud();
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
  const rating = player?.pvp.rating ?? 1000;
  const balance = player?.rewards.currency ?? 0;
  const highest = Number(platform.storage.getItem(`doublefight-highest-${game.theme}`) ?? 2);

  const profile = profileRect(width, top);
  round(ctx, profile.x, profile.y, profile.width, profile.height, 15);
  ctx.fillStyle = 'rgba(8,27,35,.84)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,225,145,.35)';
  ctx.lineWidth = 1;
  ctx.stroke();

  ctx.textAlign = 'left';
  ctx.fillStyle = '#fff0bf';
  ctx.font = '850 11px sans-serif';
  ctx.fillText(player?.displayName ?? '游客玩家', profile.x + 12, profile.y + 15);
  ctx.fillStyle = '#a9c1c2';
  ctx.font = '700 9px sans-serif';
  ctx.fillText(competitiveRankLabel(rating), profile.x + 12, profile.y + 31);

  const coinWidth = 74;
  const coinX = width - 16 - coinWidth;
  round(ctx, coinX, top + 7, coinWidth, 36, 18);
  ctx.fillStyle = 'rgba(31,50,57,.90)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(242,205,105,.48)';
  ctx.stroke();
  ctx.textAlign = 'center';
  ctx.fillStyle = '#f7d66d';
  ctx.font = '900 11px sans-serif';
  ctx.fillText(`S ${balance}`, coinX + coinWidth / 2, top + 25);

  // Cover the old numeric highest/BEST line with the player-facing piece name.
  const y = Math.max(top + 72, platform.getSystemInfo().height * 0.56) + 60;
  ctx.fillStyle = 'rgba(12,28,36,.94)';
  ctx.fillRect(width / 2 - 108, y - 8, 216, 17);
  ctx.fillStyle = '#f6e9c5';
  ctx.font = '750 10px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(`最高 · ${pieceName(game.theme, highest)}`, width / 2, y);
}

function drawSoloMeta(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  game: DouyinSoloScene,
  platform: DouyinPlatform,
  state: MetaPassState,
): void {
  const top = Math.max(12, platform.getSystemInfo().safeArea.top + 8, (platform.getSystemInfo().menuButton?.bottom ?? 0) + 8);
  const highest = game.highest;
  const label = pieceName(game.theme, highest);
  const mastery = loadThemeMastery(platform.storage, game.theme);

  // Cover the old `最高 64` style text without touching the piece art itself.
  ctx.fillStyle = 'rgba(14,34,43,.97)';
  ctx.fillRect(width - 150, top + 33, 132, 18);
  ctx.textAlign = 'right';
  ctx.fillStyle = '#dfe9e6';
  ctx.font = '800 10px sans-serif';
  ctx.fillText(`最高 · ${label}`, width - 32, top + 43);

  if (mastery.bestAscensionMs !== null) {
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(255,240,190,.82)';
    ctx.font = '700 9px sans-serif';
    ctx.fillText(`登顶 PB ${formatDuration(mastery.bestAscensionMs)}`, width / 2, top + 74);
  }

  if (state.highestFlight) {
    const t = Math.max(0, Math.min(1, (state.visualNow ?? 0)));
    void t;
    const elapsed = Math.max(0, (performanceNowSeconds(sceneVisualFallback(game)) - state.highestFlight.startedAt) / state.highestFlight.duration);
    const p = Math.min(1, elapsed);
    if (p >= 1) {
      state.highestFlight = null;
    } else {
      const ease = 1 - Math.pow(1 - p, 3);
      const startX = width * 0.52;
      const startY = height * 0.48;
      const endX = width - 70;
      const endY = top + 43;
      const x = startX + (endX - startX) * ease;
      const y = startY + (endY - startY) * ease - Math.sin(Math.PI * p) * 58;
      const radius = 15 - p * 5;
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(249,211,105,${0.9 - p * 0.25})`;
      ctx.shadowColor = '#ffe58a';
      ctx.shadowBlur = 18;
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.textAlign = 'center';
      ctx.fillStyle = '#4b3420';
      ctx.font = '900 8px sans-serif';
      ctx.fillText('NEW', x, y + 1);
    }
  }

  // Replace the legacy numeric onboarding hint at the bottom.
  const safeBottom = Math.max(14, platform.getSystemInfo().safeArea.bottom + 10);
  const hintY = height - safeBottom - 65;
  ctx.fillStyle = 'rgba(8,20,27,.62)';
  ctx.fillRect(width / 2 - 100, hintY - 8, 200, 17);
  ctx.fillStyle = 'rgba(255,255,255,.72)';
  ctx.font = '650 10px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('相同棋子合成 · 解锁更高阶', width / 2, hintY);
}

function drawOnlineMeta(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  scene: InternalScene,
  client: OnlineClient,
): void {
  const snap = scene.online.snapshot();
  const top = scene.hudTop();

  if (snap.mode === 'lobby') {
    // Premium battle-loadout title block over the old configuration header.
    ctx.fillStyle = 'rgba(10,26,34,.92)';
    round(ctx, width / 2 - 120, top + 7, 240, 62, 20);
    ctx.fill();
    ctx.strokeStyle = 'rgba(242,205,105,.42)';
    ctx.stroke();
    ctx.textAlign = 'center';
    ctx.fillStyle = '#fff0bd';
    ctx.font = '900 21px sans-serif';
    ctx.fillText('准备出战', width / 2, top + 29);
    ctx.fillStyle = '#a8c4c5';
    ctx.font = '750 9px sans-serif';
    ctx.fillText(MATCH_FORMAT_LABEL, width / 2, top + 51);
    return;
  }

  if (snap.mode === 'matching') {
    const pulse = (Math.sin((scene.visualTime as number) * 4.2) + 1) / 2;
    const cy = height * 0.40;
    ctx.fillStyle = 'rgba(5,17,24,.68)';
    round(ctx, width / 2 - 132, cy - 92, 264, 184, 28);
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
    ctx.fillText('⚔  寻找同级对手', width / 2, cy + 30);
    ctx.fillStyle = '#9fbabc';
    ctx.font = '700 9px sans-serif';
    ctx.fillText(MATCH_FORMAT_LABEL, width / 2, cy + 49);
    return;
  }

  if (snap.mode !== 'playing' && snap.mode !== 'result') return;
  const remaining = scene.online.remainingMs();
  const phase = matchTimerPhase(remaining);
  const timer = formatMatchClock(remaining);
  const pulse = phase === 'final_countdown' ? 1 + Math.sin((scene.visualTime as number) * 12) * 0.06 : 1;
  const rect = { x: width / 2 - 49 * pulse, y: top + 8, width: 98 * pulse, height: 43 };
  round(ctx, rect.x, rect.y, rect.width, rect.height, 18);
  ctx.fillStyle = phase === 'final_countdown'
    ? 'rgba(125,35,31,.94)'
    : phase === 'decisive'
      ? 'rgba(117,69,25,.93)'
      : phase === 'last_minute'
        ? 'rgba(80,65,25,.92)'
        : 'rgba(8,30,38,.93)';
  ctx.fill();
  ctx.strokeStyle = phase === 'normal' ? '#77d7cf' : '#ffd36d';
  ctx.lineWidth = 1.4;
  ctx.stroke();
  ctx.textAlign = 'center';
  ctx.fillStyle = '#fff2c5';
  ctx.font = phase === 'final_countdown' ? '900 22px sans-serif' : '900 20px sans-serif';
  ctx.fillText(timer, width / 2, top + 29);
  if (phase === 'last_minute' || phase === 'decisive' || phase === 'final_countdown') {
    ctx.fillStyle = '#ffd877';
    ctx.font = '800 8px sans-serif';
    ctx.fillText(phase === 'last_minute' ? '最后一分钟' : phase === 'decisive' ? '决胜时刻' : '最终倒计时', width / 2, top + 54);
  }

  void client;
}

function drawProfile(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  auth: DouyinAuthClient,
  platform: DouyinPlatform,
): void {
  ctx.fillStyle = 'rgba(3,10,15,.76)';
  ctx.fillRect(0, 0, width, height);
  const panelW = Math.min(318, width - 28);
  const x = (width - panelW) / 2;
  const y = height * 0.18;
  const panelH = Math.min(470, height * 0.66);
  round(ctx, x, y, panelW, panelH, 28);
  ctx.fillStyle = 'rgba(9,28,36,.97)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(242,205,105,.5)';
  ctx.lineWidth = 1.2;
  ctx.stroke();

  const player = auth.current.status === 'authenticated' ? auth.current.player : null;
  const rating = player?.pvp.rating ?? 1000;
  const wins = player?.pvp.wins ?? 0;
  const losses = player?.pvp.losses ?? 0;
  const draws = player?.pvp.draws ?? 0;
  const coin = player?.rewards.currency ?? 0;

  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffe5a0';
  ctx.font = '900 23px sans-serif';
  ctx.fillText(player?.displayName ?? '游客玩家', width / 2, y + 42);
  ctx.fillStyle = '#9fd5d1';
  ctx.font = '850 12px sans-serif';
  ctx.fillText(`${competitiveRankLabel(rating)} · Rating ${rating}`, width / 2, y + 70);
  ctx.fillStyle = '#f2cf70';
  ctx.font = '900 16px sans-serif';
  ctx.fillText(`S ${coin}`, width / 2, y + 102);

  ctx.fillStyle = '#d8e5e3';
  ctx.font = '800 11px sans-serif';
  ctx.fillText(`PvP  ${wins}胜  ${losses}负  ${draws}平`, width / 2, y + 132);

  const themes: ThemeId[] = ['kingdom', 'palace'];
  themes.forEach((theme, index) => {
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
    ctx.fillText(`最高 · ${pieceName(theme, highest)}`, x + 24, rowY + 24);
    ctx.fillText(`BEST ${best.toLocaleString('zh-CN')}`, x + 24, rowY + 43);
    ctx.textAlign = 'right';
    ctx.fillStyle = mastery.bestAscensionMs ? '#f1ce70' : '#758b8e';
    ctx.fillText(mastery.bestAscensionMs ? `登顶 ${formatDuration(mastery.bestAscensionMs)}` : '尚未登顶', x + panelW - 24, rowY + 33);
  });

  ctx.textAlign = 'center';
  ctx.fillStyle = '#82999b';
  ctx.font = '700 9px sans-serif';
  ctx.fillText('点击任意位置返回', width / 2, y + panelH - 24);
}

function drawRankingHub(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  theme: ThemeId,
  auth: DouyinAuthClient,
  platform: DouyinPlatform,
): void {
  ctx.fillStyle = 'rgba(3,10,15,.76)';
  ctx.fillRect(0, 0, width, height);
  const layout = rankingLayout(width, height);
  const panel = layout.panel;
  round(ctx, panel.x, panel.y, panel.width, panel.height, 28);
  ctx.fillStyle = 'rgba(9,28,36,.98)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(242,205,105,.5)';
  ctx.stroke();

  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffe4a0';
  ctx.font = '900 23px sans-serif';
  ctx.fillText('排行榜', width / 2, panel.y + 38);
  ctx.fillStyle = '#9eb4b6';
  ctx.font = '700 9px sans-serif';
  ctx.fillText('探索 · Solo · 竞技', width / 2, panel.y + 60);

  const mastery = loadThemeMastery(platform.storage, theme);
  drawRankCard(ctx, layout.ascension, '⚡ 登顶竞速', `${THEMES[theme].label} · ${mastery.bestAscensionMs ? formatDuration(mastery.bestAscensionMs) : '未登顶'}`);
  drawRankCard(ctx, layout.solo, '🏆 Solo 周榜', '每周最高分 · 好友排行');
  const rating = auth.current.status === 'authenticated' ? auth.current.player.pvp.rating : 1000;
  drawRankCard(ctx, layout.pvp, '⚔ 竞技赛季', `14天赛季 · ${competitiveRankLabel(rating)} · ${rating}`);

  ctx.fillStyle = '#819799';
  ctx.font = '700 9px sans-serif';
  ctx.fillText('点击空白处返回', width / 2, panel.y + panel.height - 20);
}

function drawRankCard(ctx: CanvasRenderingContext2D, rect: Rect, title: string, subtitle: string): void {
  round(ctx, rect.x, rect.y, rect.width, rect.height, 18);
  ctx.fillStyle = 'rgba(21,54,64,.9)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(242,205,105,.28)';
  ctx.stroke();
  ctx.textAlign = 'left';
  ctx.fillStyle = '#fff0bd';
  ctx.font = '850 13px sans-serif';
  ctx.fillText(title, rect.x + 16, rect.y + 23);
  ctx.fillStyle = '#a9bec0';
  ctx.font = '700 9px sans-serif';
  ctx.fillText(subtitle, rect.x + 16, rect.y + 43);
}

function profileRect(width: number, top: number): Rect {
  return { x: 16, y: top + 7, width: Math.min(126, width * 0.34), height: 40 };
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

function hit(x: number, y: number, rect: Rect): boolean {
  return x >= rect.x && x <= rect.x + rect.width && y >= rect.y && y <= rect.y + rect.height;
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

function sceneVisualFallback(game: DouyinSoloScene): number {
  return Number((game as InternalScene).visualTime ?? 0);
}

function performanceNowSeconds(fallback: number): number {
  return fallback;
}
