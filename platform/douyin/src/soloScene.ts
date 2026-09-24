import * as THREE from 'three';
import { ART } from '../../../src/config/artDirection';
import {
  MAX_PIECE_VALUE,
  THEME_IDS,
  THEMES,
  adjacentTheme,
  pieceName,
  pieceTier,
  themeIndex,
  type ThemeId,
} from '../../../src/config/themes';
import { SoloController } from '../../../src/battle/SoloController';
import { BattleBoardView } from '../../../src/rendering/battle/BattleBoardView';
import { setTextureCanvasFactory } from '../../../src/rendering/TextureCanvasFactory';
import { OnlineClient } from '../../../src/network/OnlineClient';
import type { DouyinPlatform } from '../../../src/platform/douyin/DouyinPlatform';
import type { DouyinCanvas } from './api';
import {
  SKILL_DEFINITIONS,
  THEME_UNLOCK_AD_DAILY_CAP,
  THEME_UNLOCK_ECONOMY,
  type BoardTile,
  type Direction,
  type MatchPlayerState,
  type SkillId,
} from '../../../shared/index';
import { DouyinOnlineFlow } from './onlineFlow';
import { DouyinCommercial } from './commercial';
import { DouyinSocial } from './social';
import { DouyinAudio } from './audio';
import type { DouyinAuthClient } from './auth';
import { DOUYIN_PRODUCT_CONFIG, DOUYIN_RELEASE } from './config';
import type { PresentationEvent } from '../../../src/battle/PresentationEvents';
import { drawPremiumButton, drawUiIcon, fitText, hitTarget, skillUiIcon, uiMetrics, type UiIcon } from './uiSystem';

type ProductMode = 'home' | 'solo' | 'online';
type Rect = { x: number; y: number; width: number; height: number };
type SoloResultState = {
  kind: 'cleared' | 'stuck';
  score: number;
  highest: number;
  elapsedMs: number;
};
type MergeBurst = { count: number; maxValue: number; startedAt: number; until: number };
type HomeMote = { mesh: THREE.Mesh; baseX: number; baseY: number; baseZ: number; phase: number; speed: number };

const HOME_TILES: readonly BoardTile[] = [
  { id: 9101, value: 32, row: 1, col: 0 },
  { id: 9102, value: 64, row: 1, col: 1 },
  { id: 9103, value: 128, row: 1, col: 2 },
  { id: 9104, value: 256, row: 1, col: 3 },
  { id: 9105, value: 512, row: 2, col: 1 },
  { id: 9106, value: 1024, row: 2, col: 2 },
];

export class DouyinSoloScene {
  readonly boardView: BattleBoardView;
  readonly controller: SoloController;

  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100);
  private readonly duelCamera = new THREE.OrthographicCamera(-5, 5, 5, -5, 0.1, 80);
  private readonly renderer: THREE.WebGLRenderer;
  private readonly clock = new THREE.Clock();
  private readonly cameraHome = new THREE.Vector3();
  private readonly cameraTarget = new THREE.Vector3();
  private readonly cameraScratch = new THREE.Vector3();
  private readonly towardScratch = new THREE.Vector3();

  private readonly uiScene = new THREE.Scene();
  private readonly uiCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 10);
  private readonly uiCanvas: DouyinCanvas;
  private readonly uiContext: CanvasRenderingContext2D;
  private readonly uiTexture: THREE.CanvasTexture;
  private readonly uiMaterial: THREE.MeshBasicMaterial;
  private readonly uiPlane: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;

  private readonly online: DouyinOnlineFlow | null;
  private readonly unsubscribeOnline: () => void;

  private inputLocked = false;
  private skillCharges = 3;
  private currentTheme: ThemeId;
  private mode: ProductMode = 'home';
  private disposed = false;
  private visualTime = 0;
  private nextDynamicHudAt = 0;
  private nextHomeHudAt = 0;
  private perfTime = 0;
  private perfFrames = 0;
  private goodPerfWindows = 0;
  // Start conservatively on mobile. Promote to high only after sustained real-frame evidence.
  private quality: 'high' | 'medium' | 'low' = 'medium';
  private currentDpr = 1.75;
  private frameWidth = 1;
  private frameHeight = 1;
  private devicePixelRatio = 1;
  private notice: { text: string; until: number } | null = null;
  private joinPadOpen = false;
  private joinCode = '';
  private exitConfirm = false;
  private settingsOpen = false;
  private themeUnlockOpen = false;
  private themeUnlockBusy = false;
  private themeUnlockMessage: string | null = null;
  private healthNoticeOpen = true;
  private onboardingOpen = false;
  private soundEnabled = true;
  private musicEnabled = true;
  private hapticsEnabled = true;
  private rewardedSkillClaims = 0;
  private sidebarSupported = false;
  private tapFlash: { rect: Rect; until: number } | null = null;
  private soloResult: SoloResultState | null = null;
  private soloStartedAt: number | null = null;
  private mergeBurst: MergeBurst | null = null;
  private readonly stageGlow = new THREE.PointLight(0xffd36f, 0, 24, 2);
  private readonly dangerGlow = new THREE.PointLight(0xff5c64, 0, 18, 2);
  private readonly homeAmbient = new THREE.Group();
  private readonly homeMotes: HomeMote[] = [];
  private soloStage = 1;
  private soloDangerBand = 0;
  private soloBaseStageGlow = 0;
  private stageMomentUntil = 0;
  private rescueMomentUntil = 0;
  private homeSlide: { direction: -1 | 1; target: ThemeId; elapsed: number; switched: boolean } | null = null;
  private startupPreloadTasks: Array<() => void> = [];
  private startupPreloadDone = 0;

  constructor(
    private readonly platform: DouyinPlatform,
    private readonly client: OnlineClient,
    private readonly commercial: DouyinCommercial,
    private readonly social: DouyinSocial,
    private readonly audio: DouyinAudio,
    screenCanvas: DouyinCanvas,
    context: WebGLRenderingContext,
    theme: ThemeId,
    private readonly auth: DouyinAuthClient,
  ) {
    this.currentTheme = theme;

    setTextureCanvasFactory((width, height) => {
      const canvas = this.platform.createCanvas();
      canvas.width = width;
      canvas.height = height;
      return canvas as unknown as HTMLCanvasElement;
    });

    screenCanvas.addEventListener ??= () => {};
    screenCanvas.removeEventListener ??= () => {};

    this.renderer = new THREE.WebGLRenderer({
      canvas: screenCanvas as unknown as HTMLCanvasElement,
      context,
      antialias: true,
      alpha: false,
      powerPreference: 'high-performance',
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.autoClear = false;

    this.onboardingOpen = this.platform.storage.getItem('doublefight-onboarding-complete') !== '1';
    this.soundEnabled = this.platform.storage.getItem('doublefight-sound-enabled') !== '0';
    this.musicEnabled = this.platform.storage.getItem('doublefight-music-enabled') !== '0';
    this.hapticsEnabled = this.platform.storage.getItem('doublefight-haptics-enabled') !== '0';
    // Startup health reminder owns the first interaction; keep all audio suspended while loading.
    this.audio.suspend();
    this.audio.setSfxEnabled(this.soundEnabled);
    this.audio.setMusicEnabled(this.musicEnabled);
    this.audio.setScene('home', theme);
    this.platform.haptics.setEnabled(this.hapticsEnabled);

    const presentation = (event: PresentationEvent) => this.handlePresentationFeedback(event);
    this.boardView = new BattleBoardView(theme, 'full', undefined, presentation, true);
    this.controller = new SoloController(this.boardView);
    this.online = DOUYIN_PRODUCT_CONFIG.launch.onlineEnabled
      ? new DouyinOnlineFlow(platform, client, theme, presentation)
      : null;
    this.boardView.setQuality('medium');
    this.scene.add(this.boardView.root);
    if (this.online) {
      this.online!.local.setQuality('medium');
      this.online!.remote.setQuality('medium');
      this.scene.add(this.online!.local.root, this.online!.remote.root);
      this.online!.local.root.visible = false;
      this.online!.remote.root.visible = false;
    }

    this.configureLighting();
    this.createHomeAmbient();
    this.resize();
    this.applyThemeLook();

    this.uiCanvas = this.platform.createCanvas();
    this.uiContext = this.uiCanvas.getContext('2d') as CanvasRenderingContext2D;
    if (!this.uiContext) throw new Error('Douyin Canvas2D is required for the product HUD.');
    this.uiTexture = new THREE.CanvasTexture(this.uiCanvas as unknown as HTMLCanvasElement);
    this.uiTexture.colorSpace = THREE.SRGBColorSpace;
    this.uiTexture.minFilter = THREE.LinearFilter;
    this.uiTexture.magFilter = THREE.LinearFilter;
    this.uiTexture.generateMipmaps = false;
    this.uiMaterial = new THREE.MeshBasicMaterial({
      map: this.uiTexture,
      transparent: true,
      depthTest: false,
      depthWrite: false,
    });
    this.uiPlane = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.uiMaterial);
    this.uiPlane.position.z = -1;
    this.uiScene.add(this.uiPlane);
    this.resize();
    this.prepareStartupPreload();

    const online = this.online;
    this.unsubscribeOnline = online
      ? online.subscribe(() => {
          if (this.mode !== 'online') return;
          const onlineMode = online.snapshot().mode;
          const snap = online.snapshot();
          if (onlineMode === 'playing' || onlineMode === 'result') {
            this.boardView.root.visible = false;
            online.local.root.visible = true;
            online.remote.root.visible = true;
          } else {
            if (this.boardView.theme !== snap.selectedTheme) {
              this.boardView.setTheme(snap.selectedTheme);
              this.boardView.reset(HOME_TILES);
              this.applyThemeLook();
            }
            this.boardView.root.visible = true;
            online.local.root.visible = false;
            online.remote.root.visible = false;
          }
          this.refreshHud();
        })
      : () => {};

    this.refreshHud();
    // Core Home/Solo/PvP surfaces are intentionally banner-free in M2.12.
    // Rewarded and interstitial placements remain explicit user/product flows.
    void this.social.supportsSidebar().then((supported) => {
      this.sidebarSupported = supported;
      if (!this.disposed && this.mode === 'home') this.refreshHud();
    });
  }

  get theme(): ThemeId { return this.currentTheme; }
  get currentMode(): ProductMode { return this.mode; }
  get score(): number { return this.controller.board.score; }
  get highest(): number { return this.controller.board.highest; }

  refreshAccountState(): void {
    this.online?.setPlayerName(this.auth.current.status === 'authenticated' ? this.auth.current.player.displayName : undefined);
    if (!this.disposed && this.mode === 'home') this.refreshHud();
  }

  refreshSystemLayout(): void {
    if (this.disposed) return;
    this.resize();
    this.refreshHud();
  }

  openSharedRoom(code: string): void {
    if (!DOUYIN_PRODUCT_CONFIG.launch.onlineEnabled || !DOUYIN_PRODUCT_CONFIG.launch.sharedRoomInvitesEnabled) return;
    const normalized = code.replace(/\D/g, '').slice(0, 6);
    if (normalized.length !== 6) return;
    void this.auth.start().then(() => {
      if (this.disposed) return;
      this.enterOnline();
      this.joinCode = normalized;
      this.online?.joinRoom(normalized);
      this.notice = { text: `正在加入房间 ${normalized}`, until: this.visualTime + 1.4 };
      this.refreshHud();
    });
  }

  handleDirection(direction: Direction): void {
    if (this.healthNoticeOpen || this.onboardingOpen) return;
    if (this.mode === 'home') {
      if (direction === 'left' || direction === 'right') this.startHomeSlide(direction === 'left' ? -1 : 1);
      return;
    }
    if (this.mode === 'online') {
      const online = this.online;
      if (!online) return;
      const state = online.snapshot();
      if (state.mode === 'playing') {
        if (online.move(direction)) this.refreshHud();
      } else if (state.mode === 'lobby' && (direction === 'left' || direction === 'right')) {
        online.setTheme(adjacentTheme(state.selectedTheme, direction === 'left' ? 1 : -1));
      }
      return;
    }
    void this.move(direction);
  }

  async move(direction: Direction): Promise<boolean> {
    if (this.mode !== 'solo' || this.disposed || this.inputLocked || this.soloResult) return false;
    const result = this.controller.move(direction);
    if (!result.changed) {
      if (result.gameOver) this.resolveStuckBoard();
      else this.platform.haptics.trigger('light');
      return false;
    }

    if (this.soloStartedAt === null) this.soloStartedAt = this.visualTime;
    if (result.merges.length > 1) {
      const maxValue = Math.max(...result.merges.map((merge) => merge.value));
      this.mergeBurst = {
        count: result.merges.length,
        maxValue,
        startedAt: this.visualTime,
        until: this.visualTime + 0.78,
      };
      this.boardView.cameraPunch = Math.max(this.boardView.cameraPunch, 0.06 + result.merges.length * 0.025);
      this.boardView.cameraShake = Math.max(this.boardView.cameraShake, 0.018 + result.merges.length * 0.012);
    }

    this.inputLocked = true;
    this.platform.haptics.trigger(result.merges.length > 1 ? 'light' : result.merges.length === 1 ? 'medium' : 'light');
    await result.finished;
    if (this.disposed) return true;
    this.inputLocked = false;

    const cleared = result.merges.some((merge) => merge.value >= MAX_PIECE_VALUE);
    // Reaching 2048 is the terminal 11/11 success even if the spawned tile also locks the board.
    if (cleared) {
      // finishSolo() performs the single final forced record/rank sync.
      this.finishSolo('cleared');
    } else {
      this.persistRecord();
      if (result.gameOver) this.resolveStuckBoard();
      else {
        if (result.merges.length > 1) this.platform.haptics.trigger('success');
        this.applySoloAtmosphere();
        this.refreshHud();
      }
    }
    return true;
  }

  async useRandomClear(): Promise<boolean> {
    if (this.mode !== 'solo' || this.disposed || this.inputLocked || this.soloResult || this.skillCharges <= 0) {
      this.platform.haptics.trigger('light');
      return false;
    }

    // Lock before mutating the board so taps/swipes cannot overlap the skill presentation.
    this.inputLocked = true;
    const result = this.controller.clearObstacles(2);
    if (result.removed.length === 0) {
      this.inputLocked = false;
      this.platform.haptics.trigger('light');
      this.refreshHud();
      return false;
    }

    this.skillCharges -= 1;
    this.platform.haptics.trigger('success');
    this.refreshHud();
    await result.finished;
    if (!this.disposed) {
      this.inputLocked = false;
      this.persistRecord();
      if (result.gameOver) this.resolveStuckBoard();
      else {
        this.applySoloAtmosphere();
        this.refreshHud();
      }
    }
    return true;
  }

  handleTap(x: number, y: number): void {
    if (this.disposed) return;
    if (this.healthNoticeOpen) {
      const info = this.platform.getSystemInfo();
      const button = this.healthNoticeButton(info.width, info.height);
      if (this.startupPreloadTasks.length === 0 && this.hit(x, y, button)) {
        this.healthNoticeOpen = false;
        this.audio.resume();
        this.platform.haptics.trigger('light');
        this.refreshHud();
      }
      return;
    }
    if (this.themeUnlockOpen) {
      this.handleThemeUnlockTap(x, y);
      return;
    }
    if (this.inputLocked) {
      this.platform.haptics.trigger('light');
      if (!this.notice) this.notice = { text: '正在处理，请稍候…', until: this.visualTime + .8 };
      this.refreshHud();
      return;
    }
    if (this.onboardingOpen) {
      const info = this.platform.getSystemInfo();
      const panelY = info.height * 0.34;
      const button = { x: 46, y: panelY + 260, width: info.width - 92, height: 48 };
      if (this.hit(x, y, button)) {
        this.onboardingOpen = false;
        this.platform.storage.setItem('doublefight-onboarding-complete', '1');
        this.platform.haptics.trigger('light');
        this.refreshHud();
      }
      return;
    }
    if (this.settingsOpen) {
      this.handleSettingsTap(x, y);
      return;
    }
    if (this.mode === 'home') this.handleHomeTap(x, y);
    else if (this.mode === 'solo') this.handleSoloTap(x, y);
    else this.handleOnlineTap(x, y);
  }

  private prepareStartupPreload(): void {
    const theme = this.currentTheme;
    this.startupPreloadTasks = [
      () => this.boardView.prewarmEnvironment(theme),
      () => this.boardView.prewarmTheme(theme, [32, 64]),
      () => this.boardView.prewarmTheme(theme, [128, 256]),
      () => this.boardView.prewarmTheme(theme, [512, 1024]),
      () => this.prewarmThemeGpu(theme),
    ];
    this.startupPreloadDone = 0;
  }

  private stepStartupPreload(): void {
    const task = this.startupPreloadTasks.shift();
    if (!task) return;
    try { task(); } catch { /* Optional preload must never block startup. */ }
    this.startupPreloadDone += 1;
    if (this.startupPreloadTasks.length === 0) this.applyThemeLook();
    this.refreshHud();
  }

  private prewarmThemeGpu(theme: ThemeId): void {
    this.boardView.setTheme(theme);
    this.boardView.reset(HOME_TILES);
    this.camera.position.copy(this.cameraHome);
    this.camera.lookAt(this.cameraTarget);
    this.renderer.setScissorTest(false);
    this.renderer.setViewport(0, 0, this.frameWidth, this.frameHeight);
    this.renderer.compile(this.scene, this.camera);
    this.renderer.render(this.scene, this.camera);
  }

  private startupPreloadProgress(): number {
    const total = this.startupPreloadDone + this.startupPreloadTasks.length;
    return total <= 0 ? 1 : this.startupPreloadDone / total;
  }

  setTheme(theme: ThemeId): void {
    if (theme === this.currentTheme) return;
    this.currentTheme = theme;
    this.platform.storage.setItem('doublefight-theme', theme);
    // Non-current themes are intentionally lazy. First access may build that
    // theme once instead of charging every theme to cold start.
    this.boardView.setTheme(theme);
    this.applyHomeAmbientTheme();
    if (this.mode === 'online' && this.online && this.online!.snapshot().mode !== 'playing') {
      this.boardView.reset(HOME_TILES);
    }
    this.applyThemeLook();
    this.audio.setScene(this.mode === 'solo' ? 'solo' : 'home', theme);
    this.refreshHud();
  }

  render(): void {
    if (this.disposed) return;
    const delta = Math.min(0.033, this.clock.getDelta());
    this.visualTime += delta;

    if (this.healthNoticeOpen) {
      this.stepStartupPreload();
      this.renderer.setScissorTest(false);
      this.renderer.setViewport(0, 0, this.frameWidth, this.frameHeight);
      this.renderer.setClearColor(0xe9aa72, 1);
      this.renderer.clear(true, true, true);
      this.renderer.clearDepth();
      this.renderer.render(this.uiScene, this.uiCamera);
      return;
    }

    this.samplePerformance(delta);

    const online = this.online;
    const onlineState = this.mode === 'online' ? online?.snapshot() ?? null : null;
    const duel = onlineState?.mode === 'playing' || onlineState?.mode === 'result';
    if (this.mode === 'home' && this.visualTime >= this.nextHomeHudAt) {
      this.nextHomeHudAt = this.visualTime + 2;
      this.refreshHud();
    }

    this.updateHomeAmbient();
    this.updateHomeSlide(delta);
    this.updateMomentLighting();

    if (duel && online) {
      online.local.update(delta);
      online.remote.update(delta);
      this.renderDuel();
      if (this.visualTime >= this.nextDynamicHudAt) {
        this.nextDynamicHudAt = this.visualTime + 0.2;
        this.refreshHud();
      }
    } else {
      this.boardView.update(delta);
      const home = this.cameraScratch.copy(this.cameraHome);
      if (this.mode === 'home' || this.mode === 'online') {
        home.x += Math.sin(this.visualTime * 0.34) * 0.28;
        home.y += Math.sin(this.visualTime * 0.27) * 0.08;
      }

      if (this.boardView.cameraPunch > 0.002) {
        const toward = this.towardScratch.copy(this.cameraTarget).sub(home).normalize();
        home.addScaledVector(toward, this.boardView.cameraPunch);
        this.boardView.cameraPunch *= Math.pow(0.02, delta);
      }
      const shake = this.boardView.cameraShake;
      this.boardView.cameraShake *= Math.pow(0.015, delta);
      if (shake > 0.002) {
        home.x += (Math.random() - 0.5) * shake;
        home.y += (Math.random() - 0.5) * shake * 0.46;
        home.z += (Math.random() - 0.5) * shake * 0.34;
      }
      this.camera.position.copy(home);
      this.camera.lookAt(this.cameraTarget);
      this.renderer.setScissorTest(false);
      this.renderer.setViewport(0, 0, this.frameWidth, this.frameHeight);
      this.renderer.setClearColor(this.boardView.presentation.sky, 1);
      this.renderer.clear();
      this.renderer.render(this.scene, this.camera);
    }

    if (this.mode === 'solo' && this.mergeBurst) {
      if (this.visualTime >= this.mergeBurst.until) {
        this.mergeBurst = null;
        this.refreshHud();
      } else if (this.visualTime >= this.nextDynamicHudAt) {
        this.nextDynamicHudAt = this.visualTime + 1 / 15;
        this.refreshHud();
      }
    }

    if (this.notice && this.visualTime >= this.notice.until) {
      this.notice = null;
      this.refreshHud();
    }
    if (this.tapFlash && this.visualTime >= this.tapFlash.until) {
      this.tapFlash = null;
      this.refreshHud();
    }

    this.renderer.clearDepth();
    this.renderer.setScissorTest(false);
    this.renderer.setViewport(0, 0, this.frameWidth, this.frameHeight);
    this.renderer.render(this.uiScene, this.uiCamera);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.unsubscribeOnline();
    this.online?.dispose();
    this.boardView.dispose();
    for (const mote of this.homeMotes) {
      mote.mesh.geometry.dispose();
      const material = mote.mesh.material;
      if (Array.isArray(material)) material.forEach(entry => entry.dispose());
      else material.dispose();
    }
    this.homeMotes.length = 0;
    this.uiTexture.dispose();
    this.uiMaterial.dispose();
    this.uiPlane.geometry.dispose();
    this.renderer.dispose();
    this.commercial.dispose();
    this.audio.dispose();
    setTextureCanvasFactory(null);
  }

  private handlePresentationFeedback(event: PresentationEvent): void {
    this.audio.playEvent(event);
    if (event.type !== 'merge') return;
    if (this.mode === 'solo' && this.mergeBurst && this.mergeBurst.count > 1) return;
    this.platform.haptics.trigger(event.value >= 512 ? 'success' : 'medium');
  }

  private startSolo(): void {
    if (!this.auth.isThemeOwned(this.currentTheme)) {
      this.openThemeUnlock();
      return;
    }
    this.mode = 'solo';
    this.audio.setScene('solo', this.currentTheme);
    const bonus = Math.min(1, Math.max(0, Number(this.platform.storage.getItem('doublefight-next-solo-bonus') ?? 0)));
    this.platform.storage.removeItem('doublefight-next-solo-bonus');
    this.skillCharges = 3 + bonus;
    this.rewardedSkillClaims = 0;
    this.soloResult = null;
    this.soloStartedAt = null;
    this.mergeBurst = null;
    this.soloStage = 1;
    this.soloDangerBand = 0;
    this.stageMomentUntil = 0;
    this.rescueMomentUntil = 0;
    this.commercial.hideBanner();
    this.inputLocked = false;
    this.notice = null;
    this.joinPadOpen = false;
    this.exitConfirm = false;
    this.boardView.root.visible = true;
    if (this.online) {
      this.online!.local.root.visible = false;
      this.online!.remote.root.visible = false;
    }
    this.controller.reset();
    this.configureCamera();
    this.applyThemeLook();
    this.applySoloAtmosphere();
    this.platform.haptics.trigger('medium');
    this.refreshHud();
  }

  private openThemeUnlock(): void {
    this.themeUnlockOpen = true;
    this.themeUnlockMessage = null;
    this.platform.haptics.trigger('light');
    this.refreshHud();
    void this.auth.start().then(() => {
      if (this.disposed || !this.themeUnlockOpen) return;
      if (this.auth.isThemeOwned(this.currentTheme)) {
        this.themeUnlockOpen = false;
        this.themeUnlockMessage = null;
      }
      this.refreshHud();
    });
  }

  private handleThemeUnlockTap(x: number, y: number): void {
    const info = this.platform.getSystemInfo();
    const layout = this.themeUnlockLayout(info.width, info.height);
    if (!this.themeUnlockBusy && this.hit(x, y, layout.close)) {
      this.themeUnlockOpen = false;
      this.themeUnlockMessage = null;
      this.refreshHud();
      return;
    }
    if (this.themeUnlockBusy) return;
    if (this.hit(x, y, layout.coin)) {
      void this.purchaseCurrentTheme();
      return;
    }
    if (this.hit(x, y, layout.ad)) void this.watchThemeUnlockAd();
  }

  private async purchaseCurrentTheme(): Promise<void> {
    const theme = this.currentTheme;
    const economy = THEME_UNLOCK_ECONOMY[theme];
    this.themeUnlockBusy = true;
    this.themeUnlockMessage = '正在确认星币余额…';
    this.refreshHud();
    const result = await this.auth.purchaseTheme(theme);
    if (result === 'unlocked' || result === 'owned') {
      this.themeUnlockOpen = false;
      this.themeUnlockMessage = null;
      this.notice = { text: `${THEMES[theme].label} 已永久解锁`, until: this.visualTime + 1.8 };
      this.platform.haptics.trigger('success');
    } else if (result === 'insufficient') {
      const balance = this.auth.current.status === 'authenticated' ? this.auth.current.player.rewards.currency : 0;
      this.themeUnlockMessage = `星币不足 · 还差 ${Math.max(0, economy.coinCost - balance)}`;
    } else {
      this.themeUnlockMessage = '暂时无法连接账号服务，请稍后再试';
    }
    this.themeUnlockBusy = false;
    this.refreshHud();
  }

  private async watchThemeUnlockAd(): Promise<void> {
    const theme = this.currentTheme;
    this.themeUnlockBusy = true;
    this.themeUnlockMessage = '正在准备激励视频…';
    this.refreshHud();
    await this.auth.start();
    const before = this.auth.themeUnlockProgress(theme);
    if (before.dailyRemaining <= 0) {
      this.themeUnlockBusy = false;
      this.themeUnlockMessage = `今日视频解锁次数已用完 · 每日最多 ${THEME_UNLOCK_AD_DAILY_CAP} 次`;
      this.refreshHud();
      return;
    }
    const adResult = await this.commercial.showRewarded();
    if (adResult !== 'rewarded') {
      this.themeUnlockBusy = false;
      this.themeUnlockMessage = adResult === 'skipped' ? '完整看完广告后才会永久解锁当前主题' : '当前暂无可用广告，请稍后再试';
      this.refreshHud();
      return;
    }
    const claimId = `theme_${theme}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
    const claim = await this.auth.claimThemeUnlockAd(theme, claimId);
    if (claim.unlocked) {
      this.themeUnlockOpen = false;
      this.themeUnlockMessage = null;
      this.notice = { text: `${THEMES[theme].label} 已永久解锁`, until: this.visualTime + 1.8 };
      this.platform.haptics.trigger('success');
    } else if (claim.status === 'granted') {
      this.themeUnlockMessage = '奖励确认中，请稍后重试';
    } else if (claim.status === 'limited') {
      this.themeUnlockMessage = `今日视频解锁次数已用完 · 每日最多 ${THEME_UNLOCK_AD_DAILY_CAP} 次`;
    } else {
      this.themeUnlockMessage = claim.status === 'duplicate' ? '该解锁奖励已记录' : '奖励确认失败，请稍后再试';
    }
    this.themeUnlockBusy = false;
    this.refreshHud();
  }

  private resolveStuckBoard(): void {
    const canRewardRescue = this.rewardedSkillClaims < 1;
    if (this.skillCharges > 0 || canRewardRescue) {
      this.notice = {
        text: this.skillCharges > 0
          ? '棋盘已满 · 使用清障可继续'
          : '棋盘已满 · 看广告可获得清障继续',
        until: this.visualTime + 2.6,
      };
      this.applySoloAtmosphere();
      this.platform.haptics.trigger('medium');
      this.refreshHud();
      return;
    }
    this.finishSolo('stuck');
  }

  private finishSolo(kind: SoloResultState['kind']): void {
    if (this.mode !== 'solo' || this.soloResult) return;
    const elapsedMs = this.soloStartedAt === null
      ? 0
      : Math.max(1, Math.round((this.visualTime - this.soloStartedAt) * 1000));
    this.soloResult = {
      kind,
      score: this.score,
      highest: this.highest,
      elapsedMs,
    };
    this.inputLocked = false;
    this.mergeBurst = null;
    this.persistRecord(true);
    this.applySoloAtmosphere();
    if (kind === 'cleared') {
      this.audio.victory();
      this.platform.haptics.trigger('success');
    } else {
      this.audio.defeat();
      this.platform.haptics.trigger('medium');
    }
    this.refreshHud();
  }

  private applySoloAtmosphere(): void {
    if (this.mode !== 'solo') {
      this.stageGlow.intensity = 0;
      this.dangerGlow.intensity = 0;
      return;
    }

    const presentation = this.boardView.presentation;
    const tier = pieceTier(this.highest);
    const progress = Math.max(0, Math.min(1, (tier - 1) / 10));
    const empty = this.controller.board.emptyCells().length;
    const dangerBand = empty <= 1 ? 2 : empty <= 3 ? 1 : 0;
    const danger = dangerBand === 2 ? 1 : dangerBand === 1 ? 0.55 : 0;
    const stage = tier >= 10 ? 4 : tier >= 7 ? 3 : tier >= 4 ? 2 : 1;

    if (!this.soloResult && stage > this.soloStage) {
      this.stageMomentUntil = this.visualTime + (stage >= 4 ? 1.05 : 0.78);
      this.audio.milestone(stage >= 4);
      this.boardView.cameraPunch = Math.max(this.boardView.cameraPunch, stage >= 4 ? 0.16 : 0.10);
      this.boardView.cameraShake = Math.max(this.boardView.cameraShake, stage >= 4 ? 0.055 : 0.032);
      this.platform.haptics.trigger(stage >= 4 ? 'success' : 'medium');
    }
    if (!this.soloResult && this.soloDangerBand > 0 && dangerBand === 0) {
      this.rescueMomentUntil = this.visualTime + 0.62;
      this.audio.rescue();
      this.platform.haptics.trigger('light');
    }
    this.soloStage = stage;
    this.soloDangerBand = dangerBand;
    const sky = new THREE.Color(presentation.sky);
    const fog = new THREE.Color(presentation.fog);
    const themeUi = THEMES[this.currentTheme].ui;
    const stageTint = new THREE.Color(themeUi.stageTint);
    const finalTint = new THREE.Color(themeUi.finalTint);
    const dangerTint = new THREE.Color(0x6d3034);

    sky.lerp(stageTint, 0.05 + progress * 0.18);
    fog.lerp(stageTint, 0.04 + progress * 0.13);
    if (progress > 0.7) {
      const finale = (progress - 0.7) / 0.3;
      sky.lerp(finalTint, finale * 0.22);
      fog.lerp(finalTint, finale * 0.16);
    }
    if (danger > 0) {
      sky.lerp(dangerTint, danger * 0.11);
      fog.lerp(dangerTint, danger * 0.09);
    }

    const distance = this.cameraHome.length() || 24;
    this.scene.background = sky;
    this.scene.fog = new THREE.Fog(fog, distance + 7 - danger * 1.5, distance + 28 - danger * 4.5);
    this.renderer.toneMappingExposure = presentation.exposure + progress * 0.07 - danger * 0.035;
    this.soloBaseStageGlow = 0.14 + progress * 0.82;
    this.stageGlow.color.setHex(THEMES[this.currentTheme].ui.glow);
    this.stageGlow.intensity = this.soloBaseStageGlow;
    this.dangerGlow.intensity = danger * 0.82;
  }

  private openOnline(): void {
    if (!DOUYIN_PRODUCT_CONFIG.launch.onlineEnabled) return;
    void this.auth.start().then(() => {
      if (!this.disposed) this.enterOnline();
    });
  }

  private enterOnline(): void {
    if (this.mode === 'online') return;
    const online = this.online;
    if (!online) return;
    if (this.auth.current.status === 'authenticated' && !this.client.snapshot().room) this.client.close();
    this.mode = 'online';
    this.commercial.hideBanner();
    this.notice = null;
    this.joinPadOpen = false;
    this.joinCode = '';
    this.exitConfirm = false;
    this.boardView.root.visible = true;
    online.local.root.visible = false;
    online.remote.root.visible = false;
    this.boardView.reset(HOME_TILES);
    online.open(this.currentTheme);
    this.configureCamera();
    this.applyThemeLook();
    this.platform.haptics.trigger('medium');
    this.refreshHud();
  }

  private showHome(): void {
    const previousMode = this.mode;
    const online = this.online;
    const previousOnlineMode = previousMode === 'online' ? online?.snapshot().mode ?? null : null;
    this.persistRecord(true);
    if (this.mode === 'online') online?.close();
    this.mode = 'home';
    this.audio.setScene('home', this.currentTheme);
    this.soloResult = null;
    this.soloStartedAt = null;
    this.mergeBurst = null;
    const showInterstitial = previousMode === 'solo' || previousOnlineMode === 'result';
    if (showInterstitial) void this.commercial.maybeShowInterstitial();
    this.inputLocked = false;
    this.notice = null;
    this.joinPadOpen = false;
    this.exitConfirm = false;
    if (online) {
      online.local.root.visible = false;
      online.remote.root.visible = false;
    }
    this.boardView.root.visible = true;
    this.boardView.reset(HOME_TILES);
    this.configureCamera();
    this.applyThemeLook();
    this.platform.haptics.trigger('light');
    this.refreshHud();
  }

  private returnOnlineLobby(): void {
    const online = this.online;
    if (!online) {
      this.showHome();
      return;
    }
    this.commercial.hideBanner();
    online.leaveRoom();
    this.exitConfirm = false;
    this.joinPadOpen = false;
    this.notice = null;
    const snap = online.snapshot();
    if (this.boardView.theme !== snap.selectedTheme) this.boardView.setTheme(snap.selectedTheme);
    this.boardView.reset(HOME_TILES);
    this.boardView.root.visible = true;
    online.local.root.visible = false;
    online.remote.root.visible = false;
    this.configureCamera();
    this.applyThemeLook();
    this.refreshHud();
  }

  private handleHomeTap(x: number, y: number): void {
    const info = this.platform.getSystemInfo();
    const layout = this.homeLayout(info.width, info.height, info.safeArea.bottom);

    if (this.hit(x, y, layout.settings)) {
      this.flashTap(layout.settings);
      this.settingsOpen = true;
      this.platform.haptics.trigger('light');
      this.refreshHud();
      return;
    }

    if (this.hit(x, y, layout.solo)) { this.flashTap(layout.solo); this.startSolo(); return; }
    if (DOUYIN_PRODUCT_CONFIG.launch.onlineEnabled && this.hit(x, y, layout.online)) {
      this.flashTap(layout.online);
      this.openOnline();
      return;
    }
    if (this.hit(x, y, layout.rank)) {
      this.flashTap(layout.rank);
      void this.social.openSoloRank().then(ok => {
        if (!ok) {
          this.notice = { text: '排行榜暂不可用', until: this.visualTime + 1.2 };
          this.refreshHud();
        }
      });
      return;
    }
    if (this.hit(x, y, layout.daily)) {
      this.flashTap(layout.daily);
      if (this.sidebarRewardReady()) {
        void this.claimSidebarReward();
      } else if (this.sidebarSupported) {
        void this.social.navigateSidebar().then(ok => {
          if (!ok) {
            this.notice = { text: '当前环境暂不支持侧边栏', until: this.visualTime + 1.2 };
            this.refreshHud();
          }
        });
      } else {
        this.notice = { text: '当前环境暂不支持侧边栏', until: this.visualTime + 1.2 };
        this.refreshHud();
      }
    }
  }

  private handleSettingsTap(x: number, y: number): void {
    const info = this.platform.getSystemInfo();
    const layout = this.settingsLayout(info.width, info.height);

    if (this.hit(x, y, layout.music)) {
      this.flashTap(layout.music);
      this.musicEnabled = !this.musicEnabled;
      this.platform.storage.setItem('doublefight-music-enabled', this.musicEnabled ? '1' : '0');
      this.audio.setMusicEnabled(this.musicEnabled);
      this.refreshHud();
      return;
    }
    if (this.hit(x, y, layout.sound)) {
      this.flashTap(layout.sound);
      this.soundEnabled = !this.soundEnabled;
      this.platform.storage.setItem('doublefight-sound-enabled', this.soundEnabled ? '1' : '0');
      this.audio.setSfxEnabled(this.soundEnabled);
      if (this.soundEnabled) this.audio.milestone(false);
      this.refreshHud();
      return;
    }
    if (this.hit(x, y, layout.haptics)) {
      this.flashTap(layout.haptics);
      this.hapticsEnabled = !this.hapticsEnabled;
      this.platform.storage.setItem('doublefight-haptics-enabled', this.hapticsEnabled ? '1' : '0');
      this.platform.haptics.setEnabled(this.hapticsEnabled);
      if (this.hapticsEnabled) this.platform.haptics.trigger('medium');
      this.refreshHud();
      return;
    }
    if (this.hit(x, y, layout.back) || this.hit(x, y, layout.done)) {
      this.flashTap(this.hit(x, y, layout.back) ? layout.back : layout.done);
      this.settingsOpen = false;
      this.refreshHud();
    }
  }

  private handleSoloTap(x: number, y: number): void {
    const info = this.platform.getSystemInfo();
    const hudTop = this.hudTop();
    const safeBottom = Math.max(14, info.safeArea.bottom + 10);

    if (this.soloResult) {
      const actions = this.soloResultActionRects(info.width, info.height);
      if (this.hit(x, y, actions.primary)) {
        this.flashTap(actions.primary);
        this.startSolo();
        return;
      }
      if (this.hit(x, y, actions.home)) {
        this.flashTap(actions.home);
        this.showHome();
      }
      return;
    }

    if (x >= 10 && x <= 70 && y >= hudTop + 2 && y <= hudTop + 62) {
      // On a dead board with no paid charge left, Back is the explicit "end run" escape
      // while the player is deciding whether to use the optional rewarded rescue.
      if (!this.controller.board.canMove() && this.skillCharges <= 0) this.finishSolo('stuck');
      else this.showHome();
      return;
    }

    const skill = this.soloSkillRect(info.width, info.height, safeBottom);
    if (this.hit(x, y, skill)) {
      this.flashTap(skill);
      if (this.skillCharges > 0) void this.useRandomClear();
      else if (this.rewardedSkillClaims < 1) void this.rewardSoloSkill();
    }
  }

  private handleOnlineTap(x: number, y: number): void {
    const info = this.platform.getSystemInfo();
    const snap = this.online!.snapshot();

    if (this.exitConfirm) {
      const width = Math.min(280, info.width - 42);
      const panelX = (info.width - width) / 2;
      const y0 = info.height * 0.42;
      const stay = { x: panelX + 14, y: y0 + 112, width: (width - 36) / 2, height: 42 };
      const leave = { x: stay.x + stay.width + 8, y: stay.y, width: stay.width, height: 42 };
      if (this.hit(x, y, stay)) {
        this.exitConfirm = false;
        this.refreshHud();
      } else if (this.hit(x, y, leave)) {
        this.online!.leaveRoom();
        this.showHome();
      }
      return;
    }

    if (this.joinPadOpen) {
      this.handleJoinPadTap(x, y);
      return;
    }

    const back = { x: 10, y: this.hudTop() + 2, width: 58, height: 58 };
    if (this.hit(x, y, back)) {
      this.flashTap(back);
      if (snap.mode === 'playing') {
        this.exitConfirm = true;
        this.refreshHud();
      } else if (snap.mode === 'room') {
        this.online!.leaveRoom();
      } else {
        this.showHome();
      }
      return;
    }

    if (snap.mode === 'lobby') {
      const layout = this.onlineLobbyLayout(info.width, info.height);
      if (this.hit(x, y, layout.theme)) {
        this.flashTap(layout.theme);
        this.online!.setTheme(adjacentTheme(snap.selectedTheme, 1));
        return;
      }
      for (let i = 0; i < layout.skills.length; i++) if (this.hit(x, y, layout.skills[i])) {
        this.flashTap(layout.skills[i]);
        this.online!.cycleSkill(i);
        return;
      }
      if (this.hit(x, y, layout.quick)) {
        this.flashTap(layout.quick);
        this.online!.quickMatch();
        this.platform.haptics.trigger('medium');
        return;
      }
      if (this.hit(x, y, layout.create)) {
        this.flashTap(layout.create);
        this.online!.createRoom();
        this.platform.haptics.trigger('medium');
        return;
      }
      if (this.hit(x, y, layout.join)) {
        this.flashTap(layout.join);
        this.joinPadOpen = true;
        this.joinCode = '';
        this.platform.haptics.trigger('light');
        this.refreshHud();
      }
      return;
    }

    if (snap.mode === 'matching') {
      const cancel = this.matchingCancelRect(info.width, info.height);
      if (this.hit(x, y, cancel)) { this.flashTap(cancel); this.online!.cancelMatch(); }
      return;
    }

    if (snap.mode === 'room') {
      const room = snap.state.room;
      const me = room?.players.find(player => player.id === snap.state.playerId);
      const layout = this.roomLobbyLayout(info.width, info.height);
      if (this.hit(x, y, layout.share) && room?.code) {
        this.flashTap(layout.share);
        this.notice = { text: '正在打开好友邀请…', until: this.visualTime + 2 };
        this.refreshHud();
        void this.social.shareRoom(room.code).then(ok => {
          this.notice = { text: ok ? '已打开好友邀请' : '分享暂不可用', until: this.visualTime + 1.2 };
          this.refreshHud();
        });
      } else if (this.hit(x, y, layout.ready) && me) {
        this.flashTap(layout.ready);
        this.online!.toggleReady();
      }
      return;
    }

    if (snap.mode === 'playing') {
      const me = snap.me;
      if (!me) return;
      const skillRects = this.duelSkillRects(info.width, info.height);
      for (let i = 0; i < skillRects.length; i++) {
        if (!this.hit(x, y, skillRects[i])) continue;
        this.flashTap(skillRects[i]);
        const skillId = me.loadout[i];
        const result = this.online!.castSkill(skillId);
        if (!result.ok && result.reason) {
          this.notice = { text: result.reason, until: this.visualTime + 1.2 };
          this.platform.haptics.trigger('light');
        } else {
          this.notice = { text: `${SKILL_DEFINITIONS[skillId].shortLabel} · 释放！`, until: this.visualTime + 0.9 };
        }
        this.refreshHud();
        return;
      }
    }

    if (snap.mode === 'result') {
      const { primary, lobby, share } = this.resultActionRects(info.width, info.height);
      const opponentRoom = snap.state.room?.players.find(player => player.id !== snap.state.playerId);
      if (this.hit(x, y, primary)) {
        this.flashTap(primary);
        if (opponentRoom) this.online!.setRematchReady();
        else {
          this.online!.leaveRoom();
          this.online!.quickMatch();
        }
      } else if (this.hit(x, y, lobby)) {
        this.flashTap(lobby);
        this.returnOnlineLobby();
      } else if (this.hit(x, y, share)) {
        this.flashTap(share);
        this.notice = { text: '正在打开分享…', until: this.visualTime + 2 };
        this.refreshHud();
        const score = snap.state.match?.result?.players.find(player => player.playerId === snap.state.playerId)?.score ?? 0;
        const won = snap.state.match?.winnerId === snap.state.playerId;
        void this.social.shareResult(score, won).then(ok => {
          this.notice = { text: ok ? '已打开分享' : '分享暂不可用', until: this.visualTime + 1.2 };
          this.refreshHud();
        });
      }
    }
  }

  private handleJoinPadTap(x: number, y: number): void {
    const info = this.platform.getSystemInfo();
    const pad = this.joinPadLayout(info.width, info.height);
    if (this.hit(x, y, pad.close)) {
      this.joinPadOpen = false;
      this.refreshHud();
      return;
    }
    for (let i = 0; i < pad.keys.length; i++) {
      if (!this.hit(x, y, pad.keys[i].rect)) continue;
      const key = pad.keys[i].key;
      if (key === '⌫') this.joinCode = this.joinCode.slice(0, -1);
      else if (this.joinCode.length < 6) this.joinCode += key;
      this.platform.haptics.trigger('light');
      this.refreshHud();
      return;
    }
    if (this.hit(x, y, pad.join) && this.joinCode.length === 6) {
      this.joinPadOpen = false;
      this.online!.joinRoom(this.joinCode);
      this.platform.haptics.trigger('medium');
      this.refreshHud();
    }
  }

  private persistRecord(forceSync = false): void {
    if (this.mode !== 'solo') return;
    const bestKey = `doublefight-best-${this.currentTheme}`;
    const highestKey = `doublefight-highest-${this.currentTheme}`;
    const previousBest = Number(this.platform.storage.getItem(bestKey) ?? 0);
    const previousHighest = Number(this.platform.storage.getItem(highestKey) ?? 2);
    const scoreImproved = this.score > previousBest;
    const highestImproved = this.highest > previousHighest;
    if (scoreImproved) this.platform.storage.setItem(bestKey, String(this.score));
    if (highestImproved) this.platform.storage.setItem(highestKey, String(this.highest));

    // Local records update immediately; server writes happen only on new tiers
    // or explicit run boundaries (result/exit), avoiding one request per score tick.
    if (highestImproved || forceSync) {
      void this.auth.syncSoloProgressDetailed(
        this.currentTheme,
        Math.max(previousBest, this.score),
        Math.max(previousHighest, this.highest),
      ).then(result => {
        if (this.disposed || !result.synced || (result.discoveryAmount <= 0 && result.taskAmount <= 0)) return;
        const rewards: string[] = [];
        if (result.discoveryAmount > 0) rewards.push(`发现奖励 +${result.discoveryAmount} 星币`);
        if (result.taskAmount > 0) rewards.push(`今日单机 +${result.taskAmount} 星币`);
        const rewardText = rewards.join(' · ');
        if (this.notice && this.notice.until > this.visualTime && !this.notice.text.includes(rewardText)) {
          this.notice = { text: `${this.notice.text} · ${rewardText}`, until: Math.max(this.notice.until, this.visualTime + 1.8) };
        } else {
          this.notice = { text: rewardText, until: this.visualTime + 1.8 };
        }
        this.refreshHud();
      });
    }
  }

  private resize(): void {
    const info = this.platform.getSystemInfo();
    const width = Math.max(1, info.width);
    const height = Math.max(1, info.height);
    this.frameWidth = width;
    this.frameHeight = height;
    this.devicePixelRatio = Math.max(1, info.pixelRatio);
    const dpr = Math.min(this.currentDpr, this.devicePixelRatio);
    this.currentDpr = dpr;
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(width, height, false);

    this.camera.aspect = width / height;
    this.camera.fov = 42;
    this.configureCamera();
    this.camera.updateProjectionMatrix();

    const aspect = width / height;
    this.uiCamera.left = -aspect;
    this.uiCamera.right = aspect;
    this.uiCamera.top = 1;
    this.uiCamera.bottom = -1;
    this.uiCamera.updateProjectionMatrix();
    if (this.uiPlane) this.uiPlane.scale.set(aspect, 1, 1);
  }

  private samplePerformance(delta: number): void {
    if (!Number.isFinite(delta) || delta <= 0) return;
    this.perfTime += delta;
    this.perfFrames += 1;
    if (this.perfTime < 2) return;

    const fps = this.perfFrames / this.perfTime;
    this.perfTime = 0;
    this.perfFrames = 0;

    if (fps < 43) {
      this.goodPerfWindows = 0;
      this.applyDpr(1.4);
      this.applyQuality('low');
      return;
    }
    if (fps < 53) {
      this.goodPerfWindows = 0;
      this.applyDpr(1.75);
      this.applyQuality('medium');
      return;
    }
    if (fps >= 57) {
      this.goodPerfWindows += 1;
      if (this.goodPerfWindows >= 3) {
        this.applyDpr(2);
        this.applyQuality('high');
        this.goodPerfWindows = 0;
      }
    } else {
      this.goodPerfWindows = Math.max(0, this.goodPerfWindows - 1);
    }
  }

  private applyDpr(maxDpr: number): void {
    const info = this.platform.getSystemInfo();
    const targetDpr = Math.min(Math.max(1, info.pixelRatio), maxDpr);
    if (Math.abs(this.currentDpr - targetDpr) < 0.04) return;
    this.currentDpr = targetDpr;
    this.renderer.setPixelRatio(targetDpr);
    this.renderer.setSize(Math.max(1, info.width), Math.max(1, info.height), false);
  }

  private applyQuality(quality: 'high' | 'medium' | 'low'): void {
    if (this.quality === quality) return;
    this.quality = quality;
    this.boardView.setQuality(quality);
    this.online?.local.setQuality(quality);
    this.online?.remote.setQuality(quality);
  }

  private configureCamera(): void {
    const info = this.platform.getSystemInfo();
    const ratio = Math.max(0.1, info.width / Math.max(1, info.height));
    const heroMode = this.mode === 'home' || this.mode === 'online';
    this.cameraTarget.set(0, heroMode ? 0.82 : 0.6, ART.board.centerZ + (heroMode ? 0.25 : 0));
    const baseDistance = Math.max(20, 5.5 / (Math.tan(THREE.MathUtils.degToRad(21)) * ratio));
    const distance = baseDistance * (heroMode ? 1.12 : 1);
    this.cameraHome.copy(this.cameraTarget).add(
      new THREE.Vector3(0, heroMode ? 0.94 : 0.88, heroMode ? 0.52 : 0.475).multiplyScalar(distance),
    );
    this.camera.position.copy(this.cameraHome);
    this.camera.lookAt(this.cameraTarget);
  }

  private renderDuel(): void {
    const info = this.platform.getSystemInfo();
    const width = Math.max(1, info.width);
    const height = Math.max(1, info.height);
    const localHeight = Math.round(height * 0.56);
    const remoteHeight = height - localHeight;

    this.renderer.setScissorTest(true);
    this.renderDuelBoard('local', 0, width, localHeight);
    this.renderDuelBoard('remote', localHeight, width, remoteHeight);
    this.renderer.setScissorTest(false);
    this.online!.local.root.visible = true;
    this.online!.remote.root.visible = true;
  }

  private renderDuelBoard(role: 'local' | 'remote', bottom: number, width: number, height: number): void {
    this.online!.local.root.visible = role === 'local';
    this.online!.remote.root.visible = role === 'remote';
    const board = role === 'local' ? this.online!.local : this.online!.remote;
    const aspect = width / Math.max(1, height);
    const viewHeight = Math.max(9.3, 9.5 / aspect);

    this.duelCamera.left = -viewHeight * aspect / 2;
    this.duelCamera.right = viewHeight * aspect / 2;
    this.duelCamera.top = viewHeight / 2;
    this.duelCamera.bottom = -viewHeight / 2;
    this.duelCamera.position.set(0, 24, 12);
    this.duelCamera.lookAt(0, 0.6, 0.18);
    this.duelCamera.updateProjectionMatrix();

    this.renderer.setViewport(0, bottom, width, height);
    this.renderer.setScissor(0, bottom, width, height);
    this.scene.background = new THREE.Color(board.presentation.sky);
    this.scene.fog = new THREE.Fog(board.presentation.fog, 20, 48);
    this.renderer.clear(true, true, false);
    this.renderer.render(this.scene, this.duelCamera);
  }

  private createHomeAmbient(): void {
    this.scene.add(this.homeAmbient);
    const layout = [
      [-4.35, 0.55, 1.15, .2, .72],
      [4.15, 1.05, 1.35, 1.4, .60],
      [-3.65, 3.05, 1.65, 2.6, .54],
      [3.55, 3.55, 1.45, 3.7, .68],
      [-2.55, 4.55, 1.20, 4.6, .50],
      [2.35, 4.85, 1.55, 5.8, .58],
      [-4.05, 5.65, 1.35, 1.9, .47],
      [4.25, 5.95, 1.10, 3.1, .52],
    ] as const;

    layout.forEach(([baseX, baseY, baseZ, phase, speed], index) => {
      const geometry = index % 2 === 0
        ? new THREE.OctahedronGeometry(index % 4 === 0 ? .085 : .065, 0)
        : new THREE.SphereGeometry(index % 3 === 0 ? .075 : .055, 7, 5);
      const material = new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: .58,
        depthWrite: false,
      });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.set(baseX, baseY, baseZ);
      mesh.renderOrder = 1;
      this.homeAmbient.add(mesh);
      this.homeMotes.push({ mesh, baseX, baseY, baseZ, phase, speed });
    });
    this.applyHomeAmbientTheme();
  }

  private applyHomeAmbientTheme(): void {
    const palette = THEMES[this.currentTheme].ui.ambient;
    this.homeMotes.forEach((mote, index) => {
      const material = mote.mesh.material as THREE.MeshBasicMaterial;
      material.color.setHex(palette[index % palette.length]);
      material.opacity = index % 3 === 0 ? .68 : .48;
    });
  }

  private startHomeSlide(direction: -1 | 1): void {
    if (this.mode !== 'home' || this.homeSlide) return;
    const target = adjacentTheme(this.currentTheme, direction === -1 ? 1 : -1);
    this.homeSlide = { direction, target, elapsed: 0, switched: false };
    this.platform.haptics.trigger('light');
  }

  private updateHomeSlide(delta: number): void {
    if (this.mode !== 'home') {
      if (this.homeSlide) {
        this.homeSlide = null;
        this.boardView.root.position.x = 0;
      }
      return;
    }
    const slide = this.homeSlide;
    if (!slide) return;

    const half = 0.20;
    const total = half * 2;
    const travel = 5.8;
    slide.elapsed += delta;
    const ease = (t: number) => 1 - Math.pow(1 - Math.max(0, Math.min(1, t)), 3);

    if (!slide.switched && slide.elapsed >= half) {
      slide.switched = true;
      this.setTheme(slide.target);
      this.boardView.root.position.x = -slide.direction * travel;
    }

    if (!slide.switched) {
      const p = ease(slide.elapsed / half);
      this.boardView.root.position.x = slide.direction * travel * p;
    } else {
      const p = ease((slide.elapsed - half) / half);
      this.boardView.root.position.x = -slide.direction * travel * (1 - p);
    }

    if (slide.elapsed >= total) {
      this.boardView.root.position.x = 0;
      this.homeSlide = null;
      this.refreshHud();
    }
  }

  private updateHomeAmbient(): void {
    const visible = this.mode === 'home';
    this.homeAmbient.visible = visible;
    if (!visible) return;

    for (const mote of this.homeMotes) {
      const t = this.visualTime * mote.speed + mote.phase;
      mote.mesh.position.x = mote.baseX + Math.sin(t * .83) * .14;
      mote.mesh.position.y = mote.baseY + Math.sin(t) * .18;
      mote.mesh.position.z = mote.baseZ + Math.cos(t * .71) * .10;
      mote.mesh.rotation.x = t * .34;
      mote.mesh.rotation.y = t * .28;
      mote.mesh.rotation.z = Math.sin(t * .64) * .35;
    }
  }

  private updateMomentLighting(): void {
    if (this.mode !== 'solo') return;

    const normalColor = THEMES[this.currentTheme].ui.glow;
    let intensity = this.soloBaseStageGlow;
    this.stageGlow.color.setHex(normalColor);

    if (this.visualTime < this.stageMomentUntil) {
      const remaining = Math.max(0, this.stageMomentUntil - this.visualTime);
      const duration = this.soloStage >= 4 ? 1.05 : .78;
      const p = 1 - Math.min(1, remaining / duration);
      const pulse = Math.sin(Math.PI * p);
      intensity += pulse * (this.soloStage >= 4 ? 1.15 : .72);
      this.stageGlow.color.lerp(new THREE.Color(0xfff2bd), pulse * .46);
    } else if (this.visualTime < this.rescueMomentUntil) {
      const remaining = Math.max(0, this.rescueMomentUntil - this.visualTime);
      const p = 1 - Math.min(1, remaining / .62);
      const pulse = Math.sin(Math.PI * p);
      intensity += pulse * .55;
      this.stageGlow.color.lerp(new THREE.Color(0x7fe0af), pulse * .72);
    }

    this.stageGlow.intensity = intensity;
    const dangerBase = this.soloDangerBand === 2 ? .82 : this.soloDangerBand === 1 ? .45 : 0;
    const dangerPulse = this.soloDangerBand === 2 ? .88 + Math.sin(this.visualTime * 7.2) * .12 : 1;
    this.dangerGlow.intensity = Math.max(0, dangerBase * dangerPulse);
  }

  private applyThemeLook(): void {
    const presentation = this.boardView.presentation;
    this.scene.background = new THREE.Color(presentation.sky);
    this.applyHomeAmbientTheme();
    const distance = this.cameraHome.length() || 24;
    this.scene.fog = new THREE.Fog(presentation.fog, distance + 8, distance + 28);
    this.renderer.toneMappingExposure = presentation.exposure;
    if (this.mode !== 'solo') {
      this.stageGlow.intensity = 0;
      this.dangerGlow.intensity = 0;
    }
  }

  private configureLighting(): void {
    this.scene.add(new THREE.HemisphereLight(0xdff5ff, 0x496f36, 1.72));

    const sun = new THREE.DirectionalLight(0xffd9a0, 3.25);
    sun.position.set(-7, 14, 9);
    sun.castShadow = true;
    sun.shadow.mapSize.set(768, 768);
    sun.shadow.camera.left = -9;
    sun.shadow.camera.right = 9;
    sun.shadow.camera.top = 10;
    sun.shadow.camera.bottom = -10;
    sun.shadow.bias = -0.00035;
    this.scene.add(sun);

    const warm = new THREE.DirectionalLight(0xff8d58, 0.82);
    warm.position.set(8, 5.6, 5);
    this.scene.add(warm);

    const skyFill = new THREE.DirectionalLight(0x83d9ff, 0.62);
    skyFill.position.set(-5, 5, -8);
    this.scene.add(skyFill);

    const boardFill = new THREE.PointLight(0xffc65a, 0.5, 18, 2);
    boardFill.position.set(0, 7.5, 2.5);
    this.scene.add(boardFill);

    this.stageGlow.position.set(0, 6.4, 2.8);
    this.dangerGlow.position.set(0, 4.2, 3.8);
    this.scene.add(this.stageGlow, this.dangerGlow);
  }

  private refreshHud(): void {
    const info = this.platform.getSystemInfo();
    const width = Math.max(1, Math.round(info.width));
    const height = Math.max(1, Math.round(info.height));
    const scale = Math.min(2, Math.max(1, this.currentDpr));
    const targetCanvasWidth = Math.round(width * scale);
    const targetCanvasHeight = Math.round(height * scale);
    if (this.uiCanvas.width !== targetCanvasWidth) this.uiCanvas.width = targetCanvasWidth;
    if (this.uiCanvas.height !== targetCanvasHeight) this.uiCanvas.height = targetCanvasHeight;

    const ctx = this.uiContext;
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    ctx.clearRect(0, 0, width, height);

    if (this.healthNoticeOpen) {
      this.drawHealthNotice(ctx, width, height);
      this.uiTexture.needsUpdate = true;
      return;
    }

    if (this.mode === 'home') this.drawHomeHud(ctx, width, height, info.safeArea.bottom);
    else if (this.mode === 'solo') this.drawSoloHud(ctx, width, height);
    else this.drawOnlineHud(ctx, width, height);

    if (this.tapFlash) this.drawTapFlash(ctx, this.tapFlash.rect);
    if (this.notice && !this.soloResult) this.drawNotice(ctx, width, height, this.notice.text);
    if (this.exitConfirm) this.drawExitConfirm(ctx, width, height);
    if (this.joinPadOpen) this.drawJoinPad(ctx, width, height);
    if (this.settingsOpen) this.drawSettings(ctx, width, height);
    if (this.themeUnlockOpen) this.drawThemeUnlock(ctx, width, height);
    if (this.onboardingOpen) this.drawOnboarding(ctx, width, height);
    this.uiTexture.needsUpdate = true;
  }

  private healthNoticeButton(width: number, height: number): Rect {
    const buttonWidth = Math.min(286, width - 64);
    return {
      x: width / 2 - buttonWidth / 2,
      y: Math.min(height - 88, Math.max(height * 0.78, 520)),
      width: buttonWidth,
      height: 54,
    };
  }

  private drawHealthNotice(ctx: CanvasRenderingContext2D, width: number, height: number): void {
    ctx.save();
    const palette = THEMES[this.currentTheme].ui;
    const bg = ctx.createLinearGradient(0, 0, 0, height);
    bg.addColorStop(0, '#f5d79a');
    bg.addColorStop(.46, '#f1bf80');
    bg.addColorStop(1, '#d88965');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, width, height);

    // Subtle board motif keeps the screen branded without using external artwork.
    ctx.globalAlpha = .18;
    ctx.fillStyle = palette.accent;
    const cell = Math.min(54, width / 7);
    for (let row = 0; row < 4; row += 1) {
      for (let col = 0; col < 4; col += 1) {
        this.roundedRect(ctx, width / 2 - cell * 2 + col * cell, height * .60 + row * cell * .48, cell - 5, cell * .42, 6);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = 'rgba(64,35,20,.22)';
    ctx.shadowBlur = 14;
    ctx.fillStyle = '#fff4ce';
    ctx.font = '900 34px sans-serif';
    ctx.fillText('双数对决', width / 2, Math.max(82, height * .13));
    ctx.shadowBlur = 0;

    const panelW = Math.min(340, width - 38);
    const panelH = Math.min(310, height * .44);
    const panelX = (width - panelW) / 2;
    const panelY = Math.max(145, height * .23);
    this.roundedRect(ctx, panelX, panelY, panelW, panelH, 24);
    ctx.fillStyle = 'rgba(255,248,226,.94)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(128,73,42,.20)';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    ctx.fillStyle = '#78452f';
    ctx.font = '900 14px sans-serif';
    ctx.fillText('《健康游戏忠告》', width / 2, panelY + 34);

    const lines = [
      '抵制不良游戏，拒绝盗版游戏。',
      '注意自我保护，谨防受骗上当。',
      '适度游戏益脑，沉迷游戏伤身。',
      '合理安排时间，享受健康生活。',
    ];
    ctx.font = '800 13px sans-serif';
    lines.forEach((line, index) => {
      ctx.fillStyle = index % 2 === 0 ? '#6f4030' : '#83523f';
      ctx.fillText(line, width / 2, panelY + 78 + index * 42);
    });

    ctx.strokeStyle = 'rgba(123,77,49,.22)';
    ctx.beginPath();
    ctx.moveTo(panelX + 42, panelY + panelH - 58);
    ctx.lineTo(panelX + panelW - 42, panelY + panelH - 58);
    ctx.stroke();
    ctx.fillStyle = '#9b755f';
    ctx.font = '700 10px sans-serif';

    const button = this.healthNoticeButton(width, height);
    const progress = this.startupPreloadProgress();
    const progressW = Math.min(286, width - 64);
    const progressX = width / 2 - progressW / 2;
    const progressY = button.y - 34;
    this.roundedRect(ctx, progressX, progressY, progressW, 8, 4);
    ctx.fillStyle = 'rgba(109,58,30,.16)';
    ctx.fill();
    if (progress > 0) {
      this.roundedRect(ctx, progressX, progressY, Math.max(8, progressW * progress), 8, 4);
      ctx.fillStyle = '#b96a35';
      ctx.fill();
    }
    ctx.fillStyle = '#87543a';
    ctx.font = '700 10px sans-serif';
    ctx.fillText(progress >= 1 ? '资源加载完成' : `正在加载游戏资源 ${Math.round(progress * 100)}%`, width / 2, progressY - 12);

    const buttonGradient = ctx.createLinearGradient(button.x, button.y, button.x + button.width, button.y);
    if (progress >= 1) {
      buttonGradient.addColorStop(0, '#f9dfa0');
      buttonGradient.addColorStop(.5, '#efc45e');
      buttonGradient.addColorStop(1, '#e8ae43');
    } else {
      buttonGradient.addColorStop(0, '#e6cda0');
      buttonGradient.addColorStop(1, '#d6b77d');
    }
    this.roundedRect(ctx, button.x, button.y, button.width, button.height, 18);
    ctx.fillStyle = buttonGradient;
    ctx.shadowColor = progress >= 1 ? 'rgba(89,54,25,.25)' : 'rgba(89,54,25,.10)';
    ctx.shadowBlur = progress >= 1 ? 14 : 6;
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = progress >= 1 ? '#6d3a1e' : '#9a7b63';
    ctx.font = '900 18px sans-serif';
    ctx.fillText(progress >= 1 ? '进入游戏' : '加载中…', width / 2, button.y + button.height / 2);
    ctx.restore();
  }

  private drawHomeHud(ctx: CanvasRenderingContext2D, width: number, height: number, safeBottomInset: number): void {
    const titleTop = this.hudTop();
    const layout = this.homeLayout(width, height, safeBottomInset);
    const themeMeta = THEMES[this.currentTheme];
    const themeOwned = this.auth.isThemeOwned(this.currentTheme);
    const highest = Number(this.platform.storage.getItem(`doublefight-highest-${this.currentTheme}`) ?? 2);
    const tier = Math.min(11, pieceTier(highest));

    ctx.textBaseline = 'middle';
    ctx.textAlign = 'center';

    const brandGradient = ctx.createLinearGradient(0, titleTop, 0, titleTop + 44);
    brandGradient.addColorStop(0, '#fff6d7');
    brandGradient.addColorStop(1, '#efc969');
    ctx.fillStyle = brandGradient;
    ctx.shadowColor = 'rgba(13, 24, 31, .48)';
    ctx.shadowBlur = 14;
    ctx.font = '900 30px sans-serif';
    ctx.fillText('双数对决', width / 2, titleTop + 25);
    ctx.shadowBlur = 0;

    drawUiIcon(ctx, 'settings', 34, titleTop + 24, 18, '#ffe9ab');

    const metaY = Math.max(titleTop + 88, layout.theme.y - 72);
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,.52)';
    ctx.shadowBlur = 10;
    drawUiIcon(ctx, 'world', width / 2 - 62, metaY + 19, 18, '#f1ce70');
    ctx.fillStyle = '#ffe7a6';
    ctx.font = '900 19px sans-serif';
    ctx.fillText(themeMeta.label, width / 2 + 8, metaY + 18);
    ctx.shadowBlur = 0;

    ctx.fillStyle = '#F5F7F0';
    ctx.font = '800 10px sans-serif';
    ctx.fillText(themeOwned ? `${pieceName(this.currentTheme, highest)} · ${tier}/11` : `未解锁 · 可预览`, width / 2, metaY + 43);

    const lineW = 82;
    const line = ctx.createLinearGradient(width / 2 - lineW, 0, width / 2 + lineW, 0);
    line.addColorStop(0, 'rgba(243,207,112,0)');
    line.addColorStop(.5, 'rgba(243,207,112,.72)');
    line.addColorStop(1, 'rgba(243,207,112,0)');
    ctx.strokeStyle = line;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(width / 2 - lineW, metaY + 56);
    ctx.lineTo(width / 2 + lineW, metaY + 56);
    ctx.stroke();
    ctx.restore();

    this.drawWorldPager(ctx, width, metaY + 67);
    this.drawPillButton(ctx, layout.solo, themeOwned ? '开始挑战' : `解锁主题 · ${THEME_UNLOCK_ECONOMY[this.currentTheme].coinCost} 星币`, 'primary', themeOwned ? 'solo' : 'world');
    if (DOUYIN_PRODUCT_CONFIG.launch.onlineEnabled) {
      this.drawPillButton(ctx, layout.online, '在线对决', 'secondary', 'pvp');
    }
  }

  private drawWorldPager(ctx: CanvasRenderingContext2D, width: number, y: number): void {
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#17343C';
    ctx.font = '900 20px sans-serif';
    ctx.fillText('‹', width / 2 - 54, y);
    ctx.fillText('›', width / 2 + 54, y);

    const active = themeIndex(this.currentTheme);
    const gap = 16;
    const startX = width / 2 - ((THEME_IDS.length - 1) * gap) / 2;
    for (let index = 0; index < THEME_IDS.length; index += 1) {
      ctx.beginPath();
      ctx.arc(startX + index * gap, y, index === active ? 4.5 : 3, 0, Math.PI * 2);
      ctx.fillStyle = index === active ? '#17343C' : 'rgba(23,52,60,.32)';
      ctx.fill();
    }
    ctx.restore();
  }

  private drawSoloHud(ctx: CanvasRenderingContext2D, width: number, height: number): void {
    const info = this.platform.getSystemInfo();
    const hudTop = this.hudTop();
    const safeBottom = Math.max(14, info.safeArea.bottom + 10);
    const edge = 16;
    const tier = Math.min(11, pieceTier(this.highest));
    const currentName = pieceName(this.currentTheme, this.highest);

    ctx.textBaseline = 'middle';
    ctx.shadowColor = 'rgba(0,0,0,.24)';
    ctx.shadowBlur = 10;
    this.roundedRect(ctx, edge, hudTop, width - edge * 2, 64, 18);
    ctx.fillStyle = 'rgba(14, 34, 43, .82)';
    ctx.fill();
    ctx.shadowBlur = 0;

    drawUiIcon(ctx, 'back', edge + 22, hudTop + 32, 28, '#ffe9ab');

    ctx.textAlign = 'center';
    ctx.fillStyle = '#a9c3c3';
    ctx.font = '750 9px sans-serif';
    ctx.fillText(THEMES[this.currentTheme].label, width / 2, hudTop + 18);
    ctx.fillStyle = '#fff0bd';
    fitText(ctx, `${currentName} · ${tier}/11`, Math.max(104, width - 188), 14, 900, 10);
    ctx.fillText(`${currentName} · ${tier}/11`, width / 2, hudTop + 37);

    const progressW = Math.min(118, width * .30);
    const progressX = width / 2 - progressW / 2;
    this.roundedRect(ctx, progressX, hudTop + 53, progressW, 4, 2);
    ctx.fillStyle = 'rgba(255,255,255,.14)';
    ctx.fill();
    this.roundedRect(ctx, progressX, hudTop + 53, Math.max(4, progressW * tier / 11), 4, 2);
    ctx.fillStyle = '#eacb70';
    ctx.fill();

    ctx.textAlign = 'right';
    ctx.fillStyle = '#ffe58a';
    ctx.font = '900 20px sans-serif';
    ctx.fillText(this.score.toLocaleString('zh-CN'), width - edge - 12, hudTop + 27);
    ctx.fillStyle = '#a9c0c1';
    ctx.font = '700 9px sans-serif';
    ctx.fillText('得分', width - edge - 12, hudTop + 47);

    const skill = this.soloSkillRect(width, height, safeBottom);
    const canReward = this.skillCharges <= 0 && this.rewardedSkillClaims < 1;
    this.roundedRect(ctx, skill.x - 8, skill.y - 7, skill.width + 16, skill.height + 14, 22);
    ctx.fillStyle = 'rgba(6,24,31,.74)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,226,151,.16)';
    ctx.lineWidth = 1;
    ctx.stroke();

    this.drawSkillButton(
      ctx,
      skill,
      canReward ? '看广告得清障' : '清障',
      canReward ? '完整观看 · 立即获得 1 次清障' : `最多清除 2 枚最低阶 · ${this.skillCharges} 次`,
      this.skillCharges > 0 || canReward,
      'skill-clear',
    );

    if (this.mergeBurst && this.mergeBurst.count > 1) this.drawMergeBurst(ctx, width, height, this.mergeBurst);
    if (this.soloResult) this.drawSoloResult(ctx, width, height, this.soloResult);
  }

  private drawMergeBurst(ctx: CanvasRenderingContext2D, width: number, height: number, burst: MergeBurst): void {
    const duration = Math.max(.01, burst.until - burst.startedAt);
    const p = Math.max(0, Math.min(1, (this.visualTime - burst.startedAt) / duration));
    const alpha = Math.sin(Math.PI * p);
    const tierBoost = Math.min(1, Math.max(0, (pieceTier(burst.maxValue) - 1) / 10));
    const y = height * .43 - Math.sin(Math.PI * p) * 12;

    ctx.save();
    ctx.globalAlpha = Math.max(0, alpha);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = tierBoost > .65 ? '#ffd66e' : '#79e0d6';
    ctx.shadowBlur = 16 + tierBoost * 14;
    ctx.fillStyle = tierBoost > .65 ? '#ffe39a' : '#d9fff8';
    ctx.font = `900 ${Math.round(24 + burst.count * 3 + tierBoost * 5)}px sans-serif`;
    ctx.fillText(`×${burst.count}`, width / 2, y);
    ctx.restore();
  }

  private drawSoloResult(ctx: CanvasRenderingContext2D, width: number, height: number, result: SoloResultState): void {
    ctx.fillStyle = 'rgba(3,10,14,.72)';
    ctx.fillRect(0, 0, width, height);

    const panelW = Math.min(310, width - 30);
    const panelH = 326;
    const x = (width - panelW) / 2;
    const y = Math.max(this.hudTop() + 86, Math.min(height * .29, height - panelH - 18));
    this.roundedRect(ctx, x, y, panelW, panelH, 28);
    ctx.fillStyle = 'rgba(12,31,39,.98)';
    ctx.fill();
    ctx.strokeStyle = result.kind === 'cleared' ? 'rgba(245,207,104,.72)' : 'rgba(190,205,205,.32)';
    ctx.lineWidth = 1.4;
    ctx.stroke();

    const tier = Math.min(11, pieceTier(result.highest));
    const name = pieceName(this.currentTheme, result.highest);
    ctx.textAlign = 'center';
    ctx.fillStyle = result.kind === 'cleared' ? '#ffe39a' : '#f2eee1';
    ctx.font = '900 25px sans-serif';
    ctx.fillText(result.kind === 'cleared' ? '登顶成功' : '棋盘已满', width / 2, y + 43);

    ctx.fillStyle = '#d8e6e2';
    ctx.font = '850 13px sans-serif';
    ctx.fillText(
      result.kind === 'cleared' ? `${pieceName(this.currentTheme, MAX_PIECE_VALUE)} · 11/11` : `止步 · ${name} · ${tier}/11`,
      width / 2,
      y + 78,
    );

    ctx.fillStyle = '#D6E4E3';
    ctx.font = '800 10px sans-serif';
    ctx.fillText('得分', width / 2, y + 112);
    ctx.fillStyle = '#fff0bd';
    ctx.font = '900 28px sans-serif';
    ctx.fillText(result.score.toLocaleString('zh-CN'), width / 2, y + 139);

    if (result.elapsedMs > 0) {
      ctx.fillStyle = '#D0DFDE';
      ctx.font = '800 10px sans-serif';
      ctx.fillText(`用时 ${this.formatSoloTime(result.elapsedMs)}`, width / 2, y + 168);
    }

    const actions = this.soloResultActionRects(width, height);
    this.drawPillButton(ctx, actions.primary, '再来一局', 'primary', 'solo');
    this.drawPillButton(ctx, actions.home, '返回首页', 'secondary', 'back');
  }

  private formatSoloTime(ms: number): string {
    const total = Math.max(0, ms);
    const minutes = Math.floor(total / 60_000);
    const seconds = (total % 60_000) / 1000;
    return `${minutes}:${seconds.toFixed(2).padStart(5, '0')}`;
  }

  private drawOnlineHud(ctx: CanvasRenderingContext2D, width: number, height: number): void {
    const snap = this.online!.snapshot();
    if (snap.mode === 'playing') {
      this.drawDuelHud(ctx, width, height, snap.me, snap.opponent);
      return;
    }
    if (snap.mode === 'result') {
      this.drawDuelHud(ctx, width, height, snap.me, snap.opponent);
      this.drawResult(ctx, width, height);
      return;
    }

    this.drawBack(ctx);
    if (snap.mode === 'matching') {
      const elapsed = snap.state.matchmaking.joinedAt ? Math.max(0, (Date.now() - snap.state.matchmaking.joinedAt) / 1000) : 0;
      ctx.textAlign = 'center';
      ctx.fillStyle = '#fff1c9';
      ctx.font = '900 24px sans-serif';
      ctx.fillText('正在寻找对手…', width / 2, height * 0.37);
      ctx.fillStyle = '#bfd1d3';
      ctx.font = '700 11px sans-serif';
      ctx.fillText(`已等待 ${elapsed.toFixed(1)} 秒 · 队列 ${Math.max(1, snap.state.matchmaking.queueSize)} 人`, width / 2, height * 0.37 + 32);
      this.drawPillButton(ctx, this.matchingCancelRect(width, height), '取消匹配', 'secondary');
      return;
    }

    if (snap.mode === 'room') {
      const room = snap.state.room;
      const players = room?.players ?? [];
      const layout = this.roomLobbyLayout(width, height);

      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#17343C';
      ctx.font = '900 25px sans-serif';
      ctx.fillText('好友房间', width / 2, this.hudTop() + 28);
      ctx.fillStyle = '#38565D';
      ctx.font = '800 10px sans-serif';
      ctx.fillText('邀请好友加入后，一起准备开局', width / 2, this.hudTop() + 52);

      ctx.save();
      ctx.shadowColor = 'rgba(28,49,53,.16)';
      ctx.shadowOffsetY = 3;
      this.roundedRect(ctx, layout.code.x, layout.code.y, layout.code.width, layout.code.height - 3, 18);
      ctx.fillStyle = '#FFF0C9';
      ctx.fill();
      ctx.shadowColor = 'transparent';
      ctx.strokeStyle = '#17343C';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.fillStyle = '#46636A';
      ctx.font = '900 9px sans-serif';
      ctx.fillText('房号', layout.code.x + 28, layout.code.y + layout.code.height / 2);
      ctx.fillStyle = '#8A5A13';
      ctx.font = '900 18px monospace';
      ctx.fillText(room?.code ?? '------', layout.code.x + layout.code.width / 2 + 22, layout.code.y + layout.code.height / 2);
      ctx.restore();

      layout.players.forEach((rect, index) => {
        const player = players[index];
        const isMe = player?.id === snap.state.playerId;
        ctx.save();
        ctx.shadowColor = 'rgba(28,49,53,.13)';
        ctx.shadowOffsetY = 2;
        this.roundedRect(ctx, rect.x, rect.y, rect.width, rect.height - 2, 16);
        ctx.fillStyle = player ? (isMe ? '#FFDFA0' : '#FFF0C9') : '#D9E3DD';
        ctx.fill();
        ctx.shadowColor = 'transparent';
        ctx.strokeStyle = '#17343C';
        ctx.lineWidth = player ? 1.8 : 1.2;
        ctx.stroke();
        ctx.textAlign = 'left';
        ctx.fillStyle = '#17343C';
        ctx.font = '900 10px sans-serif';
        const label = player ? `${player.name}${isMe ? ' · 我' : ''}` : '等待好友';
        fitText(ctx, label, rect.width - 18, 10, 900, 8);
        ctx.fillText(label, rect.x + 10, rect.y + 15);
        ctx.fillStyle = '#46636A';
        ctx.font = '800 8.5px sans-serif';
        ctx.fillText(player ? THEMES[player.theme].label : '空位', rect.x + 10, rect.y + 30);
        if (player) {
          ctx.textAlign = 'right';
          ctx.fillStyle = player.ready ? '#176E55' : '#8A5A13';
          ctx.font = '900 8.5px sans-serif';
          ctx.fillText(player.ready ? '已准备' : '未准备', rect.x + rect.width - 10, rect.y + 30);
        }
        ctx.restore();
      });

      const me = players.find(player => player.id === snap.state.playerId);
      this.drawPillButton(ctx, layout.share, '邀请抖音好友', 'secondary', 'share');
      this.drawPillButton(ctx, layout.ready, me?.ready ? '取消准备' : '准备', 'primary');
      return;
    }

    const layout = this.onlineLobbyLayout(width, height);
    ctx.save();
    ctx.shadowColor = 'rgba(28,49,53,.16)';
    ctx.shadowOffsetY = 3;
    this.roundedRect(ctx, layout.theme.x, layout.theme.y, layout.theme.width, layout.theme.height - 3, 18);
    ctx.fillStyle = '#FFF0C9';
    ctx.fill();
    ctx.shadowColor = 'transparent';
    ctx.strokeStyle = '#17343C';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#17343C';
    ctx.font = '900 13px sans-serif';
    ctx.fillText(`‹   ${THEMES[snap.selectedTheme].label}   ›`, width / 2, layout.theme.y + (layout.theme.height - 3) / 2);
    ctx.restore();

    ctx.textAlign = 'center';
    ctx.fillStyle = '#17343C';
    ctx.font = '900 10px sans-serif';
    ctx.fillText('出战技能 · 点击卡片轮换', width / 2, layout.skills[0].y - 12);
    snap.loadout.forEach((skillId, index) => {
      const def = SKILL_DEFINITIONS[skillId];
      this.drawSkillButton(ctx, layout.skills[index], def.shortLabel, `${def.cost} 能量`, true, skillUiIcon(skillId));
    });

    this.drawPillButton(ctx, layout.quick, '开始匹配', 'primary', 'pvp');
    this.drawPillButton(ctx, layout.create, '创建好友房', 'secondary', 'room');
    this.drawPillButton(ctx, layout.join, '加入好友房', 'secondary', 'room');

    if (snap.state.lastError) {
      ctx.fillStyle = '#ffb8ae';
      ctx.font = '700 10px sans-serif';
      ctx.fillText(snap.state.lastError, width / 2, layout.quick.y - 18);
    }
  }

  private drawDuelHud(ctx: CanvasRenderingContext2D, width: number, height: number, me: MatchPlayerState | null, opponent: MatchPlayerState | null): void {
    const top = this.hudTop();
    this.drawBack(ctx);

    const timerMs = this.online!.remainingMs();
    const seconds = Math.ceil(timerMs / 1000);
    const timer = `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;

    ctx.textAlign = 'center';
    ctx.fillStyle = '#fff2cc';
    ctx.font = '900 17px sans-serif';
    ctx.fillText(timer, width / 2, top + 28);

    ctx.textAlign = 'left';
    ctx.fillStyle = '#e3efee';
    ctx.font = '800 11px sans-serif';
    const myName = me?.name ?? '我';
    fitText(ctx, myName, width * .34, 11, 800, 8.5);
    ctx.fillText(myName, 20, top + 66);
    ctx.fillStyle = '#ffe58a';
    ctx.font = '900 22px sans-serif';
    ctx.fillText(this.online!.controller.predictedScore.toLocaleString('zh-CN'), 20, top + 89);

    ctx.textAlign = 'right';
    ctx.fillStyle = '#e3efee';
    ctx.font = '800 11px sans-serif';
    const opponentName = opponent?.name ?? '对手';
    fitText(ctx, opponentName, width * .34, 11, 800, 8.5);
    ctx.fillText(opponentName, width - 20, top + 66);
    ctx.fillStyle = '#ffe58a';
    ctx.font = '900 22px sans-serif';
    ctx.fillText((opponent?.board.score ?? 0).toLocaleString('zh-CN'), width - 20, top + 89);

    const remoteEnergy = opponent ? opponent.energy / Math.max(1, opponent.maxEnergy) : 0;
    const remoteBar = { x: width / 2 - 74, y: top + 104, width: 148, height: 5 };
    this.drawEnergyBar(ctx, remoteBar, remoteEnergy, '#c870db');
    ctx.fillStyle = '#dce8e8';
    ctx.font = '650 9px sans-serif';
    ctx.textAlign = 'center';
    drawUiIcon(ctx, 'energy', width / 2 - 34, top + 119, 10, '#dce8e8');
    ctx.fillText(`对手 ${opponent?.energy ?? 0}`, width / 2 + 8, top + 119);

    const safeBottom = Math.max(14, this.platform.getSystemInfo().safeArea.bottom + 10);
    const energyY = height - safeBottom - 106;
    const localRatio = me ? me.energy / Math.max(1, me.maxEnergy) : 0;
    this.drawEnergyBar(ctx, { x: 28, y: energyY, width: width - 56, height: 8 }, localRatio, '#4fd4c8');
    ctx.fillStyle = '#fff0c8';
    ctx.font = '800 10px sans-serif';
    drawUiIcon(ctx, 'energy', width / 2 - 39, energyY - 10, 11, '#fff0c8');
    ctx.fillText(`${me?.energy ?? 0} / ${me?.maxEnergy ?? 100}`, width / 2 + 8, energyY - 10);

    const rects = this.duelSkillRects(width, height);
    me?.loadout.forEach((skillId, index) => {
      const def = SKILL_DEFINITIONS[skillId];
      const remaining = Math.max(0, (me.skillCooldowns[skillId] ?? 0) - this.online!.serverNow());
      const ready = remaining <= 0 && me.energy >= def.cost;
      this.drawSkillButton(ctx, rects[index], def.shortLabel, remaining > 0 ? `${(remaining / 1000).toFixed(1)}s` : `${def.cost} 能量`, ready, skillUiIcon(skillId));
    });

    if (this.client.snapshot().status === 'reconnecting') {
      ctx.fillStyle = 'rgba(12,23,30,.88)';
      this.roundedRect(ctx, width / 2 - 94, height * 0.48, 188, 38, 16);
      ctx.fill();
      ctx.fillStyle = '#ffe2a6';
      ctx.font = '800 11px sans-serif';
      ctx.fillText('网络中断 · 正在重连…', width / 2, height * 0.48 + 19);
    }
  }

  private drawResult(ctx: CanvasRenderingContext2D, width: number, height: number): void {
    const snap = this.online!.snapshot();
    const match = snap.state.match;
    if (!match) return;
    const won = match.winnerId === snap.state.playerId;
    const draw = match.winnerId === null;
    const panelWidth = Math.min(310, width - 34);
    const x = (width - panelWidth) / 2;
    const y = height * 0.26;
    const h = 344;

    ctx.fillStyle = 'rgba(8,18,24,.92)';
    this.roundedRect(ctx, x, y, panelWidth, h, 26);
    ctx.fill();
    ctx.strokeStyle = won ? '#e9c761' : 'rgba(220,235,236,.35)';
    ctx.lineWidth = 1.2;
    ctx.stroke();

    ctx.textAlign = 'center';
    ctx.fillStyle = won ? '#ffe58a' : '#eef3f2';
    ctx.font = '900 28px sans-serif';
    ctx.fillText(draw ? '平局' : won ? '胜利' : '惜败', width / 2, y + 46);

    const resultMe = match.result?.players.find(player => player.playerId === snap.state.playerId);
    const resultOpponent = match.result?.players.find(player => player.playerId !== snap.state.playerId);
    const meScore = resultMe?.score ?? snap.me?.board.score ?? 0;
    const opponentScore = resultOpponent?.score ?? snap.opponent?.board.score ?? 0;
    ctx.fillStyle = '#D6E4E3';
    ctx.font = '800 10px sans-serif';
    ctx.fillText(`${resultMe?.name ?? snap.me?.name ?? '我'}  对战  ${resultOpponent?.name ?? snap.opponent?.name ?? '对手'}`, width / 2, y + 69);
    ctx.fillStyle = '#f2f0e6';
    ctx.font = '900 24px sans-serif';
    ctx.fillText(`${meScore}   比   ${opponentScore}`, width / 2, y + 92);
    ctx.fillStyle = '#D0DFDE';
    ctx.font = '800 10px sans-serif';
    ctx.fillText(this.online!.resultReason(), width / 2, y + 120);
    if (resultMe && resultOpponent) {
      const meHighest = pieceName(resultMe.theme, resultMe.highest);
      const opponentHighest = pieceName(resultOpponent.theme, resultOpponent.highest);
      const spaces = match.result?.tieBreaker === 'usable_space'
        ? ` · 空位 ${resultMe.usableEmptyCells} : ${resultOpponent.usableEmptyCells}`
        : '';
      ctx.fillStyle = '#c9d8d6';
      ctx.font = '750 10px sans-serif';
      ctx.fillText(`最高 ${meHighest}  对比  ${opponentHighest}${spaces}`, width / 2, y + 142);
    }

    const { primary, lobby, share } = this.resultActionRects(width, height);
    const roomMe = snap.state.room?.players.find(player => player.id === snap.state.playerId);
    const opponentRoom = snap.state.room?.players.find(player => player.id !== snap.state.playerId);
    this.drawPillButton(
      ctx,
      primary,
      opponentRoom ? (roomMe?.rematchReady ? '取消再来一局' : '再来一局') : '寻找新对手',
      'primary',
    );
    this.drawPillButton(ctx, lobby, '返回对战大厅', 'secondary');
    this.drawPillButton(ctx, share, '分享战绩', 'secondary', 'share');

    if (roomMe?.rematchReady && opponentRoom) {
      ctx.fillStyle = '#b9cacc';
      ctx.font = '700 9px sans-serif';
      ctx.fillText(opponentRoom.rematchReady ? '双方已准备…' : '等待对手…', width / 2, y + 324);
    }
  }

  private drawJoinPad(ctx: CanvasRenderingContext2D, width: number, height: number): void {
    const pad = this.joinPadLayout(width, height);
    const bg = THEMES[this.currentTheme].ui.background;
    const ink = '#17343C';
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, width, height);

    ctx.save();
    ctx.shadowColor = 'rgba(28,49,53,.18)';
    ctx.shadowOffsetY = 3;
    this.roundedRect(ctx, pad.close.x, pad.close.y, pad.close.width, pad.close.height, 20);
    ctx.fillStyle = '#FFF0C9';
    ctx.fill();
    ctx.shadowColor = 'transparent';
    ctx.strokeStyle = ink;
    ctx.lineWidth = 2;
    ctx.stroke();
    drawUiIcon(ctx, 'back', pad.close.x + pad.close.width / 2, pad.close.y + pad.close.height / 2, 29, ink);
    ctx.restore();

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = ink;
    ctx.font = '900 25px sans-serif';
    ctx.fillText('加入好友房', width / 2, pad.close.y + 22);
    ctx.fillStyle = '#38565D';
    ctx.font = '800 10px sans-serif';
    ctx.fillText('输入好友分享的 6 位房号', width / 2, pad.close.y + 48);

    pad.codeSlots.forEach((slot, index) => {
      ctx.save();
      ctx.shadowColor = 'rgba(28,49,53,.12)';
      ctx.shadowOffsetY = 2;
      this.roundedRect(ctx, slot.x, slot.y, slot.width, slot.height, 14);
      ctx.fillStyle = '#FFF0C9';
      ctx.fill();
      ctx.shadowColor = 'transparent';
      ctx.strokeStyle = index < this.joinCode.length ? '#8A5A13' : ink;
      ctx.lineWidth = index < this.joinCode.length ? 2.2 : 1.5;
      ctx.stroke();
      ctx.fillStyle = ink;
      ctx.font = '900 20px monospace';
      ctx.fillText(this.joinCode[index] ?? '·', slot.x + slot.width / 2, slot.y + slot.height / 2 + 1);
      ctx.restore();
    });

    for (const entry of pad.keys) {
      ctx.save();
      ctx.shadowColor = 'rgba(28,49,53,.13)';
      ctx.shadowOffsetY = 3;
      this.roundedRect(ctx, entry.rect.x, entry.rect.y, entry.rect.width, entry.rect.height - 3, 17);
      ctx.fillStyle = entry.key === '⌫' ? '#D9E3DD' : '#FFF0C9';
      ctx.fill();
      ctx.shadowColor = 'transparent';
      ctx.strokeStyle = ink;
      ctx.lineWidth = 1.8;
      ctx.stroke();
      ctx.fillStyle = ink;
      ctx.font = entry.key === '⌫' ? '900 17px sans-serif' : '900 18px sans-serif';
      ctx.fillText(entry.key, entry.rect.x + entry.rect.width / 2, entry.rect.y + (entry.rect.height - 3) / 2);
      ctx.restore();
    }

    this.drawPillButton(
      ctx,
      pad.join,
      this.joinCode.length === 6 ? '加入房间' : '输入完整房号',
      'primary',
      'room',
      this.joinCode.length !== 6,
    );
  }

  private drawThemeUnlock(ctx: CanvasRenderingContext2D, width: number, height: number): void {
    const layout = this.themeUnlockLayout(width, height);
    const economy = THEME_UNLOCK_ECONOMY[this.currentTheme];
    const progress = this.auth.themeUnlockProgress(this.currentTheme);
    const balance = this.auth.current.status === 'authenticated' ? this.auth.current.player.rewards.currency : 0;

    ctx.save();
    ctx.fillStyle = 'rgba(7,18,24,.64)';
    ctx.fillRect(0, 0, width, height);

    this.roundedRect(ctx, layout.panel.x, layout.panel.y, layout.panel.width, layout.panel.height, 26);
    ctx.fillStyle = 'rgba(255,240,201,.98)';
    ctx.fill();
    ctx.strokeStyle = '#17343C';
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#17343C';
    ctx.font = '900 23px sans-serif';
    ctx.fillText(`解锁 · ${THEMES[this.currentTheme].label}`, width / 2, layout.panel.y + 38);

    ctx.fillStyle = '#46636A';
    ctx.font = '750 11px sans-serif';
    ctx.fillText('解锁后永久拥有 · 两种方式任选其一', width / 2, layout.panel.y + 68);

    ctx.textAlign = 'left';
    ctx.fillStyle = '#17343C';
    ctx.font = '850 12px sans-serif';
    ctx.fillText(`当前星币：${balance}`, layout.panel.x + 24, layout.panel.y + 101);
    ctx.textAlign = 'right';
    ctx.fillText('视频方式：一次永久解锁', layout.panel.x + layout.panel.width - 24, layout.panel.y + 101);

    this.drawPillButton(
      ctx, layout.coin, `使用 ${economy.coinCost} 星币永久解锁`,
      'primary', 'coin', this.themeUnlockBusy || balance < economy.coinCost, this.themeUnlockBusy,
    );
    const adDisabled = this.themeUnlockBusy || progress.required <= 0 || progress.dailyRemaining <= 0;
    this.drawPillButton(
      ctx, layout.ad,
      progress.dailyRemaining > 0
        ? `看广告永久解锁 · 今日剩 ${progress.dailyRemaining}/${THEME_UNLOCK_AD_DAILY_CAP}`
        : '今日视频解锁次数已用完',
      'secondary', 'video', adDisabled, this.themeUnlockBusy,
    );

    const hintY = layout.ad.y + layout.ad.height + 26;
    ctx.textAlign = 'center';
    ctx.fillStyle = this.themeUnlockMessage ? '#9A4F32' : '#5E746F';
    ctx.font = '750 10px sans-serif';
    ctx.fillText(
      this.themeUnlockMessage ?? '完整观看一次广告即可获得当前主题永久解锁奖励',
      width / 2, hintY,
    );

    this.roundedRect(ctx, layout.close.x, layout.close.y, layout.close.width, layout.close.height, 16);
    ctx.fillStyle = 'rgba(23,52,60,.08)';
    ctx.fill();
    ctx.strokeStyle = '#17343C';
    ctx.lineWidth = 1.4;
    ctx.stroke();
    ctx.fillStyle = '#17343C';
    ctx.font = '900 21px sans-serif';
    ctx.fillText('×', layout.close.x + layout.close.width / 2, layout.close.y + layout.close.height / 2 - 1);
    ctx.restore();
  }

  private drawSettings(ctx: CanvasRenderingContext2D, width: number, height: number): void {
    const layout = this.settingsLayout(width, height);
    ctx.fillStyle = THEMES[this.currentTheme].ui.background;
    ctx.fillRect(0, 0, width, height);

    ctx.save();
    ctx.shadowColor = 'rgba(28,49,53,.18)';
    ctx.shadowOffsetY = 3;
    this.roundedRect(ctx, layout.back.x, layout.back.y, layout.back.width, layout.back.height, 20);
    ctx.fillStyle = '#FFF0C9';
    ctx.fill();
    ctx.shadowColor = 'transparent';
    ctx.strokeStyle = '#17343C';
    ctx.lineWidth = 2;
    ctx.stroke();
    drawUiIcon(ctx, 'back', layout.back.x + layout.back.width / 2, layout.back.y + layout.back.height / 2, 29, '#17343C');
    ctx.restore();

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#17343C';
    ctx.font = '900 25px sans-serif';
    ctx.fillText('设置', width / 2, layout.back.y + 22);
    ctx.fillStyle = '#46636A';
    ctx.font = '800 10px sans-serif';
    ctx.fillText('声音与游戏反馈', width / 2, layout.back.y + 47);

    this.drawSettingRow(ctx, layout.music, '背景音乐', this.musicEnabled);
    this.drawSettingRow(ctx, layout.sound, '音效', this.soundEnabled);
    this.drawSettingRow(ctx, layout.haptics, '震动', this.hapticsEnabled);

    ctx.textAlign = 'left';
    ctx.fillStyle = '#46636A';
    ctx.font = '800 10px sans-serif';
    ctx.fillText('随时可以回来修改', layout.music.x + 4, layout.haptics.y + layout.haptics.height + 26);

    this.drawPillButton(ctx, layout.done, '完成', 'primary');
  }

  private drawSettingRow(ctx: CanvasRenderingContext2D, rect: Rect, label: string, enabled: boolean): void {
    ctx.save();
    ctx.shadowColor = 'rgba(28,49,53,.15)';
    ctx.shadowOffsetY = 3;
    this.roundedRect(ctx, rect.x, rect.y, rect.width, rect.height - 3, 20);
    ctx.fillStyle = '#FFF0C9';
    ctx.fill();
    ctx.shadowColor = 'transparent';
    ctx.strokeStyle = '#17343C';
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#17343C';
    ctx.font = '900 15px sans-serif';
    ctx.fillText(label, rect.x + 18, rect.y + rect.height * .38);
    ctx.fillStyle = '#46636A';
    ctx.font = '800 9.5px sans-serif';
    ctx.fillText(enabled ? '已开启' : '已关闭', rect.x + 18, rect.y + rect.height * .68);

    const switchW = 52;
    const switchH = 28;
    const sx = rect.x + rect.width - switchW - 18;
    const sy = rect.y + (rect.height - switchH) / 2 - 1;
    this.roundedRect(ctx, sx, sy, switchW, switchH, switchH / 2);
    ctx.fillStyle = enabled ? '#3FA977' : '#A9B2AE';
    ctx.fill();
    ctx.strokeStyle = '#17343C';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(enabled ? sx + switchW - 14 : sx + 14, sy + switchH / 2, 10, 0, Math.PI * 2);
    ctx.fillStyle = '#FFF8E8';
    ctx.fill();
    ctx.strokeStyle = '#17343C';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.restore();
  }

  private drawOnboarding(ctx: CanvasRenderingContext2D, width: number, height: number): void {
    ctx.fillStyle = THEMES[this.currentTheme].ui.background;
    ctx.fillRect(0, 0, width, height);
    const panelWidth = Math.min(314, width - 30);
    const x = (width - panelWidth) / 2;
    const y = height * 0.34;
    const panelHeight = 330;
    this.roundedRect(ctx, x, y, panelWidth, panelHeight, 28);
    ctx.fillStyle = '#FFF0C9';
    ctx.fill();
    ctx.strokeStyle = '#17343C';
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.textAlign = 'center';
    ctx.fillStyle = '#17343C';
    ctx.font = '900 25px sans-serif';
    ctx.fillText('怎么玩？', width / 2, y + 48);
    ctx.fillStyle = '#46636A';
    ctx.font = '700 11px sans-serif';
    ctx.fillText(`目标：${pieceName(this.currentTheme, MAX_PIECE_VALUE)} · 11/11`, width / 2, y + 76);

    const steps = [
      ['01', '滑动合成', '相同棋子会合成更高阶'],
      ['02', '一路晋升', '达到 11/11 就完成挑战'],
      ['03', '卡住就清障', '清除两枚最低阶棋子'],
    ] as const;
    steps.forEach((step, index) => {
      const rowY = y + 112 + index * 58;
      ctx.textAlign = 'left';
      ctx.fillStyle = '#9A6516';
      ctx.font = '900 10px sans-serif';
      ctx.fillText(step[0], x + 24, rowY);
      ctx.fillStyle = '#17343C';
      ctx.font = '850 12px sans-serif';
      ctx.fillText(step[1], x + 54, rowY - 6);
      ctx.fillStyle = '#46636A';
      ctx.font = '650 9px sans-serif';
      ctx.fillText(step[2], x + 54, rowY + 12);
    });

    this.drawPillButton(
      ctx,
      { x: 46, y: y + 260, width: width - 92, height: 48 },
      '开始挑战',
      'primary',
    );
  }

  private drawExitConfirm(ctx: CanvasRenderingContext2D, width: number, height: number): void {
    ctx.fillStyle = 'rgba(4,10,15,.62)';
    ctx.fillRect(0, 0, width, height);
    const panelWidth = Math.min(280, width - 42);
    const x = (width - panelWidth) / 2;
    const y = height * 0.42;
    this.roundedRect(ctx, x, y, panelWidth, 170, 24);
    ctx.fillStyle = 'rgba(14,30,38,.97)';
    ctx.fill();

    ctx.textAlign = 'center';
    ctx.fillStyle = '#fff1ca';
    ctx.font = '900 20px sans-serif';
    ctx.fillText('退出对局？', width / 2, y + 38);
    ctx.fillStyle = '#b9cbcc';
    ctx.font = '700 10px sans-serif';
    ctx.fillText('现在离开将结束本局并离开房间', width / 2, y + 68);

    const stay = { x: x + 14, y: y + 112, width: (panelWidth - 36) / 2, height: 42 };
    const leave = { x: stay.x + stay.width + 8, y: stay.y, width: stay.width, height: 42 };
    this.drawPillButton(ctx, stay, '继续游戏', 'primary');
    this.drawPillButton(ctx, leave, '确认退出', 'secondary');
  }

  private drawBack(ctx: CanvasRenderingContext2D): void {
    const top = this.hudTop();
    const rect = { x: 10, y: top + 2, width: 58, height: 58 };
    ctx.save();
    ctx.shadowColor = 'rgba(28,49,53,.18)';
    ctx.shadowOffsetY = 3;
    this.roundedRect(ctx, rect.x, rect.y, rect.width, rect.height, 20);
    ctx.fillStyle = '#FFF0C9';
    ctx.fill();
    ctx.shadowColor = 'transparent';
    ctx.strokeStyle = '#17343C';
    ctx.lineWidth = 2;
    ctx.stroke();
    drawUiIcon(ctx, 'back', rect.x + rect.width / 2, rect.y + rect.height / 2, 29, '#17343C');
    ctx.restore();
  }

  private drawEnergyBar(ctx: CanvasRenderingContext2D, rect: Rect, ratio: number, color: string): void {
    this.roundedRect(ctx, rect.x, rect.y, rect.width, rect.height, rect.height / 2);
    ctx.fillStyle = 'rgba(255,255,255,.18)';
    ctx.fill();
    const width = Math.max(0, Math.min(rect.width, rect.width * ratio));
    if (width > 0.5) {
      this.roundedRect(ctx, rect.x, rect.y, width, rect.height, rect.height / 2);
      ctx.fillStyle = color;
      ctx.fill();
    }
  }

  private drawSkillButton(
    ctx: CanvasRenderingContext2D,
    rect: Rect,
    label: string,
    meta: string,
    ready: boolean,
    icon?: UiIcon,
  ): void {
    this.roundedRect(ctx, rect.x, rect.y, rect.width, rect.height, Math.min(16, rect.height / 2));
    const gradient = ctx.createLinearGradient(rect.x, rect.y, rect.x, rect.y + rect.height);
    gradient.addColorStop(0, ready ? 'rgba(26,91,98,.98)' : 'rgba(47,58,63,.90)');
    gradient.addColorStop(1, ready ? 'rgba(13,57,69,.98)' : 'rgba(32,43,48,.90)');
    ctx.fillStyle = gradient;
    ctx.fill();
    ctx.strokeStyle = ready ? 'rgba(243,207,106,.78)' : 'rgba(130,146,148,.38)';
    ctx.lineWidth = ready ? 1.35 : 1;
    ctx.stroke();
    if (icon) {
      drawUiIcon(
        ctx,
        icon,
        rect.x + Math.min(18, rect.width * .20),
        rect.y + rect.height * .38,
        Math.min(17, rect.height * .34),
        ready ? '#ffe397' : '#849395',
      );
    }
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = ready ? '#fff0b6' : '#aeb9ba';
    ctx.font = '900 10.5px sans-serif';
    ctx.fillText(label, rect.x + rect.width / 2 + (icon ? 6 : 0), rect.y + rect.height * .34);
    ctx.fillStyle = ready ? '#8ee4db' : '#B8C6C7';
    ctx.font = '750 8.8px sans-serif';
    ctx.fillText(meta, rect.x + rect.width / 2, rect.y + rect.height * .72);
  }

  private drawPillButton(
    ctx: CanvasRenderingContext2D,
    rect: Rect,
    label: string,
    kind: 'primary' | 'secondary',
    icon?: UiIcon,
    disabled = false,
    loading = false,
  ): void {
    drawPremiumButton(ctx, rect, label, { kind, icon, disabled, loading, compact: rect.height < 42 });
  }

  private flashTap(rect: Rect): void {
    this.tapFlash = { rect: { ...rect }, until: this.visualTime + .12 };
    this.platform.haptics.trigger('light');
    this.refreshHud();
  }

  private drawTapFlash(ctx: CanvasRenderingContext2D, rect: Rect): void {
    this.roundedRect(ctx, rect.x - 2, rect.y - 2, rect.width + 4, rect.height + 4, Math.min(22, rect.height / 2 + 2));
    ctx.strokeStyle = 'rgba(255,244,202,.72)';
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  private drawNotice(ctx: CanvasRenderingContext2D, width: number, height: number, text: string): void {
    const rectWidth = Math.min(260, width - 32);
    const y = height * 0.46;
    this.roundedRect(ctx, width / 2 - rectWidth / 2, y, rectWidth, 42, 18);
    ctx.fillStyle = 'rgba(9,22,29,.90)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,226,151,.45)';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = '#fff0c7';
    ctx.font = '750 12px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(text, width / 2, y + 21);
  }

  private async rewardSoloSkill(): Promise<void> {
    if (this.inputLocked || this.rewardedSkillClaims >= 1) return;
    this.inputLocked = true;
    this.notice = { text: '正在准备激励视频…', until: this.visualTime + 8 };
    this.refreshHud();
    const result = await this.commercial.showRewarded();
    if (result === 'rewarded') {
      // A completed rewarded video always grants the advertised local gameplay
      // reward immediately. The server claim is a best-effort idempotent ledger,
      // never a second gate after the user has already paid the ad-time cost.
      await this.auth.start();
      const claim = this.auth.requiresServerLedger
        ? await this.auth.claimAd(`${Date.now()}_${Math.random().toString(36).slice(2)}_${this.rewardedSkillClaims}`)
        : 'unavailable';
      this.rewardedSkillClaims += 1;
      this.skillCharges = Math.max(1, this.skillCharges);
      this.notice = {
        text: claim === 'unavailable' ? '清障 +1 已到账 · 账号记录稍后同步' : '奖励到账 · 清障 +1',
        until: this.visualTime + 1.7,
      };
      this.platform.haptics.trigger('success');

      const shouldAutoRescue = !this.controller.board.canMove();
      this.inputLocked = false;
      if (shouldAutoRescue) {
        const rescued = await this.useRandomClear();
        if (!rescued && !this.controller.board.canMove()) this.finishSolo('stuck');
        return;
      }
    } else if (result === 'skipped') {
      this.notice = { text: '完整观看后才能获得清障奖励', until: this.visualTime + 1.5 };
    } else {
      this.notice = { text: '当前暂无视频 · 可继续游戏或结束本局', until: this.visualTime + 1.8 };
      if (!this.controller.board.canMove()) {
        this.inputLocked = false;
        this.finishSolo('stuck');
        return;
      }
    }
    this.inputLocked = false;
    this.refreshHud();
  }

  private sidebarRewardReady(): boolean {
    if (!this.social.cameFromSidebar()) return false;
    const today = new Date().toISOString().slice(0, 10);
    if (
      this.auth.current.status === 'authenticated'
      && this.auth.current.player.rewards.lastSidebarRewardDay === today
    ) return false;
    return this.platform.storage.getItem('doublefight-sidebar-reward-date') !== today;
  }

  private async claimSidebarReward(): Promise<void> {
    if (this.inputLocked) return;
    this.inputLocked = true;
    await this.auth.start();
    const outcome = this.auth.requiresServerLedger ? await this.auth.claimSidebar() : DOUYIN_RELEASE ? 'unavailable' : 'granted';
    this.inputLocked = false;
    if (outcome !== 'granted') {
      this.notice = { text: outcome === 'duplicate' ? '今日福利已领取' : '福利服务暂不可用', until: this.visualTime + 1.5 };
      this.refreshHud();
      return;
    }
    const today = new Date().toISOString().slice(0, 10);
    this.platform.storage.setItem('doublefight-sidebar-reward-date', today);
    this.platform.storage.setItem('doublefight-next-solo-bonus', '1');
    this.notice = { text: this.auth.requiresServerLedger ? '每日福利到账 · +10 星币 · 下局清障 +1' : '每日福利到账 · 下局清障 +1', until: this.visualTime + 1.8 };
    this.platform.haptics.trigger('success');
    this.refreshHud();
  }

  private hudTop(): number {
    const info = this.platform.getSystemInfo();
    return uiMetrics(info.width, info.height, info.safeArea, info.menuButton?.bottom ?? 0).top;
  }

  private themeUnlockLayout(width: number, height: number) {
    const panelW = Math.min(334, width - 28);
    const panelH = 306;
    const x = (width - panelW) / 2;
    const y = Math.max(this.hudTop() + 104, Math.min(height * .30, height - panelH - 24));
    return {
      panel: { x, y, width: panelW, height: panelH },
      close: { x: x + panelW - 50, y: y + 12, width: 38, height: 38 },
      coin: { x: x + 22, y: y + 124, width: panelW - 44, height: 50 },
      ad: { x: x + 22, y: y + 184, width: panelW - 44, height: 48 },
    };
  }

  private settingsLayout(width: number, height: number) {
    const info = this.platform.getSystemInfo();
    const metrics = uiMetrics(width, height, info.safeArea, info.menuButton?.bottom ?? 0);
    const edge = Math.max(22, metrics.edge + 4);
    const cardW = width - edge * 2;
    const firstY = Math.max(metrics.top + 96, 176);
    return {
      back: { x: 12, y: Math.max(72, metrics.top + 2), width: 58, height: 58 },
      music: { x: edge, y: firstY, width: cardW, height: 68 },
      sound: { x: edge, y: firstY + 78, width: cardW, height: 68 },
      haptics: { x: edge, y: firstY + 156, width: cardW, height: 68 },
      done: { x: width / 2 - Math.min(132, width * .34), y: firstY + 254, width: Math.min(264, width * .68), height: 54 },
    };
  }

  private homeLayout(width: number, height: number, safeBottomInset: number) {
    const info = this.platform.getSystemInfo();
    const metrics = uiMetrics(width, height, { ...info.safeArea, bottom: safeBottomInset }, info.menuButton?.bottom ?? 0);
    const primaryWidth = Math.min(metrics.compact ? 244 : 268, width - metrics.edge * 2);
    const secondaryWidth = Math.min(metrics.compact ? 204 : 224, width - metrics.edge * 2 - 28);
    const utilityY = height - metrics.bottom - 48;
    const onlineY = utilityY - 54;
    const soloY = DOUYIN_PRODUCT_CONFIG.launch.onlineEnabled ? onlineY - 62 : utilityY - 72;
    const utilityAnchorWidth = Math.min(90, Math.max(72, width * .23));
    return {
      settings: { x: metrics.edge - 2, y: metrics.top + 4, width: metrics.minTouch, height: metrics.minTouch },
      theme: { x: width / 2 - 76, y: soloY - 50, width: 152, height: 36 },
      solo: { x: width / 2 - primaryWidth / 2, y: soloY, width: primaryWidth, height: metrics.compact ? 48 : 52 },
      online: { x: width / 2 - secondaryWidth / 2, y: onlineY, width: secondaryWidth, height: 40 },
      rank: { x: metrics.edge + 18, y: utilityY, width: utilityAnchorWidth, height: 48 },
      daily: { x: width - metrics.edge - 18 - utilityAnchorWidth, y: utilityY, width: utilityAnchorWidth, height: 48 },
    };
  }

  private onlineLobbyLayout(width: number, height: number) {
    const info = this.platform.getSystemInfo();
    const metrics = uiMetrics(width, height, info.safeArea, info.menuButton?.bottom ?? 0);
    const top = metrics.top;
    const gap = metrics.compact ? 8 : 10;
    const edge = Math.max(metrics.edge, 16);
    const quickY = height - metrics.bottom - (metrics.compact ? 154 : 166);
    const skillWidth = (width - edge * 2 - gap * 2) / 3;
    const skillY = quickY - (metrics.compact ? 76 : 84);
    return {
      theme: { x: width / 2 - 108, y: top + 96, width: 216, height: 46 },
      skills: [0, 1, 2].map(index => ({ x: edge + index * (skillWidth + gap), y: skillY, width: skillWidth, height: metrics.compact ? 60 : 66 })),
      quick: { x: edge + 12, y: quickY, width: width - (edge + 12) * 2, height: 56 },
      create: { x: edge + 12, y: quickY + 68, width: (width - (edge + 12) * 2 - 10) / 2, height: 46 },
      join: { x: width / 2 + 5, y: quickY + 68, width: (width - (edge + 12) * 2 - 10) / 2, height: 46 },
    };
  }

  private roomLobbyLayout(width: number, height: number) {
    const info = this.platform.getSystemInfo();
    const metrics = uiMetrics(width, height, info.safeArea, info.menuButton?.bottom ?? 0);
    const bottom = Math.max(16, metrics.bottom);
    const edge = Math.max(18, metrics.edge);
    const ready = { x: edge + 16, y: height - bottom - 62, width: width - (edge + 16) * 2, height: 52 };
    const share = { x: width / 2 - 104, y: ready.y - 54, width: 208, height: 42 };
    const playerGap = 10;
    const playerW = (width - edge * 2 - playerGap) / 2;
    const playerY = share.y - 50;
    return {
      code: { x: width / 2 - 88, y: this.hudTop() + 72, width: 176, height: 42 },
      players: [
        { x: edge, y: playerY, width: playerW, height: 42 },
        { x: edge + playerW + playerGap, y: playerY, width: playerW, height: 42 },
      ],
      share,
      ready,
    };
  }

  private soloSkillRect(width: number, height: number, safeBottom: number): Rect {
    const skillWidth = Math.min(226, width - 56);
    return {
      x: width / 2 - skillWidth / 2,
      y: height - safeBottom - 66,
      width: skillWidth,
      height: 54,
    };
  }

  private soloResultActionRects(width: number, height: number): { primary: Rect; home: Rect } {
    const panelW = Math.min(310, width - 30);
    const panelH = 326;
    const x = (width - panelW) / 2;
    const y = Math.max(this.hudTop() + 86, Math.min(height * .29, height - panelH - 18));
    return {
      primary: { x: x + 28, y: y + 205, width: panelW - 56, height: 48 },
      home: { x: x + 48, y: y + 263, width: panelW - 96, height: 40 },
    };
  }

  private resultActionRects(width: number, height: number): { primary: Rect; lobby: Rect; share: Rect } {
    const panelWidth = Math.min(310, width - 34);
    const x = (width - panelWidth) / 2;
    const y = height * 0.26;
    return {
      primary: { x: x + 20, y: y + 160, width: panelWidth - 40, height: 48 },
      lobby: { x: x + 20, y: y + 218, width: panelWidth - 40, height: 42 },
      share: { x: x + 56, y: y + 270, width: panelWidth - 112, height: 32 },
    };
  }

  private matchingCancelRect(width: number, height: number): Rect {
    return { x: width / 2 - 82, y: height * 0.58, width: 164, height: 42 };
  }

  private duelSkillRects(width: number, height: number): Rect[] {
    const safeBottom = Math.max(14, this.platform.getSystemInfo().safeArea.bottom + 10);
    const gap = 8;
    const edge = 18;
    const w = (width - edge * 2 - gap * 2) / 3;
    const y = height - safeBottom - 58;
    return [0, 1, 2].map(index => ({ x: edge + index * (w + gap), y, width: w, height: 50 }));
  }

  private joinPadLayout(width: number, height: number) {
    const info = this.platform.getSystemInfo();
    const metrics = uiMetrics(width, height, info.safeArea, info.menuButton?.bottom ?? 0);
    const edge = Math.max(20, metrics.edge);
    const close = { x: 12, y: Math.max(72, metrics.top + 2), width: 58, height: 58 };
    const codeGap = 6;
    const codeW = Math.min(40, (width - edge * 2 - codeGap * 5) / 6);
    const codeH = 48;
    const codeStartX = (width - (codeW * 6 + codeGap * 5)) / 2;
    const codeY = close.y + 82;
    const codeSlots = Array.from({ length: 6 }, (_, index) => ({
      x: codeStartX + index * (codeW + codeGap),
      y: codeY,
      width: codeW,
      height: codeH,
    }));

    const keyGap = metrics.compact ? 10 : 12;
    const keySize = Math.min(metrics.compact ? 54 : 60, Math.max(48, (width - edge * 2 - keyGap * 2) / 3));
    const startX = (width - (keySize * 3 + keyGap * 2)) / 2;
    const startY = codeY + codeH + 34;
    const labels = ['1','2','3','4','5','6','7','8','9','⌫','0'];
    const keys = labels.map((key, index) => {
      const row = Math.floor(index / 3);
      const col = index % 3;
      return { key, rect: { x: startX + col * (keySize + keyGap), y: startY + row * (keySize + 10), width: keySize, height: keySize } };
    });
    return {
      keys,
      codeSlots,
      close,
      join: { x: edge + 18, y: Math.min(height - metrics.bottom - 72, startY + 4 * (keySize + 10) + 4), width: width - (edge + 18) * 2, height: 54 },
    };
  }

  private hit(x: number, y: number, rect: Rect): boolean {
    return hitTarget(x, y, rect, 44);
  }

  private roundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number): void {
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
}
