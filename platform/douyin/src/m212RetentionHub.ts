import { SKILL_DEFINITIONS } from '../../../shared/index';
import type { DouyinOnlineMode } from './onlineFlow';
import {
  MAX_PIECE_VALUE,
  PIECE_VALUES,
  THEMES,
  pieceName,
  pieceTier,
  type ThemeId,
} from '../../../src/config/themes';
import { S_COIN, competitiveRankLabel } from '../../../src/meta/productMeta';
import type { PresentationEvent } from '../../../src/battle/PresentationEvents';
import type { DouyinPlatform } from '../../../src/platform/douyin/DouyinPlatform';
import type { DouyinAuthClient, PvpLeaderboard } from './auth';
import type { DouyinEngagement } from './engagement';
import type { DouyinCommercial } from './commercial';
import { formatDuration, loadThemeMastery, loadWeeklySolo, recordWeeklySolo } from './metaProgress';
import type { DouyinSocial } from './social';
import { DOUYIN_PRODUCT_CONFIG } from './config';
import type { DouyinSoloScene } from './soloScene';
import { drawDouyinAvatar, drawPremiumButton, drawPremiumPanel, drawSCoinIcon, drawUiIcon, fitText, hitTarget, skillUiIcon, type UiIcon } from './uiSystem';

type Rect = { x: number; y: number; width: number; height: number };
type HubScreen = 'collection' | 'daily' | 'rankings' | 'season' | null;
type SceneInternals = Record<string, any>;

const PAGE_BG = '#72BEDA';
const PAGE_SURFACE = '#FFF0C9';
const PAGE_SURFACE_ALT = '#E6E0C8';
const PAGE_INK = '#17343C';
const PAGE_MUTED = '#46636A';

interface RetentionState {
  screen: HubScreen;
  collectionTheme: ThemeId;
  shortcutAdded: boolean | null;
  lastOnlineMode: DouyinOnlineMode | null;
  matchIntroUntil: number;
  ascensionTracked: boolean;
  matchStartRating: number | null;
  resultRatingDelta: number | null;
  telemetryStartedAt: number;
  telemetryFrames: number;
  seasonLeaderboard: PvpLeaderboard | null;
  seasonLoading: boolean;
  busyAction: 'shortcut' | 'sync' | 'sidebar' | null;
  coinBurst: { amount: number; startedAt: number } | null;
  nextCoinBurstHudAt: number;
}

/**
 * M2.12 retention/product-surface pass.
 *
 * This layer owns only Canvas presentation, user-triggered platform engagement
 * and analytics. It deliberately does not invent authoritative S Coin balances,
 * theme ownership or season rewards; those remain server-led contracts.
 */
export function installM212RetentionHub(
  game: DouyinSoloScene,
  platform: DouyinPlatform,
  auth: DouyinAuthClient,
  social: DouyinSocial,
  commercial: DouyinCommercial,
  engagement: DouyinEngagement,
): void {
  const scene = game as unknown as SceneInternals;
  const state: RetentionState = {
    screen: null,
    collectionTheme: game.theme,
    shortcutAdded: null,
    lastOnlineMode: null,
    matchIntroUntil: 0,
    ascensionTracked: false,
    matchStartRating: null,
    resultRatingDelta: null,
    telemetryStartedAt: number(scene.visualTime),
    telemetryFrames: 0,
    seasonLeaderboard: null,
    seasonLoading: false,
    busyAction: null,
    coinBurst: null,
    nextCoinBurstHudAt: 0,
  };

  engagement.track('home_view', { theme: game.theme });
  if (scene.onboardingOpen) engagement.track('onboarding_view');

  const unsubscribeDailyLogin = auth.subscribeDailyLoginGrant(grant => {
    const total = grant.amount + grant.streakAmount;
    const streakCopy = grant.streakAmount > 0 ? ` · 7日宝箱 +${grant.streakAmount} S` : '';
    state.coinBurst = { amount: total, startedAt: number(scene.visualTime) };
    scene.notice = {
      text: `每日登录 +${grant.amount} S${streakCopy}`,
      until: number(scene.visualTime) + 2.1,
    };
    platform.haptics.trigger('success');
    engagement.track('daily_login_reward', {
      amount: grant.amount,
      streak_amount: grant.streakAmount,
      total,
    });
    if (!scene.disposed) scene.refreshHud();
  });

  const originalRewarded = commercial.showRewarded.bind(commercial);
  commercial.showRewarded = async () => {
    engagement.track('rewarded_start', { mode: game.currentMode });
    const result = await originalRewarded();
    engagement.track('rewarded_complete', { mode: game.currentMode, result });
    return result;
  };
  const originalInterstitial = commercial.maybeShowInterstitial.bind(commercial);
  commercial.maybeShowInterstitial = async (force = false) => {
    const shown = await originalInterstitial(force);
    if (shown) engagement.track('interstitial_shown', { from_mode: game.currentMode });
    return shown;
  };

  const originalShareRoom = social.shareRoom.bind(social);
  social.shareRoom = async (roomCode: string) => {
    const ok = await originalShareRoom(roomCode);
    engagement.track('share_room', { success: ok });
    return ok;
  };
  const originalShareResult = social.shareResult.bind(social);
  social.shareResult = async (score: number, won: boolean) => {
    const ok = await originalShareResult(score, won);
    engagement.track('share_result', { success: ok, result: won ? 'win' : 'loss', score: Math.max(0, Math.floor(score)) });
    return ok;
  };
  void engagement.checkShortcut().then(value => {
    state.shortcutAdded = value;
    if (!scene.disposed && state.screen === 'daily') scene.refreshHud();
  });
  void auth.start().then(current => {
    if (current.status === 'authenticated') void social.setPvpRank(current.player.season?.rating ?? current.player.pvp.rating);
  });

  const originalStartSolo = scene.startSolo.bind(scene) as () => void;
  scene.startSolo = () => {
    state.screen = null;
    state.ascensionTracked = false;
    engagement.track('solo_start', { theme: game.theme });
    originalStartSolo();
  };

  const originalPersistRecord = scene.persistRecord.bind(scene) as (forceSync?: boolean) => void;
  scene.persistRecord = (forceSync = false) => {
    originalPersistRecord(forceSync);
    if (game.currentMode !== 'solo') return;
    const weekly = recordWeeklySolo(platform.storage, game.score);
    if (weekly.improved) {
      void social.setSoloRank(weekly.progress.best);
      engagement.track('solo_weekly_best', { score: weekly.progress.best });
    }
  };

  const originalShowHome = scene.showHome.bind(scene) as () => void;
  scene.showHome = () => {
    state.screen = null;
    originalShowHome();
    engagement.track('home_view', { theme: game.theme });
  };

  const originalSetTheme = game.setTheme.bind(game);
  game.setTheme = (theme: ThemeId) => {
    const changed = theme !== game.theme;
    originalSetTheme(theme);
    state.collectionTheme = theme;
    if (changed) engagement.track('theme_select', { theme });
  };

  const originalFeedback = scene.handlePresentationFeedback.bind(scene) as (event: PresentationEvent) => void;
  scene.handlePresentationFeedback = (event: PresentationEvent) => {
    const beforeTier = loadThemeMastery(platform.storage, game.theme).highestDiscoveredTier;
    originalFeedback(event);
    if (game.currentMode !== 'solo' || event.type !== 'merge') return;
    const tier = pieceTier(event.value);
    if (tier > beforeTier) {
      engagement.track('piece_discovered', {
        theme: game.theme,
        tier,
        name: pieceName(game.theme, event.value),
      });
    }
    if (event.value >= MAX_PIECE_VALUE && !state.ascensionTracked) {
      state.ascensionTracked = true;
      const mastery = loadThemeMastery(platform.storage, game.theme);
      engagement.track('ascension', {
        theme: game.theme,
        count: mastery.ascensionCount,
        best_ms: mastery.bestAscensionMs ?? 0,
      });
      if (mastery.bestAscensionMs) void social.setAscensionRank(game.theme, mastery.bestAscensionMs);
    }
  };

  const unsubscribeOnline = scene.online.subscribe(() => {
    const snap = scene.online.snapshot();
    const mode = snap.mode as DouyinOnlineMode;
    if (game.currentMode !== 'online') {
      state.lastOnlineMode = null;
      return;
    }
    if (mode === state.lastOnlineMode) return;
    const previous = state.lastOnlineMode;
    state.lastOnlineMode = mode;

    if (mode === 'lobby') engagement.track('pvp_lobby_view');
    if (mode === 'matching') engagement.track('matchmaking_start', { theme: snap.selectedTheme });
    if (mode === 'playing') {
      state.matchIntroUntil = number(scene.visualTime) + 1.25;
      state.matchStartRating = auth.current.status === 'authenticated' ? competitiveRating(auth) : null;
      state.resultRatingDelta = null;
      engagement.track('match_start', { theme: snap.me?.theme ?? snap.selectedTheme });
    }
    if (mode === 'result' && previous !== 'result') {
      const match = snap.state.match;
      const won = match?.winnerId === snap.state.playerId;
      engagement.track('match_result', {
        result: match?.winnerId === null ? 'draw' : won ? 'win' : 'loss',
        reason: match?.endReason ?? 'unknown',
      });
      // The server records Elo/W-L-D after match_end. Pull the authoritative
      // profile so the next Home/Profile render is not one match behind.
      setTimeout(() => {
        void auth.refresh().then(refreshed => {
          if (refreshed.status === 'authenticated' && state.matchStartRating !== null) {
            const settledRating = refreshed.player.season?.rating ?? refreshed.player.pvp.rating;
            state.resultRatingDelta = settledRating - state.matchStartRating;
            engagement.track('rating_settled', {
              rating: settledRating,
              delta: state.resultRatingDelta,
            });
            void social.setPvpRank(settledRating);
          }
          if (!scene.disposed) scene.refreshHud();
        });
      }, 450);
    }
    scene.refreshHud();
  });

  const originalTap = game.handleTap.bind(game);
  game.handleTap = (x: number, y: number) => {
    const info = platform.getSystemInfo();

    if (state.screen) {
      handleHubTap(scene, game, platform, auth, social, commercial, engagement, state, x, y);
      return;
    }

    if (game.currentMode === 'home' && !scene.settingsOpen && !scene.onboardingOpen) {
      const layout = scene.homeLayout(info.width, info.height, info.safeArea.bottom);

      const utility = homeUtilityLayout(info.width, layout);
      if (hit(x, y, utility.collection)) {
        state.screen = 'collection';
        state.collectionTheme = game.theme;
        platform.haptics.trigger('light');
        engagement.track('collection_open', { theme: game.theme, source: 'home' });
        scene.refreshHud();
        return;
      }
      if (hit(x, y, utility.rank)) {
        state.screen = 'rankings';
        platform.haptics.trigger('light');
        engagement.track('ranking_center_open', { theme: game.theme });
        scene.refreshHud();
        return;
      }
      if (hit(x, y, utility.daily)) {
        state.screen = 'daily';
        platform.haptics.trigger('light');
        engagement.track('daily_center_open');
        scene.refreshHud();
        void auth.refresh().then(() => { if (!scene.disposed && state.screen === 'daily') scene.refreshHud(); });
        return;
      }
      // The M2.12 three-destination row visually covers the legacy two-button
      // row. Consume its gutters so taps cannot leak through to old handlers.
      if (hit(x, y, utility.cover)) return;
    }

    const onboardingWasOpen = Boolean(scene.onboardingOpen);
    originalTap(x, y);
    if (onboardingWasOpen && !scene.onboardingOpen) engagement.track('onboarding_complete');
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

    const nativeModal = Boolean(scene.settingsOpen || scene.exitConfirm || scene.joinPadOpen || scene.onboardingOpen);
    if (!nativeModal && !state.screen) {
      if (game.currentMode === 'home') drawHomeUtility(ctx, width, height, scene, auth);
      if (game.currentMode === 'online') drawOnlinePolish(ctx, width, height, scene, state, auth);
    }

    if (state.screen === 'collection') drawCollection(ctx, width, height, platform, state);
    if (state.screen === 'daily') drawDailyCenter(ctx, width, height, scene, auth, state);
    if (state.screen === 'rankings') drawRankingCenter(ctx, width, height, game, platform, auth);
    if (state.screen === 'season') drawSeasonLeaderboard(ctx, width, height, state, auth, platform);
    if (state.coinBurst) drawCoinBurst(ctx, width, height, state.coinBurst, number(scene.visualTime));

    scene.uiTexture.needsUpdate = true;
  };

  const originalRender = game.render.bind(game);
  game.render = () => {
    originalRender();
    state.telemetryFrames += 1;
    const now = number(scene.visualTime);
    if (state.coinBurst) {
      const age = now - state.coinBurst.startedAt;
      if (age >= 1.25) {
        state.coinBurst = null;
        scene.refreshHud();
      } else if (now >= state.nextCoinBurstHudAt) {
        state.nextCoinBurstHudAt = now + 1 / 30;
        scene.refreshHud();
      }
    }
    const elapsed = now - state.telemetryStartedAt;
    if (elapsed < 30) return;

    const rendererInfo = scene.renderer?.info?.render;
    const fps = elapsed > 0 ? Math.round((state.telemetryFrames / elapsed) * 10) / 10 : 0;
    engagement.track('performance_sample', {
      fps,
      quality: String(scene.quality ?? 'unknown'),
      dpr: Math.round(number(scene.currentDpr) * 100) / 100,
      calls: Number(rendererInfo?.calls ?? 0),
      triangles: Number(rendererInfo?.triangles ?? 0),
      mode: game.currentMode,
    });
    state.telemetryStartedAt = now;
    state.telemetryFrames = 0;
  };

  const originalDispose = game.dispose.bind(game);
  game.dispose = () => {
    unsubscribeOnline();
    unsubscribeDailyLogin();
    originalDispose();
  };

  scene.refreshHud();
}

function handleHubTap(
  scene: SceneInternals,
  game: DouyinSoloScene,
  platform: DouyinPlatform,
  auth: DouyinAuthClient,
  social: DouyinSocial,
  commercial: DouyinCommercial,
  engagement: DouyinEngagement,
  state: RetentionState,
  x: number,
  y: number,
): void {
  const info = platform.getSystemInfo();
  if (scene.inputLocked || state.busyAction) {
    platform.haptics.trigger('light');
    scene.notice = { text: '正在处理，请稍候…', until: number(scene.visualTime) + .9 };
    scene.refreshHud();
    return;
  }


  if (state.screen === 'collection') {
    const layout = collectionLayout(info.width, info.height);
    if (hit(x, y, layout.close)) {
      state.screen = null;
      scene.refreshHud();
      return;
    }
    if (hit(x, y, layout.kingdom)) {
      state.collectionTheme = 'kingdom';
      engagement.track('collection_theme', { theme: 'kingdom' });
      scene.refreshHud();
      return;
    }
    if (hit(x, y, layout.palace)) {
      state.collectionTheme = 'palace';
      engagement.track('collection_theme', { theme: 'palace' });
      scene.refreshHud();
      return;
    }
    return;
  }

  if (state.screen === 'rankings') {
    const layout = rankingCenterLayout(info.width, info.height);
    if (hit(x, y, layout.close)) {
      state.screen = null;
      scene.refreshHud();
      return;
    }
    if (hit(x, y, layout.ascension)) {
      void social.openAscensionRank(game.theme).then(ok => {
        scene.notice = {
          text: ok ? '已打开登顶竞速榜' : '当前环境暂不支持登顶榜',
          until: number(scene.visualTime) + 1.4,
        };
        engagement.track('rank_open', { board: 'ascension', success: ok, theme: game.theme });
        scene.refreshHud();
      });
      return;
    }
    if (hit(x, y, layout.solo)) {
      void social.openSoloRank().then(ok => {
        scene.notice = {
          text: ok ? '已打开最高分榜' : '当前环境暂不支持最高分榜',
          until: number(scene.visualTime) + 1.4,
        };
        engagement.track('rank_open', { board: 'solo_weekly', success: ok });
        scene.refreshHud();
      });
      return;
    }
    if (hit(x, y, layout.pvp)) {
      state.screen = 'season';
      requestSeasonLeaderboard(scene, auth, engagement, state);
      platform.haptics.trigger('light');
      return;
    }
    return;
  }

  if (state.screen === 'season') {
    const layout = seasonLeaderboardLayout(info.width, info.height);
    if (hit(x, y, layout.close)) {
      state.screen = 'rankings';
      scene.refreshHud();
      return;
    }
    if (hit(x, y, layout.social)) {
      void social.openPvpRank().then(ok => {
        scene.notice = {
          text: ok ? '已打开竞技好友榜' : '当前环境暂不支持好友榜',
          until: number(scene.visualTime) + 1.4,
        };
        engagement.track('rank_open', { board: 'pvp_social', success: ok });
        scene.refreshHud();
      });
      return;
    }
    if (hit(x, y, layout.refresh)) {
      requestSeasonLeaderboard(scene, auth, engagement, state);
      return;
    }
    return;
  }

  if (state.screen === 'daily') {
    const layout = dailyLayout(info.width, info.height);
    if (hit(x, y, layout.close)) {
      state.screen = null;
      scene.refreshHud();
      return;
    }
    if (hit(x, y, layout.dailyAd)) {
      if (auth.current.status !== 'authenticated') {
        scene.notice = { text: '正在连接奖励账号…', until: number(scene.visualTime) + 1.6 };
        scene.refreshHud();
        void auth.refresh().then(current => {
          scene.notice = {
            text: current.status === 'authenticated' ? '账号已连接 · 可领取今日 S 币' : '奖励账号暂不可用',
            until: number(scene.visualTime) + 1.6,
          };
          if (!scene.disposed) scene.refreshHud();
        });
        return;
      }
      const alreadyClaimed = auth.current.player.rewards.daily?.adClaimed === true;
      if (alreadyClaimed) {
        scene.notice = { text: '今日广告 S 币已领取', until: number(scene.visualTime) + 1.4 };
        scene.refreshHud();
        return;
      }
      void claimDailyCoinReward(scene, platform, auth, commercial, engagement, state);
      return;
    }
    if (hit(x, y, layout.sidebar)) {
      const ready = Boolean(scene.sidebarRewardReady?.());
      engagement.track('sidebar_action', { ready });
      if (ready) {
        void scene.claimSidebarReward?.().finally(() => scene.refreshHud());
      } else {
        state.busyAction = 'sidebar';
        scene.notice = { text: '正在打开侧边栏…', until: number(scene.visualTime) + 2 };
        scene.refreshHud();
        void social.navigateSidebar().then(ok => {
          scene.notice = {
            text: ok ? '已打开侧边栏入口' : '当前环境暂不支持侧边栏',
            until: number(scene.visualTime) + 1.5,
          };
          engagement.track('sidebar_navigate', { success: ok });
        }).finally(() => {
          state.busyAction = null;
          scene.refreshHud();
        });
      }
      return;
    }
    if (hit(x, y, layout.shortcut)) {
      // Keep the native call in the direct touch stack; Douyin requires this.
      state.busyAction = 'shortcut';
      scene.notice = { text: '正在请求添加桌面…', until: number(scene.visualTime) + 2 };
      scene.refreshHud();
      void engagement.addShortcutFromTap().then(result => {
        if (result === 'added') state.shortcutAdded = true;
        scene.notice = {
          text: result === 'added' ? '已添加到桌面' : result === 'cancelled' ? '已取消添加' : '当前环境暂不支持添加桌面',
          until: number(scene.visualTime) + 1.5,
        };
        engagement.track('shortcut_result', { result });
      }).finally(() => {
        state.busyAction = null;
        scene.refreshHud();
      });
      return;
    }
    if (hit(x, y, layout.refreshAccount)) {
      state.busyAction = 'sync';
      scene.notice = { text: '正在同步账号进度…', until: number(scene.visualTime) + 2 };
      scene.refreshHud();
      void auth.refresh().then(() => {
        scene.notice = {
          text: auth.current.status === 'authenticated' ? '账号进度已同步' : '当前为本地游客进度',
          until: number(scene.visualTime) + 1.4,
        };
      }).finally(() => {
        state.busyAction = null;
        scene.refreshHud();
      });
      return;
    }
    if (
      DOUYIN_PRODUCT_CONFIG.retention.subscriptionTemplates.length > 0
      && hit(x, y, layout.subscription)
    ) {
      void engagement.requestSubscriptionFromTap(DOUYIN_PRODUCT_CONFIG.retention.subscriptionTemplates).then(result => {
        scene.notice = {
          text: result ? '已提交提醒订阅选择' : '当前环境暂不支持订阅提醒',
          until: number(scene.visualTime) + 1.5,
        };
        engagement.track('subscription_result', { success: Boolean(result) });
        scene.refreshHud();
      });
    }
  }
}

function requestSeasonLeaderboard(
  scene: SceneInternals,
  auth: DouyinAuthClient,
  engagement: DouyinEngagement,
  state: RetentionState,
): void {
  if (state.seasonLoading) return;
  state.seasonLoading = true;
  scene.refreshHud();
  void auth.fetchPvpLeaderboard(20).then(board => {
    state.seasonLeaderboard = board;
    state.seasonLoading = false;
    engagement.track('rank_open', { board: 'pvp_season', success: Boolean(board) });
    if (!board) {
      scene.notice = { text: '赛季榜暂时无法加载', until: number(scene.visualTime) + 1.5 };
    }
    if (!scene.disposed && state.screen === 'season') scene.refreshHud();
  });
}

async function claimDailyCoinReward(
  scene: SceneInternals,
  platform: DouyinPlatform,
  auth: DouyinAuthClient,
  commercial: DouyinCommercial,
  engagement: DouyinEngagement,
  state: RetentionState,
): Promise<void> {
  if (scene.inputLocked) return;
  scene.inputLocked = true;
  scene.notice = { text: '正在准备今日 S 币奖励…', until: number(scene.visualTime) + 8 };
  scene.refreshHud();
  const ad = await commercial.showRewarded();
  if (ad !== 'rewarded') {
    scene.inputLocked = false;
    scene.notice = {
      text: ad === 'skipped' ? '完整观看后才能领取 S 币' : '暂时没有可用广告',
      until: number(scene.visualTime) + 1.5,
    };
    scene.refreshHud();
    return;
  }

  await auth.start();
  const claimId = `${Date.now()}_${Math.random().toString(36).slice(2)}_daily`;
  const result = auth.requiresServerLedger
    ? await auth.claimDailySCoinDetailed(claimId)
    : { status: 'unavailable' as const, amount: 0, taskAmount: 0 };
  scene.inputLocked = false;
  if (result.status === 'granted') {
    platform.haptics.trigger('success');
    const total = result.amount + result.taskAmount;
    const taskCopy = result.taskAmount > 0 ? ` · 广告任务 +${result.taskAmount} S` : '';
    state.coinBurst = { amount: total, startedAt: number(scene.visualTime) };
    scene.notice = {
      text: `今日广告奖励 +${result.amount || 30} S${taskCopy}`,
      until: number(scene.visualTime) + 1.8,
    };
    engagement.track('daily_coin_reward', {
      result: 'granted',
      amount: result.amount,
      task_amount: result.taskAmount,
      total,
    });
  } else {
    scene.notice = {
      text: result.status === 'duplicate' ? '今日广告 S 币已领取' : 'S 币服务暂不可用',
      until: number(scene.visualTime) + 1.6,
    };
    engagement.track('daily_coin_reward', { result: result.status });
  }
  scene.refreshHud();
}

function drawHomeUtility(ctx: CanvasRenderingContext2D, width: number, height: number, scene: SceneInternals, auth: DouyinAuthClient): void {
  const info = scene.platform.getSystemInfo();
  const layout = scene.homeLayout(width, height, info.safeArea.bottom);
  const utility = homeUtilityLayout(width, layout);
  const theme = (scene.currentTheme ?? scene.boardView?.theme ?? 'kingdom') as ThemeId;
  miniHomeButton(ctx, utility.collection, 'collection', '图鉴', false, theme);
  miniHomeButton(ctx, utility.rank, 'rank', '排行', false, theme);
  const daily = auth.current.status === 'authenticated' ? auth.current.player.rewards.daily : undefined;
  const benefitReady = Boolean(scene.sidebarRewardReady?.()) || daily?.adClaimed === false;
  miniHomeButton(ctx, utility.daily, 'gift', '福利', benefitReady, theme);
}

function drawRankingCenter(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  game: DouyinSoloScene,
  platform: DouyinPlatform,
  auth: DouyinAuthClient,
): void {
  const layout = rankingCenterLayout(width, height);
  shade(ctx, width, height);
  panel(ctx, layout.panel);
  closeGlyph(ctx, layout.close);

  const mastery = loadThemeMastery(platform.storage, game.theme);
  const weekly = loadWeeklySolo(platform.storage);
  const rating = competitiveRating(auth);
  ctx.textAlign = 'center';
  ctx.fillStyle = PAGE_INK;
  ctx.font = '900 24px sans-serif';
  ctx.fillText('排行榜', width / 2, layout.panel.y + 38);
  ctx.fillStyle = PAGE_MUTED;
  ctx.font = '700 10px sans-serif';
  ctx.fillText('你的记录与排行', width / 2, layout.panel.y + 62);

  actionCard(
    ctx,
    layout.ascension,
    '最快登顶',
    `${THEMES[game.theme].label} · ${mastery.bestAscensionMs ? formatDuration(mastery.bestAscensionMs) : '尚未登顶'}`,
    Boolean(mastery.bestAscensionMs),
    'energy',
  );
  actionCard(
    ctx,
    layout.solo,
    '最高分',
    weekly.best > 0 ? `本周 ${weekly.best.toLocaleString('zh-CN')}` : '本周还没有成绩',
    weekly.best > 0,
    'rank',
  );
  actionCard(
    ctx,
    layout.pvp,
    '竞技排行',
    `${competitiveRankLabel(rating)} · ${rating}`,
    true,
    'pvp',
  );

  ctx.fillStyle = PAGE_MUTED;
  ctx.font = '700 10px sans-serif';
  ctx.fillText('点击一项查看排行', width / 2, layout.panel.y + layout.panel.height - 22);
}

function drawSeasonLeaderboard(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  state: RetentionState,
  auth: DouyinAuthClient,
  platform: DouyinPlatform,
): void {
  const layout = seasonLeaderboardLayout(width, height);
  shade(ctx, width, height);
  panel(ctx, layout.panel);
  closeGlyph(ctx, layout.close);

  const playerRating = auth.current.status === 'authenticated'
    ? auth.current.player.season?.rating ?? auth.current.player.pvp.rating
    : 1000;

  ctx.textAlign = 'center';
  ctx.fillStyle = PAGE_INK;
  ctx.font = '900 23px sans-serif';
  ctx.fillText('竞技赛季', width / 2, layout.panel.y + 36);
  ctx.fillStyle = PAGE_MUTED;
  ctx.font = '700 10px sans-serif';
  ctx.fillText(`${competitiveRankLabel(playerRating)} · 竞技分 ${playerRating}`, width / 2, layout.panel.y + 58);

  if (state.seasonLoading) {
    ctx.fillStyle = PAGE_INK;
    ctx.font = '850 13px sans-serif';
    ctx.fillText('正在加载排行…', width / 2, layout.panel.y + 150);
  } else if (!state.seasonLeaderboard) {
    ctx.fillStyle = PAGE_MUTED;
    ctx.font = '800 12px sans-serif';
    ctx.fillText('赛季榜暂时无法加载', width / 2, layout.panel.y + 145);
    drawPremiumButton(ctx, layout.refresh, '重试', { kind: 'secondary', icon: 'sync' });
  } else {
    const board = state.seasonLeaderboard;
    const end = formatShortDate(board.season.endsAt);
    ctx.fillStyle = '#236B83';
    ctx.font = '800 10px sans-serif';
    ctx.fillText(`本赛季 ${end} 结束`, width / 2, layout.panel.y + 82);

    if (board.entries.length === 0) {
      ctx.fillStyle = PAGE_MUTED;
      ctx.font = '800 12px sans-serif';
      ctx.fillText('本赛季还没有有效对局', width / 2, layout.panel.y + 150);
    } else {
      const rowStart = layout.panel.y + 100;
      const available = Math.max(0, layout.social.y - rowStart - 10);
      const visibleRows = Math.max(1, Math.min(9, Math.floor(available / 39)));
      board.entries.slice(0, visibleRows).forEach((entry, index) => {
        const row = {
          x: layout.panel.x + 16,
          y: rowStart + index * 39,
          width: layout.panel.width - 32,
          height: 33,
        };
        round(ctx, row.x, row.y, row.width, row.height, 12);
        ctx.fillStyle = index < 3 ? 'rgba(47,69,57,.92)' : 'rgba(17,46,55,.86)';
        ctx.fill();
        ctx.textAlign = 'left';
        ctx.fillStyle = index === 0 ? '#ffe083' : '#dce8e4';
        ctx.font = '900 11px sans-serif';
        ctx.fillText(index < 3 ? ['Ⅰ','Ⅱ','Ⅲ'][index] : String(entry.rank), row.x + 12, row.y + 17);
        drawDouyinAvatar(ctx, platform, entry.avatarUrl, row.x + 43, row.y + 16.5, 24, entry.displayName, index < 3 ? '#8A5A13' : '#236B83');
        ctx.fillStyle = '#edf1eb';
        ctx.font = '800 10px sans-serif';
        ctx.fillText(entry.displayName.slice(0, 10), row.x + 61, row.y + 17);
        ctx.textAlign = 'right';
        ctx.fillStyle = '#f0cf72';
        ctx.font = '900 10px sans-serif';
        ctx.fillText(String(entry.rating), row.x + row.width - 12, row.y + 15);
        ctx.fillStyle = '#C8D8D7';
        ctx.font = '800 8px sans-serif';
        ctx.fillText(`${entry.wins}胜 ${entry.losses}负 ${entry.draws}平`, row.x + row.width - 12, row.y + 27);
      });
    }
  }

  drawPremiumButton(ctx, layout.social, '抖音好友榜', { kind: 'secondary', icon: 'rank' });
}

function drawCollection(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  platform: DouyinPlatform,
  state: RetentionState,
): void {
  const layout = collectionLayout(width, height);
  shade(ctx, width, height);
  panel(ctx, layout.panel);
  closeGlyph(ctx, layout.close);

  ctx.textAlign = 'center';
  ctx.fillStyle = PAGE_INK;
  ctx.font = '900 23px sans-serif';
  ctx.fillText('棋子图鉴', width / 2, layout.panel.y + 36);
  ctx.fillStyle = PAGE_MUTED;
  ctx.font = '700 10px sans-serif';
  ctx.fillText('收集这个世界的 11 个阶位', width / 2, layout.panel.y + 58);

  tab(ctx, layout.kingdom, '微缩王国', state.collectionTheme === 'kingdom');
  tab(ctx, layout.palace, '后宫晋升', state.collectionTheme === 'palace');

  const mastery = loadThemeMastery(platform.storage, state.collectionTheme);
  const values = [...PIECE_VALUES];
  values.forEach((value, index) => {
    const rect = layout.cells[index];
    const tier = index + 1;
    const unlocked = tier <= mastery.highestDiscoveredTier;
    round(ctx, rect.x, rect.y, rect.width, rect.height, 15);
    ctx.fillStyle = unlocked ? '#DDECB8' : '#D8D2BF';
    ctx.fill();
    ctx.strokeStyle = PAGE_INK;
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.textAlign = 'left';
    ctx.fillStyle = unlocked ? '#8A5A13' : PAGE_MUTED;
    ctx.font = '900 10px sans-serif';
    ctx.fillText(`${tier}/11`, rect.x + 11, rect.y + 15);
    ctx.fillStyle = unlocked ? PAGE_INK : '#657076';
    ctx.font = '850 11px sans-serif';
    ctx.fillText(unlocked ? pieceName(state.collectionTheme, value) : '未发现', rect.x + 11, rect.y + 34);
    if (value === MAX_PIECE_VALUE) {
      ctx.textAlign = 'right';
      ctx.fillStyle = unlocked ? '#8A5A13' : PAGE_MUTED;
      ctx.font = '900 10px sans-serif';
      ctx.fillText('终阶', rect.x + rect.width - 10, rect.y + 16);
    }
  });

  ctx.textAlign = 'center';
  ctx.fillStyle = PAGE_MUTED;
  ctx.font = '750 10px sans-serif';
  ctx.fillText(
    `已发现 ${mastery.highestDiscoveredTier}/11 · ${THEMES[state.collectionTheme].label}`,
    width / 2,
    layout.panel.y + layout.panel.height - 22,
  );
}

function drawDailyCenter(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  scene: SceneInternals,
  auth: DouyinAuthClient,
  state: RetentionState,
): void {
  const layout = dailyLayout(width, height);
  shade(ctx, width, height);
  panel(ctx, layout.panel);
  closeGlyph(ctx, layout.close);

  const player = auth.current.status === 'authenticated' ? auth.current.player : null;
  const balance = player?.rewards.currency ?? 0;
  const daily = player?.rewards.daily;
  const tasks = daily?.tasks ?? { solo: false, pvp: false, ad: false };
  const taskCount = Number(tasks.solo) + Number(tasks.pvp) + Number(tasks.ad);
  const today = new Date().toISOString().slice(0, 10);
  const sidebarClaimed = player?.rewards.lastSidebarRewardDay === today;
  const sidebarReady = !sidebarClaimed && Boolean(scene.sidebarRewardReady?.());

  ctx.textAlign = 'center';
  ctx.fillStyle = PAGE_INK;
  ctx.font = '900 23px sans-serif';
  ctx.fillText('今日福利', width / 2, layout.panel.y + 34);
  ctx.fillStyle = PAGE_MUTED;
  ctx.font = '700 10px sans-serif';
  ctx.fillText('登录和任务奖励', width / 2, layout.panel.y + 54);

  drawPremiumPanel(ctx, layout.balance, true);
  drawSCoinIcon(ctx, layout.balance.x + 28, layout.balance.y + 27, 34, true);
  ctx.textAlign = 'left';
  ctx.fillStyle = '#ffe18a';
  ctx.font = '900 23px sans-serif';
  ctx.fillText(balance.toLocaleString('zh-CN'), layout.balance.x + 52, layout.balance.y + 25);
  ctx.fillStyle = '#D4E2E1';
  ctx.font = '800 10px sans-serif';
  ctx.fillText(
    daily?.loginClaimed ? `连续 ${daily.streak} 天` : '登录后自动领取',
    layout.balance.x + 52,
    layout.balance.y + 45,
  );
  ctx.textAlign = 'center';

  round(ctx, layout.progress.x, layout.progress.y, layout.progress.width, layout.progress.height, 17);
  ctx.fillStyle = PAGE_SURFACE_ALT;
  ctx.fill();
  ctx.strokeStyle = PAGE_INK;
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.textAlign = 'left';
  ctx.fillStyle = PAGE_INK;
  ctx.font = '900 12px sans-serif';
  ctx.fillText(`今日任务  ${taskCount}/3`, layout.progress.x + 14, layout.progress.y + 20);
  ctx.fillStyle = PAGE_MUTED;
  ctx.font = '800 10px sans-serif';
  ctx.fillText(
    `单机 ${tasks.solo ? '✓' : '○'}   对战 ${tasks.pvp ? '✓' : '○'}   广告 ${tasks.ad ? '✓' : '○'}`,
    layout.progress.x + 14,
    layout.progress.y + 42,
  );

  const adClaimed = daily?.adClaimed === true;
  const rewardBusy = Boolean(scene.inputLocked);
  actionCard(
    ctx,
    layout.dailyAd,
    rewardBusy ? '正在领取…' : adClaimed ? '今日已领取' : '看广告领 30 S币',
    rewardBusy ? '请稍候' : adClaimed ? '明天再来' : '完整看完即可领取',
    !rewardBusy && !adClaimed && Boolean(player),
    rewardBusy ? 'sync' : adClaimed ? 'check' : 'video',
  );

  actionCard(
    ctx,
    layout.sidebar,
    state.busyAction === 'sidebar' ? '正在打开…' : sidebarClaimed ? '今日已领取' : sidebarReady ? '领取 10 S币' : '侧边栏奖励',
    sidebarClaimed ? '明天再来' : sidebarReady ? '同时获得下局清障 +1' : '从侧边栏返回即可领取',
    sidebarReady,
    sidebarClaimed ? 'check' : 'gift',
  );

  actionCard(
    ctx,
    layout.shortcut,
    state.busyAction === 'shortcut' ? '正在添加到桌面…' : state.shortcutAdded ? '已添加到桌面' : '添加到桌面',
    state.shortcutAdded ? '下次可以直接打开' : '下次打开更方便',
    !state.shortcutAdded,
    state.shortcutAdded ? 'check' : 'share',
  );

  actionCard(
    ctx,
    layout.refreshAccount,
    state.busyAction === 'sync' ? '正在刷新…' : '刷新数据',
    player ? '已登录' : '当前为游客',
    !player,
    'sync',
  );

  if (DOUYIN_PRODUCT_CONFIG.retention.subscriptionTemplates.length > 0) {
    actionCard(
      ctx,
      layout.subscription,
      '订阅赛季提醒',
      '由你主动授权 · 可随时在抖音设置中管理',
      false,
    );
  }

  ctx.textAlign = 'center';
  ctx.fillStyle = PAGE_MUTED;
  ctx.font = '700 10px sans-serif';
  ctx.fillText('S币可用于解锁主题', width / 2, layout.panel.y + layout.panel.height - 16);
}

function drawCoinBurst(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  burst: { amount: number; startedAt: number },
  now: number,
): void {
  const p = Math.max(0, Math.min(1, (now - burst.startedAt) / 1.1));
  const ease = 1 - Math.pow(1 - p, 3);
  const alpha = Math.max(0, 1 - Math.max(0, p - .72) / .28);
  const centerX = width / 2;
  const centerY = height * .38 - ease * 42;
  ctx.save();
  ctx.globalAlpha = alpha;
  for (let index = 0; index < 5; index += 1) {
    const phase = index / 4 - .5;
    const x = centerX + phase * 92 * Math.sin(Math.PI * Math.min(1, p * 1.25));
    const y = centerY - Math.abs(phase) * 18 + Math.sin((p + index * .13) * Math.PI) * -12;
    drawSCoinIcon(ctx, x, y, 20 + (index === 2 ? 5 : 0), index === 2);
  }
  const panel = { x: centerX - 62, y: centerY + 34, width: 124, height: 36 };
  drawPremiumPanel(ctx, panel, true);
  drawSCoinIcon(ctx, panel.x + 21, panel.y + 18, 22, true);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#ffe493';
  ctx.font = '900 15px sans-serif';
  ctx.fillText(`+${Math.max(0, Math.floor(burst.amount))}`, panel.x + 40, panel.y + 18);
  ctx.restore();
}

function drawOnlinePolish(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  scene: SceneInternals,
  state: RetentionState,
  auth: DouyinAuthClient,
): void {
  const snap = scene.online.snapshot();
  if (snap.mode === 'lobby') {
    const layout = scene.onlineLobbyLayout(width, height);
    const rating = auth.current.status === 'authenticated' ? auth.current.player.pvp.rating : 1000;
    round(ctx, width / 2 - 76, scene.hudTop() + 70, 152, 20, 10);
    ctx.fillStyle = 'rgba(8,28,36,.82)';
    ctx.fill();
    ctx.textAlign = 'center';
    ctx.fillStyle = '#D8E8E5';
    ctx.font = '850 10px sans-serif';
    ctx.fillText(`${competitiveRankLabel(rating)} · 竞技分 ${rating}`, width / 2, scene.hudTop() + 80);
    snap.loadout.forEach((skillId: keyof typeof SKILL_DEFINITIONS, index: number) => {
      const rect = layout.skills[index] as Rect;
      const def = SKILL_DEFINITIONS[skillId];
      round(ctx, rect.x, rect.y, rect.width, rect.height, 17);
      ctx.fillStyle = 'rgba(9,37,47,.94)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(242,205,105,.55)';
      ctx.lineWidth = 1.2;
      ctx.stroke();
      drawUiIcon(ctx, skillUiIcon(skillId), rect.x + 17, rect.y + 20, 16, '#ffe09a');
      ctx.textAlign = 'center';
      ctx.fillStyle = '#fff0b8';
      ctx.font = '900 10.5px sans-serif';
      ctx.fillText(def.shortLabel, rect.x + rect.width / 2 + 5, rect.y + 20);
      ctx.fillStyle = '#C8DDDA';
      ctx.font = '800 9px sans-serif';
      ctx.fillText(`${def.cost} 能量 · 技能位 ${index + 1}`, rect.x + rect.width / 2, rect.y + 41);
    });
    return;
  }

  if (snap.mode === 'playing') {
    const rects = scene.duelSkillRects(width, height) as Rect[];
    const dock = {
      x: 10,
      y: rects[0].y - 10,
      width: width - 20,
      height: rects[0].height + 20,
    };
    round(ctx, dock.x, dock.y, dock.width, dock.height, 22);
    ctx.fillStyle = 'rgba(5,20,28,.72)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,226,145,.16)';
    ctx.stroke();

    const me = snap.me;
    me?.loadout.forEach((skillId: keyof typeof SKILL_DEFINITIONS, index: number) => {
      const def = SKILL_DEFINITIONS[skillId];
      const rect = rects[index];
      const remaining = Math.max(0, (me.skillCooldowns[skillId] ?? 0) - scene.online.serverNow());
      const ready = remaining <= 0 && me.energy >= def.cost;
      const pulse = ready ? 0.42 + (Math.sin(number(scene.visualTime) * 5.5) + 1) * 0.12 : 0.16;
      round(ctx, rect.x, rect.y, rect.width, rect.height, 15);
      ctx.fillStyle = ready ? 'rgba(18,76,82,.96)' : 'rgba(35,48,54,.93)';
      ctx.fill();
      ctx.strokeStyle = ready ? `rgba(245,210,108,${pulse})` : 'rgba(116,133,136,.35)';
      ctx.lineWidth = ready ? 1.8 : 1;
      ctx.stroke();
      drawUiIcon(
        ctx,
        skillUiIcon(skillId),
        rect.x + 15,
        rect.y + 18,
        15,
        ready ? '#ffe09a' : '#839396',
      );
      ctx.textAlign = 'center';
      ctx.fillStyle = ready ? '#fff0b8' : '#a5b2b3';
      ctx.font = '900 9.5px sans-serif';
      ctx.fillText(def.shortLabel, rect.x + rect.width / 2 + 5, rect.y + 18);
      ctx.fillStyle = ready ? '#74e1d5' : '#839396';
      ctx.font = '800 9.5px sans-serif';
      ctx.fillText(
        remaining > 0 ? `${(remaining / 1000).toFixed(1)}s` : ready ? 'READY' : `${def.cost} 能量`,
        rect.x + rect.width / 2,
        rect.y + 37,
      );
    });

    if (number(scene.visualTime) < state.matchIntroUntil) {
      const remain = Math.max(0, state.matchIntroUntil - number(scene.visualTime));
      const alpha = Math.min(1, remain / 0.3, (1.25 - remain) / 0.22 + 0.2);
      round(ctx, width / 2 - 112, height * 0.43, 224, 82, 24);
      ctx.fillStyle = `rgba(7,23,31,${Math.max(0.28, alpha * 0.88)})`;
      ctx.fill();
      ctx.strokeStyle = `rgba(242,205,105,${Math.max(0.2, alpha * 0.8)})`;
      ctx.stroke();
      ctx.textAlign = 'center';
      ctx.fillStyle = `rgba(255,234,168,${Math.max(0.35, alpha)})`;
      ctx.font = '900 23px sans-serif';
      ctx.fillText('对决开始', width / 2, height * 0.43 + 30);
      ctx.fillStyle = `rgba(185,215,214,${Math.max(0.35, alpha)})`;
      ctx.font = '800 10px sans-serif';
      ctx.fillText('3:00 · 技能已装载 · 立即滑动', width / 2, height * 0.43 + 55);
    }
    return;
  }

  if (snap.mode === 'result') {
    const rating = auth.current.status === 'authenticated' ? auth.current.player.pvp.rating : 1000;
    const y = height * 0.26 - 18;
    round(ctx, width / 2 - 94, y, 188, 32, 16);
    ctx.fillStyle = 'rgba(13,38,46,.96)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(242,205,105,.48)';
    ctx.stroke();
    ctx.textAlign = 'center';
    ctx.fillStyle = '#f2d273';
    ctx.font = '900 10px sans-serif';
    const delta = state.resultRatingDelta;
    const deltaText = delta === null ? '' : ` · ${delta >= 0 ? '+' : ''}${delta}`;
    drawUiIcon(ctx, 'pvp', width / 2 - 76, y + 16, 13, '#f2d273');
    ctx.fillText(`${competitiveRankLabel(rating)} · ${rating}${deltaText}`, width / 2 + 6, y + 16);

  }
}

function homeUtilityLayout(width: number, base: any) {
  const y = Math.min(base.rank?.y ?? base.daily?.y ?? 0, base.daily?.y ?? base.rank?.y ?? 0);
  const totalWidth = Math.min(width - 44, 286);
  const left = (width - totalWidth) / 2;
  const gap = 10;
  const buttonWidth = (totalWidth - gap * 2) / 3;
  const make = (index: number, yOffset: number): Rect => ({
    x: left + index * (buttonWidth + gap),
    y: y + yOffset,
    width: buttonWidth,
    height: 50,
  });
  return {
    cover: { x: left - 8, y: y - 12, width: totalWidth + 16, height: 68 },
    collection: make(0, 3),
    rank: make(1, -4),
    daily: make(2, 2),
  };
}

function miniHomeButton(
  ctx: CanvasRenderingContext2D,
  rect: Rect,
  icon: UiIcon,
  label: string,
  emphasized: boolean,
  theme: ThemeId,
): void {
  const cx = rect.x + rect.width / 2;
  const cy = rect.y + 18;
  const outline = '#1f2426';
  const primary = theme === 'palace' ? '#cc6b72' : '#4d82b4';
  const secondary = theme === 'palace' ? '#f0b384' : '#e1b45d';

  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,.38)';
  ctx.shadowBlur = 7;
  ctx.shadowOffsetY = 3;

  if (icon === 'collection') {
    ctx.translate(cx, cy);
    ctx.rotate(-0.08);
    round(ctx, -18, -12, 36, 25, 5);
    ctx.fillStyle = primary;
    ctx.fill();
    ctx.strokeStyle = outline;
    ctx.lineWidth = 2.2;
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, -10);
    ctx.lineTo(0, 11);
    ctx.strokeStyle = 'rgba(255,244,207,.72)';
    ctx.lineWidth = 1.3;
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-13, -5);
    ctx.lineTo(-5, -5);
    ctx.moveTo(5, -5);
    ctx.lineTo(13, -5);
    ctx.strokeStyle = '#ffe4a0';
    ctx.lineWidth = 1.5;
    ctx.stroke();
  } else if (icon === 'rank') {
    ctx.translate(cx, cy + 2);
    const blocks = [
      { x: -19, y: -2, w: 12, h: 14, c: '#d07d4b' },
      { x: -6, y: -10, w: 12, h: 22, c: '#efc55f' },
      { x: 7, y: 3, w: 12, h: 9, c: '#7eb48d' },
    ];
    blocks.forEach(block => {
      round(ctx, block.x, block.y, block.w, block.h, 2);
      ctx.fillStyle = block.c;
      ctx.fill();
      ctx.strokeStyle = outline;
      ctx.lineWidth = 1.8;
      ctx.stroke();
    });
    ctx.fillStyle = '#49331f';
    ctx.font = '900 8px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('1', 0, -1);
  } else {
    ctx.translate(cx, cy);
    round(ctx, -17, -9, 34, 22, 5);
    ctx.fillStyle = primary;
    ctx.fill();
    ctx.strokeStyle = outline;
    ctx.lineWidth = 2.2;
    ctx.stroke();
    ctx.fillStyle = secondary;
    ctx.fillRect(-3, -10, 6, 23);
    ctx.fillRect(-18, -3, 36, 6);
    ctx.beginPath();
    ctx.moveTo(-3, -9);
    ctx.quadraticCurveTo(-13, -18, -16, -8);
    ctx.quadraticCurveTo(-10, -3, -3, -6);
    ctx.moveTo(3, -9);
    ctx.quadraticCurveTo(13, -18, 16, -8);
    ctx.quadraticCurveTo(10, -3, 3, -6);
    ctx.strokeStyle = secondary;
    ctx.lineWidth = 3.5;
    ctx.stroke();
  }

  ctx.restore();

  if (emphasized) {
    ctx.save();
    ctx.shadowColor = '#ffd76a';
    ctx.shadowBlur = 10;
    ctx.beginPath();
    ctx.arc(cx + 18, rect.y + 5, 4.5, 0, Math.PI * 2);
    ctx.fillStyle = '#ffd76a';
    ctx.fill();
    ctx.restore();
  }

  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.shadowColor = 'rgba(0,0,0,.68)';
  ctx.shadowBlur = 4;
  ctx.fillStyle = '#f3efe3';
  fitText(ctx, label, rect.width - 6, 10, 900, 8.5);
  ctx.fillText(label, cx, rect.y + 43);
  ctx.restore();
}

function rankingCenterLayout(width: number, height: number) {
  const panelW = Math.min(336, width - 20);
  const panelH = Math.min(430, Math.max(334, height - 72));
  const panel = { x: (width - panelW) / 2, y: (height - panelH) / 2, width: panelW, height: panelH };
  const x = panel.x + 16;
  const w = panel.width - 32;
  const header = 78;
  const footer = 34;
  const gap = panelH < 390 ? 7 : 10;
  const available = Math.max(180, panel.height - header - footer - gap * 2);
  const rowH = Math.max(58, Math.min(72, available / 3));
  const y0 = panel.y + header;
  return {
    panel,
    close: { x: panel.x + panel.width - 46, y: panel.y + 10, width: 34, height: 34 },
    ascension: { x, y: y0, width: w, height: rowH },
    solo: { x, y: y0 + rowH + gap, width: w, height: rowH },
    pvp: { x, y: y0 + (rowH + gap) * 2, width: w, height: rowH },
  };
}

function collectionLayout(width: number, height: number) {
  const panelW = Math.min(338, width - 18);
  const panelH = Math.min(610, height * 0.78);
  const panel = { x: (width - panelW) / 2, y: height * 0.10, width: panelW, height: panelH };
  const tabGap = 8;
  const tabW = (panel.width - 44 - tabGap) / 2;
  const gridX = panel.x + 14;
  const gridY = panel.y + 116;
  const gapX = 8;
  const gapY = 8;
  const cellW = (panel.width - 28 - gapX) / 2;
  const cellH = Math.min(48, (panel.height - 170 - gapY * 5) / 6);
  const cells = PIECE_VALUES.map((_, index) => ({
    x: gridX + (index % 2) * (cellW + gapX),
    y: gridY + Math.floor(index / 2) * (cellH + gapY),
    width: cellW,
    height: cellH,
  }));
  return {
    panel,
    close: { x: panel.x + panel.width - 42, y: panel.y + 12, width: 28, height: 28 },
    kingdom: { x: panel.x + 18, y: panel.y + 76, width: tabW, height: 32 },
    palace: { x: panel.x + 18 + tabW + tabGap, y: panel.y + 76, width: tabW, height: 32 },
    cells,
  };
}

function seasonLeaderboardLayout(width: number, height: number) {
  const panelW = Math.min(338, width - 18);
  const panelH = Math.min(590, height * 0.76);
  const panel = { x: (width - panelW) / 2, y: (height - panelH) / 2, width: panelW, height: panelH };
  return {
    panel,
    close: { x: panel.x + panel.width - 42, y: panel.y + 12, width: 28, height: 28 },
    refresh: { x: width / 2 - 62, y: panel.y + 170, width: 124, height: 40 },
    social: { x: panel.x + 56, y: panel.y + panel.height - 58, width: panel.width - 112, height: 38 },
  };
}

function dailyLayout(width: number, height: number) {
  const panelW = Math.min(338, width - 20);
  const panelH = Math.min(610, Math.max(452, height - 36));
  const panel = { x: (width - panelW) / 2, y: (height - panelH) / 2, width: panelW, height: panelH };
  const x = panel.x + 14;
  const w = panel.width - 28;
  const dense = panelH < 540;
  const gap = dense ? 6 : 8;
  const heights = dense
    ? [46, 46, 48, 48, 44, 42, 42]
    : [54, 54, 58, 58, 50, 46, 46];
  let y = panel.y + (dense ? 60 : 66);
  const next = (index: number): Rect => {
    const rect = { x, y, width: w, height: heights[index] };
    y += heights[index] + gap;
    return rect;
  };
  return {
    panel,
    close: { x: panel.x + panel.width - 46, y: panel.y + 10, width: 34, height: 34 },
    balance: next(0),
    progress: next(1),
    dailyAd: next(2),
    sidebar: next(3),
    shortcut: next(4),
    refreshAccount: next(5),
    subscription: next(6),
  };
}

function formatShortDate(timestamp: number): string {
  if (!Number.isFinite(timestamp) || timestamp <= 0) return '--';
  const date = new Date(timestamp);
  return `${date.getUTCMonth() + 1}月${date.getUTCDate()}日`;
}

function actionCard(
  ctx: CanvasRenderingContext2D,
  rect: Rect,
  title: string,
  subtitle: string,
  emphasized: boolean,
  icon?: UiIcon,
): void {
  round(ctx, rect.x, rect.y, rect.width, rect.height, 18);
  ctx.fillStyle = emphasized ? '#FFD66F' : PAGE_SURFACE;
  ctx.fill();
  ctx.strokeStyle = PAGE_INK;
  ctx.lineWidth = emphasized ? 2 : 1.5;
  ctx.stroke();
  const iconSpace = icon ? 40 : 0;
  if (icon) {
    drawUiIcon(ctx, icon, rect.x + 21, rect.y + rect.height / 2, Math.min(21, rect.height * .38), PAGE_INK);
  }
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = PAGE_INK;
  fitText(ctx, title, rect.width - 30 - iconSpace, 13, 900, 9.5);
  ctx.fillText(title, rect.x + 16 + iconSpace, rect.y + rect.height * .35);
  ctx.fillStyle = PAGE_MUTED;
  fitText(ctx, subtitle, rect.width - 30 - iconSpace, 10, 800, 8);
  ctx.fillText(subtitle, rect.x + 16 + iconSpace, rect.y + rect.height * .69);
}

function tab(ctx: CanvasRenderingContext2D, rect: Rect, label: string, active: boolean): void {
  round(ctx, rect.x, rect.y, rect.width, rect.height, 16);
  ctx.fillStyle = active ? '#FFD66F' : '#E6E0C8';
  ctx.fill();
  ctx.strokeStyle = PAGE_INK;
  ctx.lineWidth = active ? 2 : 1.4;
  ctx.stroke();
  ctx.textAlign = 'center';
  ctx.fillStyle = PAGE_INK;
  ctx.font = '900 10px sans-serif';
  ctx.fillText(label, rect.x + rect.width / 2, rect.y + rect.height / 2);
}

function pill(ctx: CanvasRenderingContext2D, rect: Rect, label: string, primary: boolean, icon?: UiIcon): void {
  drawPremiumButton(ctx, rect, label, { kind: primary ? 'primary' : 'secondary', icon });
}

function shade(ctx: CanvasRenderingContext2D, width: number, height: number): void {
  ctx.fillStyle = PAGE_BG;
  ctx.fillRect(0, 0, width, height);
}

function panel(ctx: CanvasRenderingContext2D, rect: Rect): void {
  round(ctx, rect.x, rect.y, rect.width, rect.height, 26);
  ctx.fillStyle = PAGE_SURFACE;
  ctx.fill();
  ctx.strokeStyle = PAGE_INK;
  ctx.lineWidth = 2;
  ctx.stroke();
}

function closeGlyph(ctx: CanvasRenderingContext2D, rect: Rect): void {
  drawUiIcon(ctx, 'close', rect.x + rect.width / 2, rect.y + rect.height / 2, 17, PAGE_INK);
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

function hit(x: number, y: number, rect: Rect): boolean {
  return hitTarget(x, y, rect, 44);
}

function competitiveRating(auth: DouyinAuthClient): number {
  if (auth.current.status !== 'authenticated') return 1000;
  return auth.current.player.season?.rating ?? auth.current.player.pvp.rating;
}

function number(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}
