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
import { S_COIN } from '../../../src/meta/productMeta';
import type { PresentationEvent } from '../../../src/battle/PresentationEvents';
import type { DouyinPlatform } from '../../../src/platform/douyin/DouyinPlatform';
import type { DouyinAuthClient } from './auth';
import type { DouyinEngagement } from './engagement';
import { formatDuration, loadThemeMastery } from './metaProgress';
import type { DouyinSocial } from './social';
import type { DouyinSoloScene } from './soloScene';

type Rect = { x: number; y: number; width: number; height: number };
type HubScreen = 'themes' | 'collection' | 'daily' | null;
type SceneInternals = Record<string, any>;

interface RetentionState {
  screen: HubScreen;
  collectionTheme: ThemeId;
  shortcutAdded: boolean | null;
  lastOnlineMode: DouyinOnlineMode | null;
  matchIntroUntil: number;
  ascensionTracked: boolean;
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
  };

  engagement.track('home_view', { theme: game.theme });
  void engagement.checkShortcut().then(value => {
    state.shortcutAdded = value;
    if (!scene.disposed && state.screen === 'daily') scene.refreshHud();
  });

  const originalStartSolo = scene.startSolo.bind(scene) as () => void;
  scene.startSolo = () => {
    state.screen = null;
    state.ascensionTracked = false;
    engagement.track('solo_start', { theme: game.theme });
    originalStartSolo();
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
    }
  };

  const unsubscribeOnline = scene.online.subscribe(() => {
    const snap = scene.online.snapshot();
    const mode = snap.mode as DouyinOnlineMode;
    if (mode === state.lastOnlineMode) return;
    const previous = state.lastOnlineMode;
    state.lastOnlineMode = mode;
    if (game.currentMode !== 'online') return;

    if (mode === 'lobby') engagement.track('pvp_lobby_view');
    if (mode === 'matching') engagement.track('matchmaking_start', { theme: snap.selectedTheme });
    if (mode === 'playing') {
      state.matchIntroUntil = number(scene.visualTime) + 1.25;
      engagement.track('match_start', { theme: snap.me?.theme ?? snap.selectedTheme });
    }
    if (mode === 'result' && previous !== 'result') {
      const match = snap.state.match;
      const won = match?.winnerId === snap.state.playerId;
      engagement.track('match_result', {
        result: match?.winnerId === null ? 'draw' : won ? 'win' : 'loss',
        reason: match?.endReason ?? 'unknown',
      });
    }
    scene.refreshHud();
  });

  const originalTap = game.handleTap.bind(game);
  game.handleTap = (x: number, y: number) => {
    const info = platform.getSystemInfo();

    if (state.screen) {
      handleHubTap(scene, game, platform, auth, social, engagement, state, x, y);
      return;
    }

    if (game.currentMode === 'home' && !scene.settingsOpen && !scene.onboardingOpen) {
      const layout = scene.homeLayout(info.width, info.height, info.safeArea.bottom);
      if (layout?.theme && hit(x, y, layout.theme)) {
        state.screen = 'themes';
        state.collectionTheme = game.theme;
        platform.haptics.trigger('light');
        engagement.track('theme_center_open', { theme: game.theme });
        scene.refreshHud();
        return;
      }
      if (layout?.daily && hit(x, y, layout.daily)) {
        state.screen = 'daily';
        platform.haptics.trigger('light');
        engagement.track('daily_center_open');
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

    const nativeModal = Boolean(scene.settingsOpen || scene.exitConfirm || scene.joinPadOpen || scene.onboardingOpen);
    if (!nativeModal && !state.screen) {
      if (game.currentMode === 'home') drawHomeUtility(ctx, width, height, scene);
      if (game.currentMode === 'online') drawOnlinePolish(ctx, width, height, scene, state);
    }

    if (state.screen === 'themes') drawThemeCenter(ctx, width, height, game, platform, state);
    if (state.screen === 'collection') drawCollection(ctx, width, height, platform, state);
    if (state.screen === 'daily') drawDailyCenter(ctx, width, height, scene, auth, state);

    scene.uiTexture.needsUpdate = true;
  };

  const originalDispose = game.dispose.bind(game);
  game.dispose = () => {
    unsubscribeOnline();
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
  engagement: DouyinEngagement,
  state: RetentionState,
  x: number,
  y: number,
): void {
  const info = platform.getSystemInfo();

  if (state.screen === 'themes') {
    const layout = themeCenterLayout(info.width, info.height);
    if (hit(x, y, layout.close)) {
      state.screen = null;
      scene.refreshHud();
      return;
    }
    const themes: ThemeId[] = ['kingdom', 'palace'];
    for (let index = 0; index < themes.length; index += 1) {
      if (!hit(x, y, layout.cards[index])) continue;
      game.setTheme(themes[index]);
      state.collectionTheme = themes[index];
      platform.haptics.trigger('medium');
      scene.refreshHud();
      return;
    }
    if (hit(x, y, layout.collection)) {
      state.screen = 'collection';
      state.collectionTheme = game.theme;
      engagement.track('collection_open', { theme: game.theme });
      platform.haptics.trigger('light');
      scene.refreshHud();
      return;
    }
    return;
  }

  if (state.screen === 'collection') {
    const layout = collectionLayout(info.width, info.height);
    if (hit(x, y, layout.close)) {
      state.screen = 'themes';
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

  if (state.screen === 'daily') {
    const layout = dailyLayout(info.width, info.height);
    if (hit(x, y, layout.close)) {
      state.screen = null;
      scene.refreshHud();
      return;
    }
    if (hit(x, y, layout.sidebar)) {
      const ready = Boolean(scene.sidebarRewardReady?.());
      engagement.track('sidebar_action', { ready });
      if (ready) {
        void scene.claimSidebarReward?.().finally(() => scene.refreshHud());
      } else {
        void social.navigateSidebar().then(ok => {
          scene.notice = {
            text: ok ? '已打开侧边栏入口' : '当前环境暂不支持侧边栏',
            until: number(scene.visualTime) + 1.5,
          };
          engagement.track('sidebar_navigate', { success: ok });
          scene.refreshHud();
        });
      }
      return;
    }
    if (hit(x, y, layout.shortcut)) {
      // Keep the native call in the direct touch stack; Douyin requires this.
      void engagement.addShortcutFromTap().then(result => {
        if (result === 'added') state.shortcutAdded = true;
        scene.notice = {
          text: result === 'added' ? '已添加到桌面' : result === 'cancelled' ? '已取消添加' : '当前环境暂不支持添加桌面',
          until: number(scene.visualTime) + 1.5,
        };
        engagement.track('shortcut_result', { result });
        scene.refreshHud();
      });
      return;
    }
    if (hit(x, y, layout.refreshAccount)) {
      void auth.start().then(() => {
        scene.notice = {
          text: auth.current.status === 'authenticated' ? '账号进度已同步' : '当前为本地游客进度',
          until: number(scene.visualTime) + 1.4,
        };
        scene.refreshHud();
      });
    }
  }
}

function drawHomeUtility(ctx: CanvasRenderingContext2D, width: number, height: number, scene: SceneInternals): void {
  const info = scene.platform.getSystemInfo();
  const layout = scene.homeLayout(width, height, info.safeArea.bottom);
  scene.drawPillButton(ctx, layout.theme, '🌍 世界中心', 'secondary');
  scene.drawPillButton(
    ctx,
    layout.daily,
    scene.sidebarRewardReady?.() ? '🎁 今日可领' : '🎁 今日福利',
    scene.sidebarRewardReady?.() ? 'primary' : 'secondary',
  );
}

function drawThemeCenter(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  game: DouyinSoloScene,
  platform: DouyinPlatform,
  state: RetentionState,
): void {
  const layout = themeCenterLayout(width, height);
  shade(ctx, width, height);
  panel(ctx, layout.panel);

  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffe5a0';
  ctx.font = '900 24px sans-serif';
  ctx.fillText('世界中心', width / 2, layout.panel.y + 38);
  ctx.fillStyle = '#9db5b7';
  ctx.font = '700 10px sans-serif';
  ctx.fillText('选择世界 · 查看收集进度 · 继续登顶', width / 2, layout.panel.y + 62);
  closeGlyph(ctx, layout.close);

  const themes: ThemeId[] = ['kingdom', 'palace'];
  themes.forEach((theme, index) => {
    const rect = layout.cards[index];
    const active = theme === game.theme;
    const mastery = loadThemeMastery(platform.storage, theme);
    const best = Number(platform.storage.getItem(`doublefight-best-${theme}`) ?? 0);
    round(ctx, rect.x, rect.y, rect.width, rect.height, 22);
    const gradient = ctx.createLinearGradient(rect.x, rect.y, rect.x + rect.width, rect.y + rect.height);
    gradient.addColorStop(0, active ? 'rgba(43,92,89,.98)' : 'rgba(20,48,58,.95)');
    gradient.addColorStop(1, active ? 'rgba(66,65,39,.96)' : 'rgba(13,34,44,.95)');
    ctx.fillStyle = gradient;
    ctx.fill();
    ctx.strokeStyle = active ? '#f2cf70' : 'rgba(225,237,233,.22)';
    ctx.lineWidth = active ? 1.6 : 1;
    ctx.stroke();

    ctx.textAlign = 'left';
    ctx.fillStyle = '#fff0bc';
    ctx.font = '900 16px sans-serif';
    ctx.fillText(THEMES[theme].label, rect.x + 18, rect.y + 25);
    ctx.fillStyle = '#9fc3c0';
    ctx.font = '700 9px sans-serif';
    ctx.fillText(active ? '当前世界' : '点击切换', rect.x + 18, rect.y + 45);
    ctx.fillStyle = '#d8e5df';
    ctx.font = '800 11px sans-serif';
    ctx.fillText(`图鉴 ${mastery.highestDiscoveredTier}/11`, rect.x + 18, rect.y + 73);
    ctx.fillText(`BEST ${best.toLocaleString('zh-CN')}`, rect.x + 18, rect.y + 94);
    ctx.textAlign = 'right';
    ctx.fillStyle = mastery.bestAscensionMs ? '#f3d273' : '#809598';
    ctx.font = '800 10px sans-serif';
    ctx.fillText(
      mastery.bestAscensionMs ? `登顶 PB ${formatDuration(mastery.bestAscensionMs)}` : '尚未登顶',
      rect.x + rect.width - 16,
      rect.y + 84,
    );
  });

  pill(ctx, layout.collection, '📖 打开棋子图鉴', true);
  ctx.fillStyle = '#758b8e';
  ctx.font = '700 9px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('更多主题世界将在后续版本加入', width / 2, layout.panel.y + layout.panel.height - 22);

  void state;
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
  ctx.fillStyle = '#ffe5a0';
  ctx.font = '900 23px sans-serif';
  ctx.fillText('棋子图鉴', width / 2, layout.panel.y + 36);
  ctx.fillStyle = '#9cb4b6';
  ctx.font = '700 9px sans-serif';
  ctx.fillText('只展示名称与阶位 · 数字继续留在规则层', width / 2, layout.panel.y + 58);

  tab(ctx, layout.kingdom, '微缩王国', state.collectionTheme === 'kingdom');
  tab(ctx, layout.palace, '后宫晋升', state.collectionTheme === 'palace');

  const mastery = loadThemeMastery(platform.storage, state.collectionTheme);
  const values = [...PIECE_VALUES];
  values.forEach((value, index) => {
    const rect = layout.cells[index];
    const tier = index + 1;
    const unlocked = tier <= mastery.highestDiscoveredTier;
    round(ctx, rect.x, rect.y, rect.width, rect.height, 15);
    ctx.fillStyle = unlocked ? 'rgba(24,61,67,.96)' : 'rgba(30,39,43,.76)';
    ctx.fill();
    ctx.strokeStyle = unlocked ? 'rgba(242,205,105,.42)' : 'rgba(140,155,157,.16)';
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.textAlign = 'left';
    ctx.fillStyle = unlocked ? '#f3cf70' : '#66777a';
    ctx.font = '900 9px sans-serif';
    ctx.fillText(`T${String(tier).padStart(2, '0')}`, rect.x + 11, rect.y + 15);
    ctx.fillStyle = unlocked ? '#f2f0e7' : '#6c7b7e';
    ctx.font = '850 11px sans-serif';
    ctx.fillText(unlocked ? pieceName(state.collectionTheme, value) : '未发现', rect.x + 11, rect.y + 34);
    if (value === MAX_PIECE_VALUE) {
      ctx.textAlign = 'right';
      ctx.fillStyle = unlocked ? '#ffe083' : '#59686a';
      ctx.font = '900 8px sans-serif';
      ctx.fillText('FINAL', rect.x + rect.width - 10, rect.y + 16);
    }
  });

  ctx.textAlign = 'center';
  ctx.fillStyle = '#b7c8c8';
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

  const balance = auth.current.status === 'authenticated' ? auth.current.player.rewards.currency : 0;
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffe4a0';
  ctx.font = '900 23px sans-serif';
  ctx.fillText('今日福利', width / 2, layout.panel.y + 36);
  ctx.fillStyle = '#9fb6b8';
  ctx.font = '700 9px sans-serif';
  ctx.fillText('轻量回流 · 不打断核心对局', width / 2, layout.panel.y + 58);

  round(ctx, layout.balance.x, layout.balance.y, layout.balance.width, layout.balance.height, 20);
  ctx.fillStyle = 'rgba(40,56,52,.94)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(242,205,105,.46)';
  ctx.stroke();
  ctx.fillStyle = '#f5d36d';
  ctx.font = '900 22px sans-serif';
  ctx.fillText(`S ${balance}`, width / 2, layout.balance.y + 28);
  ctx.fillStyle = '#aebfc0';
  ctx.font = '700 9px sans-serif';
  ctx.fillText(`未来世界永久解锁目标 · ${S_COIN.themeUnlock} S`, width / 2, layout.balance.y + 51);

  const sidebarReady = Boolean(scene.sidebarRewardReady?.());
  actionCard(
    ctx,
    layout.sidebar,
    sidebarReady ? '🎁 领取侧边栏回流奖励' : '↗ 前往侧边栏',
    sidebarReady ? '今日可领 · 下局清块 +1' : '从侧边栏回来可获得今日回流权益',
    sidebarReady,
  );

  actionCard(
    ctx,
    layout.shortcut,
    state.shortcutAdded ? '✓ 已添加到桌面' : '＋ 添加到桌面',
    state.shortcutAdded ? '以后可以更快回到双数对决' : '抖音官方快捷入口 · 仅由你主动添加',
    !state.shortcutAdded,
  );

  actionCard(
    ctx,
    layout.refreshAccount,
    '↻ 同步账号进度',
    auth.current.status === 'authenticated' ? '服务器账号已连接' : '当前为本地游客进度',
    auth.current.status !== 'authenticated',
  );

  ctx.fillStyle = '#748b8d';
  ctx.font = '700 9px sans-serif';
  ctx.fillText('S币正式任务/主题购买由服务器账本结算，不在客户端伪造余额', width / 2, layout.panel.y + layout.panel.height - 21);
}

function drawOnlinePolish(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  scene: SceneInternals,
  state: RetentionState,
): void {
  const snap = scene.online.snapshot();
  if (snap.mode === 'lobby') {
    const layout = scene.onlineLobbyLayout(width, height);
    snap.loadout.forEach((skillId: keyof typeof SKILL_DEFINITIONS, index: number) => {
      const rect = layout.skills[index] as Rect;
      const def = SKILL_DEFINITIONS[skillId];
      round(ctx, rect.x, rect.y, rect.width, rect.height, 17);
      ctx.fillStyle = 'rgba(9,37,47,.94)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(242,205,105,.55)';
      ctx.lineWidth = 1.2;
      ctx.stroke();
      ctx.textAlign = 'center';
      ctx.fillStyle = '#fff0b8';
      ctx.font = '900 11px sans-serif';
      ctx.fillText(`${def.icon} ${def.shortLabel}`, rect.x + rect.width / 2, rect.y + 20);
      ctx.fillStyle = '#94c9c4';
      ctx.font = '750 9px sans-serif';
      ctx.fillText(`${def.cost}⚡ · SLOT ${index + 1}`, rect.x + rect.width / 2, rect.y + 41);
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
      ctx.textAlign = 'center';
      ctx.fillStyle = ready ? '#fff0b8' : '#a5b2b3';
      ctx.font = '900 10px sans-serif';
      ctx.fillText(`${def.icon} ${def.shortLabel}`, rect.x + rect.width / 2, rect.y + 18);
      ctx.fillStyle = ready ? '#74e1d5' : '#839396';
      ctx.font = '800 8px sans-serif';
      ctx.fillText(
        remaining > 0 ? `${(remaining / 1000).toFixed(1)}s` : ready ? 'READY' : `${def.cost}⚡`,
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
    const y = height * 0.26 - 15;
    round(ctx, width / 2 - 74, y, 148, 28, 14);
    ctx.fillStyle = 'rgba(13,38,46,.96)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(242,205,105,.48)';
    ctx.stroke();
    ctx.textAlign = 'center';
    ctx.fillStyle = '#f2d273';
    ctx.font = '900 9px sans-serif';
    ctx.fillText('⚔ 竞技结算 · 3分钟标准局', width / 2, y + 14);
  }
}

function themeCenterLayout(width: number, height: number) {
  const panelW = Math.min(330, width - 24);
  const panelH = Math.min(540, height * 0.70);
  const panel = { x: (width - panelW) / 2, y: height * 0.14, width: panelW, height: panelH };
  const cardX = panel.x + 16;
  const cardW = panel.width - 32;
  const cardH = Math.min(116, (panel.height - 190) / 2);
  return {
    panel,
    close: { x: panel.x + panel.width - 42, y: panel.y + 14, width: 28, height: 28 },
    cards: [
      { x: cardX, y: panel.y + 84, width: cardW, height: cardH },
      { x: cardX, y: panel.y + 94 + cardH, width: cardW, height: cardH },
    ] as Rect[],
    collection: { x: panel.x + 46, y: panel.y + panel.height - 72, width: panel.width - 92, height: 44 },
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

function dailyLayout(width: number, height: number) {
  const panelW = Math.min(330, width - 24);
  const panelH = Math.min(520, height * 0.68);
  const panel = { x: (width - panelW) / 2, y: height * 0.15, width: panelW, height: panelH };
  const x = panel.x + 16;
  const w = panel.width - 32;
  return {
    panel,
    close: { x: panel.x + panel.width - 42, y: panel.y + 14, width: 28, height: 28 },
    balance: { x, y: panel.y + 82, width: w, height: 64 },
    sidebar: { x, y: panel.y + 164, width: w, height: 66 },
    shortcut: { x, y: panel.y + 240, width: w, height: 66 },
    refreshAccount: { x, y: panel.y + 316, width: w, height: 66 },
  };
}

function actionCard(ctx: CanvasRenderingContext2D, rect: Rect, title: string, subtitle: string, emphasized: boolean): void {
  round(ctx, rect.x, rect.y, rect.width, rect.height, 18);
  ctx.fillStyle = emphasized ? 'rgba(25,75,76,.96)' : 'rgba(18,47,57,.94)';
  ctx.fill();
  ctx.strokeStyle = emphasized ? 'rgba(242,205,105,.58)' : 'rgba(201,222,220,.20)';
  ctx.lineWidth = emphasized ? 1.3 : 1;
  ctx.stroke();
  ctx.textAlign = 'left';
  ctx.fillStyle = emphasized ? '#fff0b8' : '#e4ece9';
  ctx.font = '900 13px sans-serif';
  ctx.fillText(title, rect.x + 16, rect.y + 24);
  ctx.fillStyle = '#9db3b5';
  ctx.font = '700 9px sans-serif';
  ctx.fillText(subtitle, rect.x + 16, rect.y + 46);
}

function tab(ctx: CanvasRenderingContext2D, rect: Rect, label: string, active: boolean): void {
  round(ctx, rect.x, rect.y, rect.width, rect.height, 16);
  ctx.fillStyle = active ? 'rgba(43,91,88,.96)' : 'rgba(25,45,53,.86)';
  ctx.fill();
  ctx.strokeStyle = active ? '#f0cc6a' : 'rgba(180,201,201,.22)';
  ctx.stroke();
  ctx.textAlign = 'center';
  ctx.fillStyle = active ? '#fff0b8' : '#9aabad';
  ctx.font = '850 10px sans-serif';
  ctx.fillText(label, rect.x + rect.width / 2, rect.y + rect.height / 2);
}

function pill(ctx: CanvasRenderingContext2D, rect: Rect, label: string, primary: boolean): void {
  round(ctx, rect.x, rect.y, rect.width, rect.height, rect.height / 2);
  const gradient = ctx.createLinearGradient(rect.x, rect.y, rect.x + rect.width, rect.y);
  if (primary) {
    gradient.addColorStop(0, '#f2cf70');
    gradient.addColorStop(1, '#df9a53');
  } else {
    gradient.addColorStop(0, 'rgba(19,53,63,.96)');
    gradient.addColorStop(1, 'rgba(28,65,76,.96)');
  }
  ctx.fillStyle = gradient;
  ctx.fill();
  ctx.strokeStyle = primary ? '#ffe7a2' : 'rgba(255,230,161,.45)';
  ctx.stroke();
  ctx.textAlign = 'center';
  ctx.fillStyle = primary ? '#432e1d' : '#fff0c0';
  ctx.font = primary ? '900 14px sans-serif' : '850 12px sans-serif';
  ctx.fillText(label, rect.x + rect.width / 2, rect.y + rect.height / 2);
}

function shade(ctx: CanvasRenderingContext2D, width: number, height: number): void {
  ctx.fillStyle = 'rgba(2,8,12,.76)';
  ctx.fillRect(0, 0, width, height);
}

function panel(ctx: CanvasRenderingContext2D, rect: Rect): void {
  round(ctx, rect.x, rect.y, rect.width, rect.height, 28);
  const gradient = ctx.createLinearGradient(rect.x, rect.y, rect.x, rect.y + rect.height);
  gradient.addColorStop(0, 'rgba(10,34,42,.985)');
  gradient.addColorStop(1, 'rgba(7,24,32,.985)');
  ctx.fillStyle = gradient;
  ctx.fill();
  ctx.strokeStyle = 'rgba(242,205,105,.42)';
  ctx.lineWidth = 1.2;
  ctx.stroke();
}

function closeGlyph(ctx: CanvasRenderingContext2D, rect: Rect): void {
  ctx.textAlign = 'center';
  ctx.fillStyle = '#a9bbbc';
  ctx.font = '900 18px sans-serif';
  ctx.fillText('×', rect.x + rect.width / 2, rect.y + rect.height / 2);
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
  return x >= rect.x && x <= rect.x + rect.width && y >= rect.y && y <= rect.y + rect.height;
}

function number(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}
