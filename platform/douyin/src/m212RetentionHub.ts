import { SKILL_DEFINITIONS } from '../../../shared/index';
import type { DouyinOnlineMode } from './onlineFlow';
import {
  MAX_PIECE_VALUE,
  PIECE_VALUES,
  THEMES,
  adjacentTheme,
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
type HubScreen = 'collection' | 'daily' | 'sidebar' | 'rankings' | 'season' | null;
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
    const streakCopy = grant.streakAmount > 0 ? ` · 7日宝箱 +${grant.streakAmount} 星币` : '';
    state.coinBurst = { amount: total, startedAt: number(scene.visualTime) };
    scene.notice = {
      text: `每日登录 +${grant.amount} 星币${streakCopy}`,
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
    if (DOUYIN_PRODUCT_CONFIG.launch.pvpRankingsEnabled && current.status === 'authenticated') {
      void social.setPvpRank(current.player.season?.rating ?? current.player.pvp.rating);
    }
  });

  // The official sidebar flow is driven by the latest tt.onShow payload.
  // Re-open the task page on a real sidebar return so the user immediately
  // sees the completed state and the "立即领奖" action.
  const unsubscribeSidebarReturn = social.subscribeSidebarReturn(() => {
    if (scene.disposed) return;
    state.busyAction = null;
    engagement.track('sidebar_return');
    // A cold sidebar launch can fire while the mandatory health notice still
    // owns the screen. Keep the latest launch qualification in DouyinSocial,
    // but never overlay a product page on top of a native modal.
    if (scene.healthNoticeOpen || scene.onboardingOpen || scene.settingsOpen || scene.profilePageOpen || scene.themeUnlockOpen) return;
    state.screen = 'sidebar';
    void auth.refresh().finally(() => {
      if (!scene.disposed && state.screen === 'sidebar') scene.refreshHud();
    });
    scene.refreshHud();
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
    if (weekly.improved) engagement.track('solo_weekly_best', { score: weekly.progress.best });
    // Native rank upload is a run-boundary operation, not a per-merge network call.
    if (forceSync && weekly.progress.best > 0) void social.setSoloRank(weekly.progress.best);
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

  const unsubscribeOnline = scene.online?.subscribe?.(() => {
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
  }) ?? (() => {});

  const originalTap = game.handleTap.bind(game);
  game.handleTap = (x: number, y: number) => {
    const info = platform.getSystemInfo();

    if (state.screen) {
      handleHubTap(scene, game, platform, auth, social, commercial, engagement, state, x, y);
      return;
    }

    if (scene.profilePageOpen) {
      originalTap(x, y);
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
        state.screen = scene.sidebarSupported === false ? 'daily' : 'sidebar';
        platform.haptics.trigger('light');
        engagement.track(state.screen === 'sidebar' ? 'sidebar_guide_open' : 'daily_center_open', { source: 'home' });
        scene.refreshHud();
        void auth.refresh().then(() => {
          if (!scene.disposed && (state.screen === 'sidebar' || state.screen === 'daily')) scene.refreshHud();
        });
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
    const scale = Math.min(2, Math.max(1, number(scene.currentDpr)));
    ctx.setTransform(scale, 0, 0, scale, 0, 0);

    const nativeModal = Boolean(scene.settingsOpen || scene.exitConfirm || scene.joinPadOpen || scene.onboardingOpen || scene.profilePageOpen || scene.healthNoticeOpen || scene.themeUnlockOpen);
    if (!nativeModal && !state.screen) {
      if (game.currentMode === 'home') drawHomeUtility(ctx, width, height, scene, auth);
      if (DOUYIN_PRODUCT_CONFIG.launch.onlineEnabled && game.currentMode === 'online') {
        drawOnlinePolish(ctx, width, height, scene, state, auth);
      }
    }

    if (!nativeModal) {
      if (state.screen === 'collection') drawCollection(ctx, width, height, platform, state);
      if (state.screen === 'daily') drawDailyCenter(ctx, width, height, scene, auth, state);
      if (state.screen === 'sidebar') drawSidebarGuide(ctx, width, height, scene, auth, state);
      if (state.screen === 'rankings') drawRankingCenter(ctx, width, height, game, platform);
      if (DOUYIN_PRODUCT_CONFIG.launch.pvpRankingsEnabled && state.screen === 'season') {
        drawSeasonLeaderboard(ctx, width, height, state, auth, platform);
      }
    }
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
        state.nextCoinBurstHudAt = now + 1 / 15;
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
    unsubscribeSidebarReturn();
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
    if (hit(x, y, layout.previousTheme)) {
      state.collectionTheme = adjacentTheme(state.collectionTheme, -1);
      engagement.track('collection_theme', { theme: state.collectionTheme });
      platform.haptics.trigger('light');
      scene.refreshHud();
      return;
    }
    if (hit(x, y, layout.nextTheme)) {
      state.collectionTheme = adjacentTheme(state.collectionTheme, 1);
      engagement.track('collection_theme', { theme: state.collectionTheme });
      platform.haptics.trigger('light');
      scene.refreshHud();
      return;
    }
    return;
  }

  if (state.screen === 'sidebar') {
    const layout = sidebarGuideLayout(info.width, info.height);
    const today = new Date().toISOString().slice(0, 10);
    const player = auth.current.status === 'authenticated' ? auth.current.player : null;
    const claimed = player?.rewards.lastSidebarRewardDay === today
      || platform.storage.getItem('doublefight-sidebar-reward-date') === today;
    const ready = !claimed && Boolean(scene.sidebarRewardReady?.());

    if (hit(x, y, layout.close)) {
      state.screen = null;
      scene.refreshHud();
      return;
    }
    if (hit(x, y, layout.more)) {
      state.screen = 'daily';
      engagement.track('daily_center_open', { source: 'sidebar_guide' });
      scene.refreshHud();
      return;
    }
    if (hit(x, y, layout.action)) {
      engagement.track('sidebar_action', { ready, claimed });
      if (claimed) {
        scene.notice = { text: '今日入口奖励已领取，明天再来', until: number(scene.visualTime) + 1.5 };
        scene.refreshHud();
        return;
      }
      if (ready) {
        void scene.claimSidebarReward?.().finally(() => {
          if (!scene.disposed) scene.refreshHud();
        });
        return;
      }

      // Platform guidance recommends closing the reward page before
      // tt.navigateToScene({ scene: 'sidebar' }).
      state.screen = null;
      state.busyAction = 'sidebar';
      scene.notice = { text: '正在前往抖音首页侧边栏…', until: number(scene.visualTime) + 2 };
      scene.refreshHud();
      void social.navigateSidebar().then(ok => {
        if (!ok) {
          scene.notice = { text: '当前环境暂不支持首页侧边栏', until: number(scene.visualTime) + 1.6 };
          state.screen = 'sidebar';
        }
        engagement.track('sidebar_navigate', { success: ok });
      }).finally(() => {
        state.busyAction = null;
        if (!scene.disposed) scene.refreshHud();
      });
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
      void (async () => {
        await auth.start();
        const mastery = loadThemeMastery(platform.storage, game.theme);
        const synced = mastery.bestAscensionMs
          ? await social.setAscensionRank(game.theme, mastery.bestAscensionMs)
          : true;
        const ok = await social.openAscensionRank(game.theme);
        scene.notice = {
          text: ok
            ? (synced ? '已打开登顶竞速榜' : '已打开登顶榜 · 本机成绩稍后同步')
            : `当前环境暂不支持登顶榜${social.rankFailureHint()}`,
          until: number(scene.visualTime) + 1.4,
        };
        engagement.track('rank_open', { board: 'ascension', success: ok, synced, theme: game.theme });
        scene.refreshHud();
      })();
      return;
    }
    if (hit(x, y, layout.solo)) {
      void (async () => {
        await auth.start();
        const weekly = loadWeeklySolo(platform.storage);
        const synced = weekly.best > 0 ? await social.setSoloRank(weekly.best) : true;
        const ok = await social.openSoloRank();
        scene.notice = {
          text: ok
            ? (synced ? '已打开最高分榜' : '已打开最高分榜 · 本机成绩稍后同步')
            : `当前环境暂不支持最高分榜${social.rankFailureHint()}`,
          until: number(scene.visualTime) + 1.4,
        };
        engagement.track('rank_open', { board: 'solo_weekly', success: ok, synced });
        scene.refreshHud();
      })();
      return;
    }
    if (DOUYIN_PRODUCT_CONFIG.launch.pvpRankingsEnabled && hit(x, y, layout.pvp)) {
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
            text: current.status === 'authenticated' ? '账号已连接 · 可领取今日星币' : '奖励账号暂不可用',
            until: number(scene.visualTime) + 1.6,
          };
          if (!scene.disposed) scene.refreshHud();
        });
        return;
      }
      const alreadyClaimed = auth.current.player.rewards.daily?.adClaimed === true;
      if (alreadyClaimed) {
        scene.notice = { text: '今日广告星币已领取', until: number(scene.visualTime) + 1.4 };
        scene.refreshHud();
        return;
      }
      void claimDailyCoinReward(scene, platform, auth, commercial, engagement, state);
      return;
    }
    if (hit(x, y, layout.sidebar)) {
      state.screen = 'sidebar';
      platform.haptics.trigger('light');
      engagement.track('sidebar_guide_open', { source: 'daily' });
      scene.refreshHud();
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
  scene.notice = { text: '正在准备今日星币奖励…', until: number(scene.visualTime) + 8 };
  scene.refreshHud();
  const ad = await commercial.showRewarded();
  if (ad !== 'rewarded') {
    scene.inputLocked = false;
    scene.notice = {
      text: ad === 'skipped'
        ? '完整观看后才能领取星币'
        : `暂时没有可用广告${commercial.lastFailureHint()}`,
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
    const taskCopy = result.taskAmount > 0 ? ` · 广告任务 +${result.taskAmount} 星币` : '';
    state.coinBurst = { amount: total, startedAt: number(scene.visualTime) };
    scene.notice = {
      text: `今日广告奖励 +${result.amount || 30} 星币${taskCopy}`,
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
      text: result.status === 'duplicate' ? '今日广告星币已领取' : '星币服务暂不可用',
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
  const today = new Date().toISOString().slice(0, 10);
  const player = auth.current.status === 'authenticated' ? auth.current.player : null;
  const sidebarClaimed = player?.rewards.lastSidebarRewardDay === today
    || scene.platform.storage.getItem('doublefight-sidebar-reward-date') === today;
  const sidebarTaskOpen = scene.sidebarSupported !== false && !sidebarClaimed;
  const benefitReady = sidebarTaskOpen || Boolean(scene.sidebarRewardReady?.()) || daily?.adClaimed === false;
  miniHomeButton(ctx, utility.daily, 'gift', sidebarTaskOpen ? '入口有奖' : '福利', benefitReady, theme);
}

function drawRankingCenter(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  game: DouyinSoloScene,
  platform: DouyinPlatform,
): void {
  const layout = rankingCenterLayout(width, height);
  shade(ctx, width, height);
  drawPageHeader(ctx, width, layout.close, '排行榜', '查看你的单机记录与世界进度');

  const mastery = loadThemeMastery(platform.storage, game.theme);
  const weekly = loadWeeklySolo(platform.storage);

  actionCard(
    ctx,
    layout.ascension,
    '最快登顶',
    `${THEMES[game.theme].label} · ${mastery.bestAscensionMs ? formatDuration(mastery.bestAscensionMs) : '尚未登顶'}`,
    false,
    'energy',
  );
  actionCard(
    ctx,
    layout.solo,
    '最高分',
    weekly.best > 0 ? `本周 ${weekly.best.toLocaleString('zh-CN')}` : '本周还没有成绩',
    false,
    'rank',
  );
  ctx.textAlign = 'center';
  ctx.fillStyle = PAGE_MUTED;
  ctx.font = '800 10px sans-serif';
  ctx.fillText('选择一个榜单查看详细排名', width / 2, Math.min(height - 44, layout.solo.y + layout.solo.height + 34));
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

  const playerRating = auth.current.status === 'authenticated'
    ? auth.current.player.season?.rating ?? auth.current.player.pvp.rating
    : 1000;

  drawPageHeader(
    ctx,
    width,
    layout.close,
    '竞技赛季',
    `${competitiveRankLabel(playerRating)} · 竞技分 ${playerRating}`,
  );

  if (state.seasonLoading) {
    ctx.fillStyle = PAGE_INK;
    ctx.font = '850 13px sans-serif';
    ctx.fillText('正在加载排行…', width / 2, 220);
  } else if (!state.seasonLeaderboard) {
    ctx.fillStyle = PAGE_MUTED;
    ctx.font = '800 12px sans-serif';
    ctx.fillText('赛季榜暂时无法加载', width / 2, 202);
    drawPremiumButton(ctx, layout.refresh, '重试', { kind: 'secondary', icon: 'sync' });
  } else {
    const board = state.seasonLeaderboard;
    const end = formatShortDate(board.season.endsAt);
    ctx.fillStyle = '#236B83';
    ctx.font = '800 10px sans-serif';
    ctx.fillText(`本赛季 ${end} 结束`, width / 2, 151);

    if (board.entries.length === 0) {
      ctx.fillStyle = PAGE_MUTED;
      ctx.font = '800 12px sans-serif';
      ctx.fillText('本赛季还没有有效对局', width / 2, 220);
    } else {
      const rowStart = 174;
      const available = Math.max(0, layout.social.y - rowStart - 14);
      const visibleRows = Math.max(1, Math.min(9, Math.floor(available / 44)));
      board.entries.slice(0, visibleRows).forEach((entry, index) => {
        const row = {
          x: 22,
          y: rowStart + index * 44,
          width: width - 44,
          height: 38,
        };
        ctx.save();
        ctx.shadowColor = 'rgba(28,49,53,.12)';
        ctx.shadowOffsetY = 2;
        round(ctx, row.x, row.y, row.width, row.height, 14);
        ctx.fillStyle = index === 0 ? '#FFD66F' : '#FFF0C9';
        ctx.fill();
        ctx.shadowColor = 'transparent';
        ctx.strokeStyle = '#17343C';
        ctx.lineWidth = index < 3 ? 1.8 : 1.2;
        ctx.stroke();
        ctx.textAlign = 'left';
        ctx.fillStyle = PAGE_INK;
        ctx.font = '900 11px sans-serif';
        ctx.fillText(index < 3 ? ['Ⅰ','Ⅱ','Ⅲ'][index] : String(entry.rank), row.x + 12, row.y + 20);
        drawDouyinAvatar(ctx, platform, entry.avatarUrl, row.x + 43, row.y + 19, 26, entry.displayName, index < 3 ? '#8A5A13' : '#236B83');
        ctx.fillStyle = PAGE_INK;
        ctx.font = '900 10px sans-serif';
        ctx.fillText(entry.displayName.slice(0, 10), row.x + 62, row.y + 16);
        ctx.fillStyle = PAGE_MUTED;
        ctx.font = '800 8px sans-serif';
        ctx.fillText(`${entry.wins}胜 ${entry.losses}负 ${entry.draws}平`, row.x + 62, row.y + 29);
        ctx.textAlign = 'right';
        ctx.fillStyle = '#8A5A13';
        ctx.font = '900 11px sans-serif';
        ctx.fillText(String(entry.rating), row.x + row.width - 12, row.y + 20);
        ctx.restore();
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
  drawPageHeader(ctx, width, layout.close, '棋子图鉴', '收集每个世界的 11 个阶位');

  themeSelector(ctx, layout.previousTheme, layout.themeLabel, layout.nextTheme, state.collectionTheme);

  const mastery = loadThemeMastery(platform.storage, state.collectionTheme);
  const values = [...PIECE_VALUES];
  values.forEach((value, index) => {
    const rect = layout.cells[index];
    const tier = index + 1;
    const unlocked = tier <= mastery.highestDiscoveredTier;
    ctx.save();
    ctx.shadowColor = 'rgba(28,49,53,.14)';
    ctx.shadowOffsetY = 3;
    round(ctx, rect.x, rect.y, rect.width, rect.height - 3, 17);
    ctx.fillStyle = unlocked ? '#DDECB8' : '#D9DDD5';
    ctx.fill();
    ctx.shadowColor = 'transparent';
    ctx.strokeStyle = unlocked ? PAGE_INK : '#718084';
    ctx.lineWidth = unlocked ? 2 : 1.4;
    ctx.stroke();

    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = unlocked ? '#8A5A13' : PAGE_MUTED;
    ctx.font = '900 10px sans-serif';
    ctx.fillText(`${tier}/11`, rect.x + 12, rect.y + 15);
    ctx.fillStyle = unlocked ? PAGE_INK : '#657076';
    ctx.font = '900 12px sans-serif';
    ctx.fillText(unlocked ? pieceName(state.collectionTheme, value) : '未发现', rect.x + 12, rect.y + rect.height - 18);
    if (unlocked) {
      ctx.beginPath();
      ctx.arc(rect.x + rect.width - 16, rect.y + rect.height / 2, 7, 0, Math.PI * 2);
      ctx.fillStyle = '#FFD66F';
      ctx.fill();
      drawUiIcon(ctx, 'check', rect.x + rect.width - 16, rect.y + rect.height / 2, 9, PAGE_INK);
    }
    if (value === MAX_PIECE_VALUE) {
      ctx.textAlign = 'right';
      ctx.fillStyle = unlocked ? '#8A5A13' : PAGE_MUTED;
      ctx.font = '900 9px sans-serif';
      ctx.fillText('终阶', rect.x + rect.width - 10, rect.y + 15);
    }
    ctx.restore();
  });

  const progress = layout.progress;
  round(ctx, progress.x, progress.y, progress.width, progress.height, 18);
  ctx.fillStyle = PAGE_SURFACE;
  ctx.fill();
  ctx.strokeStyle = PAGE_INK;
  ctx.lineWidth = 1.8;
  ctx.stroke();
  ctx.textAlign = 'left';
  ctx.fillStyle = PAGE_INK;
  ctx.font = '900 11px sans-serif';
  ctx.fillText(`${THEMES[state.collectionTheme].label}收集进度`, progress.x + 14, progress.y + 18);
  ctx.textAlign = 'right';
  ctx.fillStyle = '#8A5A13';
  ctx.font = '900 12px sans-serif';
  ctx.fillText(`${mastery.highestDiscoveredTier} / 11`, progress.x + progress.width - 14, progress.y + 18);
  const track = { x: progress.x + 14, y: progress.y + 34, width: progress.width - 28, height: 10 };
  round(ctx, track.x, track.y, track.width, track.height, 5);
  ctx.fillStyle = '#C9D1C9';
  ctx.fill();
  const fillW = track.width * Math.max(0, Math.min(1, mastery.highestDiscoveredTier / 11));
  if (fillW > 2) {
    round(ctx, track.x, track.y, fillW, track.height, 5);
    ctx.fillStyle = '#E9B84E';
    ctx.fill();
  }
}

function themeSelector(
  ctx: CanvasRenderingContext2D,
  previous: Rect,
  label: Rect,
  next: Rect,
  theme: ThemeId,
): void {
  const drawArrow = (rect: Rect, glyph: string) => {
    round(ctx, rect.x, rect.y, rect.width, rect.height, 14);
    ctx.fillStyle = PAGE_SURFACE;
    ctx.fill();
    ctx.strokeStyle = PAGE_INK;
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = PAGE_INK;
    ctx.font = '900 20px sans-serif';
    ctx.fillText(glyph, rect.x + rect.width / 2, rect.y + rect.height / 2);
  };
  drawArrow(previous, '‹');
  drawArrow(next, '›');

  round(ctx, label.x, label.y, label.width, label.height, 14);
  ctx.fillStyle = '#FFDFA0';
  ctx.fill();
  ctx.strokeStyle = PAGE_INK;
  ctx.lineWidth = 1.8;
  ctx.stroke();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = PAGE_INK;
  ctx.font = '900 12px sans-serif';
  fitText(ctx, THEMES[theme].label, label.width - 20, 12, 900, 9);
  ctx.fillText(THEMES[theme].label, label.x + label.width / 2, label.y + label.height / 2);
}

function drawSidebarGuide(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  scene: SceneInternals,
  auth: DouyinAuthClient,
  state: RetentionState,
): void {
  const layout = sidebarGuideLayout(width, height);
  const today = new Date().toISOString().slice(0, 10);
  const player = auth.current.status === 'authenticated' ? auth.current.player : null;
  const claimed = player?.rewards.lastSidebarRewardDay === today
    || scene.platform.storage.getItem('doublefight-sidebar-reward-date') === today;
  const ready = !claimed && Boolean(scene.sidebarRewardReady?.());

  shade(ctx, width, height);
  drawPageHeader(ctx, width, layout.close, '首页侧边栏入口奖励', '按步骤完成复访，每日可领取一次');

  panel(ctx, layout.reward);
  drawSCoinIcon(ctx, layout.reward.x + 38, layout.reward.y + layout.reward.height / 2, 42, true);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = PAGE_INK;
  ctx.font = '900 15px sans-serif';
  ctx.fillText('每日奖励', layout.reward.x + 70, layout.reward.y + 25);
  ctx.fillStyle = '#8A5A13';
  ctx.font = '900 12px sans-serif';
  ctx.fillText('10 星币 + 下局清障 1 次', layout.reward.x + 70, layout.reward.y + 50);

  panel(ctx, layout.steps);
  ctx.fillStyle = PAGE_INK;
  ctx.font = '900 13px sans-serif';
  ctx.fillText('完成方法', layout.steps.x + 20, layout.steps.y + 28);
  const steps = [
    '1. 点击下方「去首页侧边栏」',
    '2. 在侧边栏点击「双数对决」',
    '3. 返回游戏，点击「立即领奖」',
  ];
  ctx.fillStyle = PAGE_MUTED;
  ctx.font = '800 12px sans-serif';
  steps.forEach((text, index) => {
    ctx.fillText(text, layout.steps.x + 20, layout.steps.y + 68 + index * 44);
  });

  const status = claimed ? '今日已领取' : ready ? '任务已完成 · 可以领奖' : '任务未完成';
  ctx.textAlign = 'center';
  ctx.fillStyle = claimed ? '#4F7C60' : ready ? '#A25C17' : PAGE_MUTED;
  ctx.font = '900 11px sans-serif';
  ctx.fillText(status, width / 2, layout.statusY);

  const label = claimed
    ? '今日已领取'
    : ready
      ? '立即领奖'
      : state.busyAction === 'sidebar'
        ? '正在前往侧边栏…'
        : '去首页侧边栏';
  drawPremiumButton(ctx, layout.action, label, {
    kind: ready ? 'primary' : 'secondary',
    icon: ready ? 'gift' : 'share',
  });
  drawPremiumButton(ctx, layout.more, '更多今日福利', { kind: 'secondary', icon: 'gift' });

  ctx.textAlign = 'center';
  ctx.fillStyle = PAGE_MUTED;
  ctx.font = '750 9px sans-serif';
  ctx.fillText('只有从首页侧边栏返回游戏后，才会完成本任务', width / 2, height - 22);
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
  drawPageHeader(ctx, width, layout.close, '今日福利', '完成任务，领取今天的奖励');

  const player = auth.current.status === 'authenticated' ? auth.current.player : null;
  const balance = player?.rewards.currency ?? 0;
  const daily = player?.rewards.daily;
  const tasks = daily?.tasks ?? { solo: false, pvp: false, ad: false };
  const taskCount = Number(tasks.solo) + Number(tasks.ad);
  const today = new Date().toISOString().slice(0, 10);
  const sidebarClaimed = player?.rewards.lastSidebarRewardDay === today;
  const sidebarReady = !sidebarClaimed && Boolean(scene.sidebarRewardReady?.());

  ctx.save();
  ctx.shadowColor = 'rgba(28,49,53,.18)';
  ctx.shadowOffsetY = 4;
  round(ctx, layout.balance.x, layout.balance.y, layout.balance.width, layout.balance.height - 4, 22);
  ctx.fillStyle = '#FFD66F';
  ctx.fill();
  ctx.shadowColor = 'transparent';
  ctx.strokeStyle = PAGE_INK;
  ctx.lineWidth = 2.2;
  ctx.stroke();
  drawSCoinIcon(ctx, layout.balance.x + 34, layout.balance.y + layout.balance.height / 2 - 2, 40, true);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = PAGE_INK;
  ctx.font = '900 27px sans-serif';
  ctx.fillText(balance.toLocaleString('zh-CN'), layout.balance.x + 62, layout.balance.y + layout.balance.height * .40);
  ctx.fillStyle = PAGE_MUTED;
  ctx.font = '900 10px sans-serif';
  ctx.fillText(
    daily?.loginClaimed ? `连续登录 ${daily.streak} 天` : '登录后自动领取今日奖励',
    layout.balance.x + 63,
    layout.balance.y + layout.balance.height * .70,
  );
  ctx.textAlign = 'right';
  ctx.fillStyle = PAGE_INK;
  ctx.font = '900 10px sans-serif';
  ctx.fillText('星币余额', layout.balance.x + layout.balance.width - 16, layout.balance.y + layout.balance.height / 2);
  ctx.restore();

  round(ctx, layout.progress.x, layout.progress.y, layout.progress.width, layout.progress.height, 17);
  ctx.fillStyle = PAGE_SURFACE_ALT;
  ctx.fill();
  ctx.strokeStyle = PAGE_INK;
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.textAlign = 'left';
  ctx.fillStyle = PAGE_INK;
  ctx.font = '900 12px sans-serif';
  ctx.fillText(`今日任务  ${taskCount}/2`, layout.progress.x + 14, layout.progress.y + 20);
  ctx.fillStyle = PAGE_MUTED;
  ctx.font = '800 10px sans-serif';
  ctx.fillText(
    `单机 ${tasks.solo ? '✓' : '○'}   广告 ${tasks.ad ? '✓' : '○'}`,
    layout.progress.x + 14,
    layout.progress.y + 42,
  );

  const adClaimed = daily?.adClaimed === true;
  const rewardBusy = Boolean(scene.inputLocked);
  actionCard(
    ctx,
    layout.dailyAd,
    rewardBusy ? '正在领取…' : adClaimed ? '今日已领取' : '看广告领 30 星币',
    rewardBusy ? '请稍候' : adClaimed ? '明天再来' : '完整看完即可领取',
    !rewardBusy && !adClaimed && Boolean(player),
    rewardBusy ? 'sync' : adClaimed ? 'check' : 'video',
  );

  actionCard(
    ctx,
    layout.sidebar,
    sidebarClaimed ? '首页侧边栏入口奖励 · 已领取' : sidebarReady ? '首页侧边栏入口奖励 · 可领取' : '首页侧边栏入口奖励',
    sidebarClaimed ? '明天再来' : sidebarReady ? '点此立即领取 10 星币 + 清障' : '查看完整三步指引',
    !sidebarClaimed,
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
  ctx.font = '800 9.5px sans-serif';
  ctx.fillText('星币可用于解锁新世界与主题内容', width / 2, height - 24);
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

    round(ctx, width / 2 - 82, scene.hudTop() + 62, 164, 24, 12);
    ctx.fillStyle = '#FFF0C9';
    ctx.fill();
    ctx.strokeStyle = '#17343C';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#17343C';
    ctx.font = '900 10px sans-serif';
    ctx.fillText(`${competitiveRankLabel(rating)} · 竞技分 ${rating}`, width / 2, scene.hudTop() + 74);

    snap.loadout.forEach((skillId: keyof typeof SKILL_DEFINITIONS, index: number) => {
      const rect = layout.skills[index] as Rect;
      const def = SKILL_DEFINITIONS[skillId];
      ctx.save();
      ctx.shadowColor = 'rgba(28,49,53,.17)';
      ctx.shadowOffsetY = 3;
      round(ctx, rect.x, rect.y, rect.width, rect.height - 3, 17);
      ctx.fillStyle = index === 1 ? '#FFD66F' : '#FFF0C9';
      ctx.fill();
      ctx.shadowColor = 'transparent';
      ctx.strokeStyle = '#17343C';
      ctx.lineWidth = 2;
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(rect.x + rect.width / 2, rect.y + 20, 13, 0, Math.PI * 2);
      ctx.fillStyle = index === 1 ? '#FFF3BF' : '#D6E7D9';
      ctx.fill();
      ctx.strokeStyle = '#17343C';
      ctx.lineWidth = 1.2;
      ctx.stroke();
      drawUiIcon(ctx, skillUiIcon(skillId), rect.x + rect.width / 2, rect.y + 20, 15, '#17343C');

      ctx.textAlign = 'center';
      ctx.fillStyle = '#17343C';
      ctx.font = '900 10.5px sans-serif';
      ctx.fillText(def.shortLabel, rect.x + rect.width / 2, rect.y + 40);
      ctx.fillStyle = '#46636A';
      ctx.font = '800 8.5px sans-serif';
      ctx.fillText(`${def.cost} 能量 · ${index + 1}号位`, rect.x + rect.width / 2, rect.y + 54);
      ctx.restore();
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
        remaining > 0 ? `${(remaining / 1000).toFixed(1)} 秒` : ready ? '可释放' : `${def.cost} 能量`,
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
  const primary = THEMES[theme].ui.accent;
  const secondary = THEMES[theme].ui.secondary;

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
  const edge = Math.max(22, Math.min(28, width * .065));
  const cardW = width - edge * 2;
  const rowH = Math.max(82, Math.min(94, height * .105));
  const gap = 14;
  const y0 = Math.max(170, height * .20);
  return {
    panel: { x: 0, y: 0, width, height },
    close: { x: 12, y: 72, width: 58, height: 58 },
    ascension: { x: edge, y: y0, width: cardW, height: rowH },
    solo: { x: edge, y: y0 + rowH + gap, width: cardW, height: rowH },
    pvp: { x: edge, y: y0 + (rowH + gap) * 2, width: cardW, height: rowH },
  };
}

function collectionLayout(width: number, height: number) {
  const edge = Math.max(18, Math.min(24, width * .055));
  const arrowSize = 44;
  const selectorGap = 8;
  const labelW = Math.max(120, width - edge * 2 - arrowSize * 2 - selectorGap * 2);
  const selectorY = 146;
  const gridY = 206;
  const gapX = 10;
  const gapY = 9;
  const cellW = (width - edge * 2 - gapX) / 2;
  const maxGridH = Math.max(300, height - gridY - 150);
  const cellH = Math.max(48, Math.min(58, (maxGridH - gapY * 5) / 6));
  const cells = PIECE_VALUES.map((_, index) => ({
    x: edge + (index % 2) * (cellW + gapX),
    y: gridY + Math.floor(index / 2) * (cellH + gapY),
    width: cellW,
    height: cellH,
  }));
  return {
    panel: { x: 0, y: 0, width, height },
    close: { x: 12, y: 72, width: 58, height: 58 },
    previousTheme: { x: edge, y: selectorY, width: arrowSize, height: 44 },
    themeLabel: { x: edge + arrowSize + selectorGap, y: selectorY, width: labelW, height: 44 },
    nextTheme: { x: width - edge - arrowSize, y: selectorY, width: arrowSize, height: 44 },
    progress: { x: edge, y: Math.min(height - 92, gridY + 6 * cellH + gapY * 5 + 18), width: width - edge * 2, height: 58 },
    cells,
  };
}

function seasonLeaderboardLayout(width: number, height: number) {
  const edge = Math.max(22, Math.min(28, width * .065));
  return {
    panel: { x: 0, y: 0, width, height },
    close: { x: 12, y: 72, width: 58, height: 58 },
    refresh: { x: width / 2 - 72, y: 220, width: 144, height: 44 },
    social: { x: edge, y: height - 92, width: width - edge * 2, height: 48 },
  };
}

function sidebarGuideLayout(width: number, height: number) {
  const edge = Math.max(20, Math.min(26, width * .06));
  const w = width - edge * 2;
  const rewardY = Math.max(154, height * .18);
  const stepsY = rewardY + 92;
  const actionY = Math.min(height - 142, stepsY + 218);
  return {
    panel: { x: 0, y: 0, width, height },
    close: { x: 12, y: 72, width: 58, height: 58 },
    reward: { x: edge, y: rewardY, width: w, height: 76 },
    steps: { x: edge, y: stepsY, width: w, height: 190 },
    statusY: actionY - 18,
    action: { x: edge, y: actionY, width: w, height: 52 },
    more: { x: edge, y: actionY + 62, width: w, height: 44 },
  };
}

function dailyLayout(width: number, height: number) {
  const edge = Math.max(20, Math.min(26, width * .06));
  const w = width - edge * 2;
  const dense = height < 760;
  const gap = dense ? 8 : 10;
  let y = 154;
  const take = (h: number): Rect => {
    const rect = { x: edge, y, width: w, height: h };
    y += h + gap;
    return rect;
  };
  return {
    panel: { x: 0, y: 0, width, height },
    close: { x: 12, y: 72, width: 58, height: 58 },
    balance: take(dense ? 70 : 78),
    progress: take(dense ? 56 : 62),
    dailyAd: take(dense ? 64 : 70),
    sidebar: take(dense ? 60 : 66),
    shortcut: take(dense ? 60 : 66),
    refreshAccount: take(46),
    subscription: take(46),
  };
}

function formatShortDate(timestamp: number): string {
  if (!Number.isFinite(timestamp) || timestamp <= 0) return '--';
  const date = new Date(timestamp);
  return `${date.getUTCMonth() + 1}月${date.getUTCDate()}日`;
}

function drawPageHeader(
  ctx: CanvasRenderingContext2D,
  width: number,
  back: Rect,
  title: string,
  subtitle: string,
): void {
  closeGlyph(ctx, back);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = PAGE_INK;
  ctx.font = '900 25px sans-serif';
  ctx.fillText(title, width / 2, back.y + 22);
  ctx.fillStyle = PAGE_MUTED;
  ctx.font = '800 10px sans-serif';
  ctx.fillText(subtitle, width / 2, back.y + 47);
}

function actionCard(
  ctx: CanvasRenderingContext2D,
  rect: Rect,
  title: string,
  subtitle: string,
  emphasized: boolean,
  icon?: UiIcon,
): void {
  ctx.save();
  ctx.shadowColor = 'rgba(28,49,53,.18)';
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 4;
  round(ctx, rect.x, rect.y, rect.width, rect.height - 4, 20);
  ctx.fillStyle = emphasized ? '#FFD66F' : PAGE_SURFACE;
  ctx.fill();
  ctx.shadowColor = 'transparent';
  ctx.strokeStyle = PAGE_INK;
  ctx.lineWidth = 2;
  ctx.stroke();

  const iconSpace = icon ? 58 : 16;
  if (icon) {
    ctx.beginPath();
    ctx.arc(rect.x + 32, rect.y + (rect.height - 4) / 2, 18, 0, Math.PI * 2);
    ctx.fillStyle = emphasized ? '#FFF0B7' : '#D6E7D9';
    ctx.fill();
    ctx.strokeStyle = PAGE_INK;
    ctx.lineWidth = 1.5;
    ctx.stroke();
    drawUiIcon(ctx, icon, rect.x + 32, rect.y + (rect.height - 4) / 2, 19, PAGE_INK);
  }

  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = PAGE_INK;
  fitText(ctx, title, rect.width - iconSpace - 46, 15, 900, 10);
  ctx.fillText(title, rect.x + iconSpace, rect.y + rect.height * .36);
  ctx.fillStyle = PAGE_MUTED;
  fitText(ctx, subtitle, rect.width - iconSpace - 46, 10.5, 800, 8.5);
  ctx.fillText(subtitle, rect.x + iconSpace, rect.y + rect.height * .67);

  ctx.textAlign = 'center';
  ctx.fillStyle = PAGE_INK;
  ctx.font = '900 22px sans-serif';
  ctx.fillText('›', rect.x + rect.width - 22, rect.y + (rect.height - 4) / 2);
  ctx.restore();
}

function tab(ctx: CanvasRenderingContext2D, rect: Rect, label: string, active: boolean): void {
  ctx.save();
  round(ctx, rect.x, rect.y, rect.width, rect.height, 18);
  ctx.fillStyle = active ? '#FFD66F' : '#D9E3DD';
  ctx.fill();
  ctx.strokeStyle = PAGE_INK;
  ctx.lineWidth = active ? 2.2 : 1.5;
  ctx.stroke();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = PAGE_INK;
  ctx.font = '900 11px sans-serif';
  ctx.fillText(label, rect.x + rect.width / 2, rect.y + rect.height / 2);
  if (active) {
    ctx.fillStyle = PAGE_INK;
    ctx.beginPath();
    ctx.arc(rect.x + rect.width / 2, rect.y + rect.height - 5, 2.5, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
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
  ctx.save();
  ctx.shadowColor = 'rgba(28,49,53,.18)';
  ctx.shadowOffsetY = 3;
  round(ctx, rect.x, rect.y, rect.width, rect.height, 20);
  ctx.fillStyle = PAGE_SURFACE;
  ctx.fill();
  ctx.shadowColor = 'transparent';
  ctx.strokeStyle = PAGE_INK;
  ctx.lineWidth = 2;
  ctx.stroke();
  drawUiIcon(ctx, 'back', rect.x + rect.width / 2, rect.y + rect.height / 2, 29, PAGE_INK);
  ctx.restore();
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
