import * as THREE from 'three';
import { ART } from '../../../src/config/artDirection';
import { THEMES, type ThemeId } from '../../../src/config/themes';
import { SoloController } from '../../../src/battle/SoloController';
import { BattleBoardView } from '../../../src/rendering/battle/BattleBoardView';
import { setTextureCanvasFactory } from '../../../src/rendering/TextureCanvasFactory';
import { OnlineClient } from '../../../src/network/OnlineClient';
import type { DouyinPlatform } from '../../../src/platform/douyin/DouyinPlatform';
import type { DouyinCanvas } from './api';
import {
  SKILL_DEFINITIONS,
  type BoardTile,
  type Direction,
  type MatchPlayerState,
  type SkillId,
} from '../../../shared/index';
import { DouyinOnlineFlow } from './onlineFlow';

type ProductMode = 'home' | 'solo' | 'online';
type Rect = { x: number; y: number; width: number; height: number };

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

  private readonly online: DouyinOnlineFlow;
  private readonly unsubscribeOnline: () => void;

  private inputLocked = false;
  private skillCharges = 3;
  private currentTheme: ThemeId;
  private mode: ProductMode = 'home';
  private disposed = false;
  private visualTime = 0;
  private nextDynamicHudAt = 0;
  private notice: { text: string; until: number } | null = null;
  private joinPadOpen = false;
  private joinCode = '';
  private exitConfirm = false;

  constructor(
    private readonly platform: DouyinPlatform,
    private readonly client: OnlineClient,
    screenCanvas: DouyinCanvas,
    context: WebGLRenderingContext,
    theme: ThemeId,
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

    this.boardView = new BattleBoardView(theme, 'full', undefined, undefined, true);
    this.controller = new SoloController(this.boardView);
    this.online = new DouyinOnlineFlow(platform, client, theme);
    this.scene.add(this.boardView.root, this.online.local.root, this.online.remote.root);
    this.online.local.root.visible = false;
    this.online.remote.root.visible = false;

    this.configureLighting();
    this.resize();
    this.applyThemeLook();
    this.boardView.prewarmTheme(theme);
    this.boardView.reset(HOME_TILES);

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

    this.unsubscribeOnline = this.online.subscribe(() => {
      if (this.mode !== 'online') return;
      const onlineMode = this.online.snapshot().mode;
      const snap = this.online.snapshot();
      if (onlineMode === 'playing' || onlineMode === 'result') {
        this.boardView.root.visible = false;
        this.online.local.root.visible = true;
        this.online.remote.root.visible = true;
      } else {
        if (this.boardView.theme !== snap.selectedTheme) {
          this.boardView.setTheme(snap.selectedTheme);
          this.boardView.reset(HOME_TILES);
          this.applyThemeLook();
        }
        this.boardView.root.visible = true;
        this.online.local.root.visible = false;
        this.online.remote.root.visible = false;
      }
      this.refreshHud();
    });

    this.refreshHud();
  }

  get theme(): ThemeId { return this.currentTheme; }
  get currentMode(): ProductMode { return this.mode; }
  get score(): number { return this.controller.board.score; }
  get highest(): number { return Math.max(2, ...this.controller.board.tiles().map(tile => tile.value)); }

  handleDirection(direction: Direction): void {
    if (this.mode === 'home') {
      if (direction === 'left' || direction === 'right') {
        this.setTheme(direction === 'left'
          ? this.currentTheme === 'kingdom' ? 'palace' : 'kingdom'
          : this.currentTheme === 'palace' ? 'kingdom' : 'palace');
        this.platform.haptics.trigger('light');
      }
      return;
    }
    if (this.mode === 'online') {
      const state = this.online.snapshot();
      if (state.mode === 'playing') {
        if (this.online.move(direction)) this.refreshHud();
      } else if (state.mode === 'lobby' && (direction === 'left' || direction === 'right')) {
        this.online.setTheme(state.selectedTheme === 'kingdom' ? 'palace' : 'kingdom');
      }
      return;
    }
    void this.move(direction);
  }

  async move(direction: Direction): Promise<boolean> {
    if (this.mode !== 'solo' || this.disposed || this.inputLocked) return false;
    const result = this.controller.move(direction);
    if (!result.changed) {
      this.platform.haptics.trigger('light');
      return false;
    }
    this.inputLocked = true;
    this.platform.haptics.trigger(result.merges.length > 0 ? 'medium' : 'light');
    await result.finished;
    if (this.disposed) return true;
    this.inputLocked = false;
    this.persistRecord();
    this.refreshHud();
    return true;
  }

  async useRandomClear(): Promise<boolean> {
    if (this.mode !== 'solo' || this.disposed || this.inputLocked || this.skillCharges <= 0) {
      this.platform.haptics.trigger('light');
      return false;
    }
    const result = this.controller.clearRandom(2);
    if (result.removed.length === 0) {
      this.platform.haptics.trigger('light');
      return false;
    }
    this.inputLocked = true;
    this.skillCharges -= 1;
    this.platform.haptics.trigger('success');
    this.refreshHud();
    await result.finished;
    if (!this.disposed) {
      this.inputLocked = false;
      this.persistRecord();
      this.refreshHud();
    }
    return true;
  }

  handleTap(x: number, y: number): void {
    if (this.disposed || this.inputLocked) return;
    if (this.mode === 'home') this.handleHomeTap(x, y);
    else if (this.mode === 'solo') this.handleSoloTap(x, y);
    else this.handleOnlineTap(x, y);
  }

  setTheme(theme: ThemeId): void {
    if (theme === this.currentTheme) return;
    this.currentTheme = theme;
    this.platform.storage.setItem('doublefight-theme', theme);
    this.boardView.setTheme(theme);
    this.boardView.prewarmTheme(theme);
    if (this.mode === 'home' || (this.mode === 'online' && this.online.snapshot().mode !== 'playing')) {
      this.boardView.reset(HOME_TILES);
    }
    this.applyThemeLook();
    this.refreshHud();
  }

  render(): void {
    if (this.disposed) return;
    const delta = Math.min(0.033, this.clock.getDelta());
    this.visualTime += delta;

    const onlineState = this.mode === 'online' ? this.online.snapshot() : null;
    const duel = onlineState?.mode === 'playing' || onlineState?.mode === 'result';

    if (duel) {
      this.online.local.update(delta);
      this.online.remote.update(delta);
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
      this.renderer.setViewport(0, 0, this.platform.getSystemInfo().width, this.platform.getSystemInfo().height);
      this.renderer.setClearColor(this.boardView.presentation.sky, 1);
      this.renderer.clear();
      this.renderer.render(this.scene, this.camera);
    }

    if (this.notice && this.visualTime >= this.notice.until) {
      this.notice = null;
      this.refreshHud();
    }

    this.renderer.clearDepth();
    this.renderer.setScissorTest(false);
    this.renderer.render(this.uiScene, this.uiCamera);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.unsubscribeOnline();
    this.online.dispose();
    this.boardView.dispose();
    this.uiTexture.dispose();
    this.uiMaterial.dispose();
    this.uiPlane.geometry.dispose();
    this.renderer.dispose();
    setTextureCanvasFactory(null);
  }

  private startSolo(): void {
    this.mode = 'solo';
    this.skillCharges = 3;
    this.inputLocked = false;
    this.notice = null;
    this.joinPadOpen = false;
    this.exitConfirm = false;
    this.boardView.root.visible = true;
    this.online.local.root.visible = false;
    this.online.remote.root.visible = false;
    this.controller.reset();
    this.configureCamera();
    this.platform.haptics.trigger('medium');
    this.refreshHud();
  }

  private openOnline(): void {
    this.mode = 'online';
    this.notice = null;
    this.joinPadOpen = false;
    this.joinCode = '';
    this.exitConfirm = false;
    this.boardView.root.visible = true;
    this.online.local.root.visible = false;
    this.online.remote.root.visible = false;
    this.boardView.reset(HOME_TILES);
    this.online.open(this.currentTheme);
    this.configureCamera();
    this.platform.haptics.trigger('medium');
    this.refreshHud();
  }

  private showHome(): void {
    this.persistRecord();
    if (this.mode === 'online') this.online.close();
    this.mode = 'home';
    this.inputLocked = false;
    this.notice = null;
    this.joinPadOpen = false;
    this.exitConfirm = false;
    this.online.local.root.visible = false;
    this.online.remote.root.visible = false;
    this.boardView.root.visible = true;
    this.boardView.reset(HOME_TILES);
    this.configureCamera();
    this.platform.haptics.trigger('light');
    this.refreshHud();
  }

  private handleHomeTap(x: number, y: number): void {
    const info = this.platform.getSystemInfo();
    const layout = this.homeLayout(info.width, info.height, info.safeArea.bottom);

    if (this.hit(x, y, layout.theme)) {
      this.setTheme(this.currentTheme === 'kingdom' ? 'palace' : 'kingdom');
      this.platform.haptics.trigger('light');
      return;
    }
    if (this.hit(x, y, layout.solo)) { this.startSolo(); return; }
    if (this.hit(x, y, layout.online)) { this.openOnline(); }
  }

  private handleSoloTap(x: number, y: number): void {
    const info = this.platform.getSystemInfo();
    const hudTop = this.hudTop();
    const safeBottom = Math.max(14, info.safeArea.bottom + 10);

    if (x >= 16 && x <= 62 && y >= hudTop + 6 && y <= hudTop + 54) {
      this.showHome();
      return;
    }

    const skillWidth = 156;
    const skillHeight = 44;
    const skillY = info.height - safeBottom - 52;
    if (x >= info.width / 2 - skillWidth / 2 && x <= info.width / 2 + skillWidth / 2 && y >= skillY && y <= skillY + skillHeight) {
      void this.useRandomClear();
    }
  }

  private handleOnlineTap(x: number, y: number): void {
    const info = this.platform.getSystemInfo();
    const snap = this.online.snapshot();

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
        this.online.leaveRoom();
        this.showHome();
      }
      return;
    }

    if (this.joinPadOpen) {
      this.handleJoinPadTap(x, y);
      return;
    }

    const back = { x: 16, y: this.hudTop() + 5, width: 46, height: 46 };
    if (this.hit(x, y, back)) {
      if (snap.mode === 'playing') {
        this.exitConfirm = true;
        this.refreshHud();
      } else if (snap.mode === 'room') {
        this.online.leaveRoom();
      } else {
        this.showHome();
      }
      return;
    }

    if (snap.mode === 'lobby') {
      const layout = this.onlineLobbyLayout(info.width, info.height);
      if (this.hit(x, y, layout.theme)) {
        this.online.setTheme(snap.selectedTheme === 'kingdom' ? 'palace' : 'kingdom');
        return;
      }
      for (let i = 0; i < layout.skills.length; i++) if (this.hit(x, y, layout.skills[i])) {
        this.online.cycleSkill(i);
        return;
      }
      if (this.hit(x, y, layout.quick)) {
        this.online.quickMatch();
        this.platform.haptics.trigger('medium');
        return;
      }
      if (this.hit(x, y, layout.create)) {
        this.online.createRoom();
        this.platform.haptics.trigger('medium');
        return;
      }
      if (this.hit(x, y, layout.join)) {
        this.joinPadOpen = true;
        this.joinCode = '';
        this.platform.haptics.trigger('light');
        this.refreshHud();
      }
      return;
    }

    if (snap.mode === 'matching') {
      const cancel = this.matchingCancelRect(info.width, info.height);
      if (this.hit(x, y, cancel)) this.online.cancelMatch();
      return;
    }

    if (snap.mode === 'room') {
      const room = snap.state.room;
      const me = room?.players.find(player => player.id === snap.state.playerId);
      const ready = { x: 48, y: info.height - Math.max(18, info.safeArea.bottom + 14) - 62, width: info.width - 96, height: 48 };
      if (this.hit(x, y, ready) && me) this.online.toggleReady();
      return;
    }

    if (snap.mode === 'playing') {
      const me = snap.me;
      if (!me) return;
      const skillRects = this.duelSkillRects(info.width, info.height);
      for (let i = 0; i < skillRects.length; i++) {
        if (!this.hit(x, y, skillRects[i])) continue;
        const skillId = me.loadout[i];
        const result = this.online.castSkill(skillId);
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
      const width = Math.min(282, info.width - 42);
      const x0 = (info.width - width) / 2;
      const y0 = info.height * 0.6;
      const rematch = { x: x0, y: y0, width, height: 48 };
      const home = { x: x0, y: y0 + 58, width, height: 42 };
      if (this.hit(x, y, rematch)) this.online.setRematchReady();
      else if (this.hit(x, y, home)) {
        this.online.leaveRoom();
        this.showHome();
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
      this.online.joinRoom(this.joinCode);
      this.platform.haptics.trigger('medium');
      this.refreshHud();
    }
  }

  private persistRecord(): void {
    if (this.mode !== 'solo') return;
    const bestKey = `doublefight-best-${this.currentTheme}`;
    const highestKey = `doublefight-highest-${this.currentTheme}`;
    const previousBest = Number(this.platform.storage.getItem(bestKey) ?? 0);
    const previousHighest = Number(this.platform.storage.getItem(highestKey) ?? 2);
    if (this.score > previousBest) this.platform.storage.setItem(bestKey, String(this.score));
    if (this.highest > previousHighest) this.platform.storage.setItem(highestKey, String(this.highest));
  }

  private resize(): void {
    const info = this.platform.getSystemInfo();
    const width = Math.max(1, info.width);
    const height = Math.max(1, info.height);
    const dpr = Math.min(1.65, Math.max(1, info.pixelRatio));
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
    this.online.local.root.visible = true;
    this.online.remote.root.visible = true;
  }

  private renderDuelBoard(role: 'local' | 'remote', bottom: number, width: number, height: number): void {
    this.online.local.root.visible = role === 'local';
    this.online.remote.root.visible = role === 'remote';
    const board = role === 'local' ? this.online.local : this.online.remote;
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
    this.renderer.setClearColor(board.presentation.sky, 1);
    this.scene.fog = new THREE.Fog(board.presentation.fog, 20, 48);
    this.renderer.clear(true, true, false);
    this.renderer.render(this.scene, this.duelCamera);
  }

  private applyThemeLook(): void {
    const presentation = this.boardView.presentation;
    this.scene.background = new THREE.Color(presentation.sky);
    const distance = this.cameraHome.length() || 24;
    this.scene.fog = new THREE.Fog(presentation.fog, distance + 8, distance + 28);
    this.renderer.toneMappingExposure = presentation.exposure;
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
  }

  private refreshHud(): void {
    const info = this.platform.getSystemInfo();
    const width = Math.max(1, Math.round(info.width));
    const height = Math.max(1, Math.round(info.height));
    const scale = Math.min(2, Math.max(1, info.pixelRatio));
    this.uiCanvas.width = Math.round(width * scale);
    this.uiCanvas.height = Math.round(height * scale);

    const ctx = this.uiContext;
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    ctx.clearRect(0, 0, width, height);

    if (this.mode === 'home') this.drawHomeHud(ctx, width, height, info.safeArea.bottom);
    else if (this.mode === 'solo') this.drawSoloHud(ctx, width, height);
    else this.drawOnlineHud(ctx, width, height);

    if (this.notice) this.drawNotice(ctx, width, height, this.notice.text);
    if (this.exitConfirm) this.drawExitConfirm(ctx, width, height);
    if (this.joinPadOpen) this.drawJoinPad(ctx, width, height);
    this.uiTexture.needsUpdate = true;
  }

  private drawHomeHud(ctx: CanvasRenderingContext2D, width: number, height: number, safeBottomInset: number): void {
    const info = this.platform.getSystemInfo();
    const titleTop = this.hudTop();
    const layout = this.homeLayout(width, height, safeBottomInset);
    const themeMeta = THEMES[this.currentTheme];
    const best = Number(this.platform.storage.getItem(`doublefight-best-${this.currentTheme}`) ?? 0);
    const highest = Number(this.platform.storage.getItem(`doublefight-highest-${this.currentTheme}`) ?? 2);

    ctx.textBaseline = 'middle';
    ctx.textAlign = 'center';

    const brandGradient = ctx.createLinearGradient(0, titleTop, 0, titleTop + 58);
    brandGradient.addColorStop(0, '#fff6d7');
    brandGradient.addColorStop(1, '#efc969');
    ctx.fillStyle = brandGradient;
    ctx.shadowColor = 'rgba(13, 24, 31, .55)';
    ctx.shadowBlur = 16;
    ctx.font = '900 32px sans-serif';
    ctx.fillText('双数对决', width / 2, titleTop + 25);
    ctx.shadowBlur = 0;
    ctx.fillStyle = 'rgba(236,244,242,.78)';
    ctx.font = '750 10px sans-serif';
    ctx.fillText('DOUBLE FIGHT · 3D 2048', width / 2, titleTop + 50);

    const metaY = Math.max(titleTop + 72, height * 0.56);
    ctx.fillStyle = 'rgba(12, 28, 36, .72)';
    this.roundedRect(ctx, width / 2 - 112, metaY, 224, 74, 22);
    ctx.fill();

    ctx.fillStyle = '#ffe6a1';
    ctx.font = '900 18px sans-serif';
    ctx.fillText(themeMeta.label, width / 2, metaY + 22);
    ctx.fillStyle = '#c9d9d8';
    ctx.font = '700 9px sans-serif';
    ctx.fillText(themeMeta.subtitle, width / 2, metaY + 42);
    ctx.fillStyle = '#f6e9c5';
    ctx.font = '750 11px sans-serif';
    ctx.fillText(`最高 ${highest}   ·   BEST ${best.toLocaleString('zh-CN')}`, width / 2, metaY + 60);

    this.drawPillButton(ctx, layout.theme, '‹   切换主题   ›', 'secondary');
    this.drawPillButton(ctx, layout.solo, '进入世界', 'primary');
    this.drawPillButton(ctx, layout.online, '⚔  在线对决', 'secondary');

    ctx.fillStyle = 'rgba(255,255,255,.62)';
    ctx.font = '650 10px sans-serif';
    ctx.fillText('左右滑动切换世界', width / 2, layout.solo.y - 16);
  }

  private drawSoloHud(ctx: CanvasRenderingContext2D, width: number, height: number): void {
    const info = this.platform.getSystemInfo();
    const hudTop = this.hudTop();
    const safeBottom = Math.max(14, info.safeArea.bottom + 10);
    const edge = 16;

    ctx.textBaseline = 'middle';
    ctx.shadowColor = 'rgba(0,0,0,.28)';
    ctx.shadowBlur = 10;
    this.roundedRect(ctx, edge, hudTop, width - edge * 2, 58, 18);
    ctx.fillStyle = 'rgba(14, 34, 43, .80)';
    ctx.fill();

    ctx.shadowBlur = 0;
    ctx.fillStyle = '#ffe9ab';
    ctx.font = '900 24px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('‹', edge + 16, hudTop + 29);

    ctx.fillStyle = '#fff1c9';
    ctx.font = '900 18px sans-serif';
    ctx.fillText('双数对决', edge + 44, hudTop + 22);
    ctx.fillStyle = '#bcd0d1';
    ctx.font = '700 9px sans-serif';
    ctx.fillText('SOLO', edge + 44, hudTop + 42);

    ctx.textAlign = 'right';
    ctx.fillStyle = '#ffe58a';
    ctx.font = '900 25px sans-serif';
    ctx.fillText(this.score.toLocaleString('zh-CN'), width - edge - 16, hudTop + 22);
    ctx.fillStyle = '#d7e7e8';
    ctx.font = '700 10px sans-serif';
    ctx.fillText(`最高 ${this.highest}`, width - edge - 16, hudTop + 43);

    const skillWidth = 156;
    const skillY = height - safeBottom - 52;
    this.drawSkillButton(ctx, { x: width / 2 - skillWidth / 2, y: skillY, width: skillWidth, height: 44 }, '✦ 清块', `×${this.skillCharges}`, this.skillCharges > 0);

    ctx.fillStyle = 'rgba(255,255,255,.68)';
    ctx.font = '650 10px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('滑动合成 · 向 2048 进阶', width / 2, skillY - 13);
  }

  private drawOnlineHud(ctx: CanvasRenderingContext2D, width: number, height: number): void {
    const snap = this.online.snapshot();
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
      ctx.fillText(`已等待 ${elapsed.toFixed(1)}s  ·  队列 ${Math.max(1, snap.state.matchmaking.queueSize)} 人`, width / 2, height * 0.37 + 32);
      this.drawPillButton(ctx, this.matchingCancelRect(width, height), '取消匹配', 'secondary');
      return;
    }

    if (snap.mode === 'room') {
      const room = snap.state.room;
      ctx.textAlign = 'center';
      ctx.fillStyle = '#fff1c9';
      ctx.font = '900 22px sans-serif';
      ctx.fillText('好友房间', width / 2, this.hudTop() + 30);
      ctx.fillStyle = '#f0cf72';
      ctx.font = '900 30px monospace';
      ctx.fillText(room?.code ?? '------', width / 2, height * 0.36);

      const players = room?.players ?? [];
      players.forEach((player, index) => {
        const y = height * 0.44 + index * 58;
        const me = player.id === snap.state.playerId;
        ctx.fillStyle = me ? 'rgba(28,80,84,.82)' : 'rgba(20,42,52,.76)';
        this.roundedRect(ctx, 34, y, width - 68, 48, 16);
        ctx.fill();
        ctx.textAlign = 'left';
        ctx.fillStyle = '#fff1c9';
        ctx.font = '800 13px sans-serif';
        ctx.fillText(`${player.name}${me ? ' · 我' : ''}`, 50, y + 18);
        ctx.fillStyle = '#bcd0d1';
        ctx.font = '650 10px sans-serif';
        ctx.fillText(THEMES[player.theme].label, 50, y + 34);
        ctx.textAlign = 'right';
        ctx.fillStyle = player.ready ? '#8ff0c2' : '#d6dde0';
        ctx.fillText(player.ready ? '已准备' : '未准备', width - 50, y + 24);
      });

      const me = players.find(player => player.id === snap.state.playerId);
      const ready = { x: 48, y: height - Math.max(18, this.platform.getSystemInfo().safeArea.bottom + 14) - 62, width: width - 96, height: 48 };
      this.drawPillButton(ctx, ready, me?.ready ? '取消准备' : '准备', 'primary');
      return;
    }

    const layout = this.onlineLobbyLayout(width, height);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#fff1c9';
    ctx.font = '900 24px sans-serif';
    ctx.fillText('配置你的对决', width / 2, this.hudTop() + 30);
    ctx.fillStyle = '#b7c9cc';
    ctx.font = '700 10px sans-serif';
    ctx.fillText(snap.state.status === 'connected' ? '服务器已连接' : '正在连接服务器…', width / 2, this.hudTop() + 54);

    this.drawPillButton(ctx, layout.theme, `‹  ${THEMES[snap.selectedTheme].label}  ›`, 'secondary');

    ctx.fillStyle = '#d9e3e2';
    ctx.font = '700 10px sans-serif';
    ctx.fillText('点击技能卡可轮换', width / 2, layout.skills[0].y - 14);
    snap.loadout.forEach((skillId, index) => {
      const def = SKILL_DEFINITIONS[skillId];
      this.drawSkillButton(ctx, layout.skills[index], `${def.icon} ${def.shortLabel}`, `${def.cost}⚡`, true);
    });

    this.drawPillButton(ctx, layout.quick, '⚔  开始匹配', 'primary');
    this.drawPillButton(ctx, layout.create, '创建好友房', 'secondary');
    this.drawPillButton(ctx, layout.join, '加入好友房', 'secondary');

    if (snap.state.lastError) {
      ctx.fillStyle = '#ffb8ae';
      ctx.font = '700 10px sans-serif';
      ctx.fillText(snap.state.lastError, width / 2, layout.quick.y - 18);
    }
  }

  private drawDuelHud(ctx: CanvasRenderingContext2D, width: number, height: number, me: MatchPlayerState | null, opponent: MatchPlayerState | null): void {
    const top = this.hudTop();
    this.drawBack(ctx);

    const timerMs = this.online.remainingMs();
    const seconds = Math.ceil(timerMs / 1000);
    const timer = `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;

    ctx.textAlign = 'center';
    ctx.fillStyle = '#fff2cc';
    ctx.font = '900 17px sans-serif';
    ctx.fillText(timer, width / 2, top + 28);

    ctx.textAlign = 'left';
    ctx.fillStyle = '#e3efee';
    ctx.font = '800 11px sans-serif';
    ctx.fillText(me?.name ?? '我', 20, top + 66);
    ctx.fillStyle = '#ffe58a';
    ctx.font = '900 22px sans-serif';
    ctx.fillText(this.online.controller.predictedScore.toLocaleString('zh-CN'), 20, top + 89);

    ctx.textAlign = 'right';
    ctx.fillStyle = '#e3efee';
    ctx.font = '800 11px sans-serif';
    ctx.fillText(opponent?.name ?? '对手', width - 20, top + 66);
    ctx.fillStyle = '#ffe58a';
    ctx.font = '900 22px sans-serif';
    ctx.fillText((opponent?.board.score ?? 0).toLocaleString('zh-CN'), width - 20, top + 89);

    const remoteEnergy = opponent ? opponent.energy / Math.max(1, opponent.maxEnergy) : 0;
    const remoteBar = { x: width / 2 - 74, y: top + 104, width: 148, height: 5 };
    this.drawEnergyBar(ctx, remoteBar, remoteEnergy, '#c870db');
    ctx.fillStyle = '#dce8e8';
    ctx.font = '650 9px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`对手 ⚡ ${opponent?.energy ?? 0}`, width / 2, top + 119);

    const safeBottom = Math.max(14, this.platform.getSystemInfo().safeArea.bottom + 10);
    const energyY = height - safeBottom - 106;
    const localRatio = me ? me.energy / Math.max(1, me.maxEnergy) : 0;
    this.drawEnergyBar(ctx, { x: 28, y: energyY, width: width - 56, height: 8 }, localRatio, '#4fd4c8');
    ctx.fillStyle = '#fff0c8';
    ctx.font = '800 10px sans-serif';
    ctx.fillText(`⚡ ${me?.energy ?? 0} / ${me?.maxEnergy ?? 100}`, width / 2, energyY - 10);

    const rects = this.duelSkillRects(width, height);
    me?.loadout.forEach((skillId, index) => {
      const def = SKILL_DEFINITIONS[skillId];
      const remaining = Math.max(0, (me.skillCooldowns[skillId] ?? 0) - this.online.serverNow());
      const ready = remaining <= 0 && me.energy >= def.cost;
      this.drawSkillButton(ctx, rects[index], `${def.icon} ${def.shortLabel}`, remaining > 0 ? `${(remaining / 1000).toFixed(1)}s` : `${def.cost}⚡`, ready);
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
    const snap = this.online.snapshot();
    const match = snap.state.match;
    if (!match) return;
    const won = match.winnerId === snap.state.playerId;
    const draw = match.winnerId === null;
    const panelWidth = Math.min(310, width - 34);
    const x = (width - panelWidth) / 2;
    const y = height * 0.26;
    const h = 300;

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

    const me = snap.me;
    const opponent = snap.opponent;
    ctx.fillStyle = '#f2f0e6';
    ctx.font = '900 24px sans-serif';
    ctx.fillText(`${me?.board.score ?? 0}   VS   ${opponent?.board.score ?? 0}`, width / 2, y + 92);
    ctx.fillStyle = '#b9cacc';
    ctx.font = '700 10px sans-serif';
    ctx.fillText(this.online.resultReason(), width / 2, y + 120);

    const rematch = { x: x + 20, y: y + 160, width: panelWidth - 40, height: 48 };
    const home = { x: x + 20, y: y + 218, width: panelWidth - 40, height: 42 };
    const roomMe = snap.state.room?.players.find(player => player.id === snap.state.playerId);
    this.drawPillButton(ctx, rematch, roomMe?.rematchReady ? '取消再来一局' : '再来一局', 'primary');
    this.drawPillButton(ctx, home, '返回大厅', 'secondary');

    const opponentRoom = snap.state.room?.players.find(player => player.id !== snap.state.playerId);
    if (roomMe?.rematchReady && opponentRoom) {
      ctx.fillStyle = '#b9cacc';
      ctx.font = '700 9px sans-serif';
      ctx.fillText(opponentRoom.rematchReady ? '双方已准备…' : '等待对手…', width / 2, y + 278);
    }
  }

  private drawJoinPad(ctx: CanvasRenderingContext2D, width: number, height: number): void {
    const pad = this.joinPadLayout(width, height);
    ctx.fillStyle = 'rgba(5,14,20,.94)';
    ctx.fillRect(0, 0, width, height);

    const panel = { x: 24, y: pad.close.y - 34, width: width - 48, height: pad.join.y + pad.join.height - (pad.close.y - 34) + 18 };
    ctx.fillStyle = 'rgba(19,38,47,.96)';
    this.roundedRect(ctx, panel.x, panel.y, panel.width, panel.height, 26);
    ctx.fill();

    ctx.textAlign = 'center';
    ctx.fillStyle = '#fff1c9';
    ctx.font = '900 20px sans-serif';
    ctx.fillText('加入好友房', width / 2, panel.y + 34);
    ctx.fillStyle = '#f2d77e';
    ctx.font = '900 30px monospace';
    ctx.fillText((this.joinCode + '······').slice(0, 6).split('').join(' '), width / 2, panel.y + 78);

    for (const entry of pad.keys) this.drawPillButton(ctx, entry.rect, entry.key, 'secondary');
    this.drawPillButton(ctx, pad.join, this.joinCode.length === 6 ? '加入房间' : '输入 6 位房号', this.joinCode.length === 6 ? 'primary' : 'secondary');

    ctx.fillStyle = '#b9c9cb';
    ctx.font = '700 11px sans-serif';
    ctx.fillText('取消', pad.close.x + pad.close.width / 2, pad.close.y + pad.close.height / 2);
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
    ctx.textAlign = 'left';
    ctx.fillStyle = '#ffe9ab';
    ctx.font = '900 28px sans-serif';
    ctx.fillText('‹', 27, top + 28);
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

  private drawSkillButton(ctx: CanvasRenderingContext2D, rect: Rect, label: string, meta: string, ready: boolean): void {
    this.roundedRect(ctx, rect.x, rect.y, rect.width, rect.height, Math.min(16, rect.height / 2));
    ctx.fillStyle = ready ? 'rgba(24,86,95,.92)' : 'rgba(45,55,60,.78)';
    ctx.fill();
    ctx.strokeStyle = ready ? '#f1ce6a' : '#718084';
    ctx.lineWidth = 1.2;
    ctx.stroke();
    ctx.textAlign = 'center';
    ctx.fillStyle = ready ? '#fff0b6' : '#aeb9ba';
    ctx.font = '800 11px sans-serif';
    ctx.fillText(label, rect.x + rect.width / 2, rect.y + rect.height * 0.4);
    ctx.font = '700 9px sans-serif';
    ctx.fillText(meta, rect.x + rect.width / 2, rect.y + rect.height * 0.72);
  }

  private drawPillButton(ctx: CanvasRenderingContext2D, rect: Rect, label: string, kind: 'primary' | 'secondary'): void {
    this.roundedRect(ctx, rect.x, rect.y, rect.width, rect.height, rect.height / 2);
    const gradient = ctx.createLinearGradient(rect.x, rect.y, rect.x + rect.width, rect.y);
    if (kind === 'primary') {
      gradient.addColorStop(0, '#f2cf70');
      gradient.addColorStop(1, '#e49d55');
      ctx.shadowColor = 'rgba(236,171,74,.38)';
      ctx.shadowBlur = 14;
    } else {
      gradient.addColorStop(0, 'rgba(18,54,64,.94)');
      gradient.addColorStop(1, 'rgba(28,64,77,.94)');
      ctx.shadowColor = 'rgba(0,0,0,.22)';
      ctx.shadowBlur = 8;
    }
    ctx.fillStyle = gradient;
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = kind === 'primary' ? '#ffe7a1' : 'rgba(255,230,161,.52)';
    ctx.lineWidth = 1.2;
    ctx.stroke();
    ctx.fillStyle = kind === 'primary' ? '#442d1c' : '#fff0c4';
    ctx.font = kind === 'primary' ? '900 16px sans-serif' : '800 13px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(label, rect.x + rect.width / 2, rect.y + rect.height / 2 + 0.5);
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

  private hudTop(): number {
    const info = this.platform.getSystemInfo();
    return Math.max(Math.max(12, info.safeArea.top + 8), (info.menuButton?.bottom ?? 0) + 8);
  }

  private homeLayout(width: number, height: number, safeBottomInset: number) {
    const safeBottom = Math.max(16, safeBottomInset + 12);
    const primaryWidth = Math.min(252, width - 48);
    const secondaryWidth = Math.min(226, width - 64);
    const soloY = height - safeBottom - 122;
    return {
      theme: { x: width / 2 - 72, y: soloY - 54, width: 144, height: 34 },
      solo: { x: width / 2 - primaryWidth / 2, y: soloY, width: primaryWidth, height: 50 },
      online: { x: width / 2 - secondaryWidth / 2, y: soloY + 60, width: secondaryWidth, height: 44 },
    };
  }

  private onlineLobbyLayout(width: number, height: number) {
    const top = this.hudTop();
    const skillWidth = (width - 56) / 3;
    const skillY = top + 190;
    const quickY = height - 210;
    return {
      theme: { x: width / 2 - 92, y: top + 92, width: 184, height: 40 },
      skills: [0, 1, 2].map(index => ({ x: 16 + index * (skillWidth + 12), y: skillY, width: skillWidth, height: 58 })),
      quick: { x: 34, y: quickY, width: width - 68, height: 52 },
      create: { x: 34, y: quickY + 64, width: (width - 78) / 2, height: 42 },
      join: { x: 44 + (width - 78) / 2, y: quickY + 64, width: (width - 78) / 2, height: 42 },
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
    const keySize = Math.min(62, (width - 100) / 3);
    const gap = 12;
    const startX = (width - (keySize * 3 + gap * 2)) / 2;
    const startY = height * 0.38;
    const labels = ['1','2','3','4','5','6','7','8','9','⌫','0'];
    const keys = labels.map((key, index) => {
      const row = Math.floor(index / 3);
      const col = index % 3;
      return { key, rect: { x: startX + col * (keySize + gap), y: startY + row * (keySize + 10), width: keySize, height: keySize } };
    });
    return {
      keys,
      close: { x: width / 2 - 50, y: startY - 48, width: 100, height: 30 },
      join: { x: width / 2 - 110, y: startY + 4 * (keySize + 10) + 4, width: 220, height: 46 },
    };
  }

  private hit(x: number, y: number, rect: Rect): boolean {
    return x >= rect.x && x <= rect.x + rect.width && y >= rect.y && y <= rect.y + rect.height;
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
