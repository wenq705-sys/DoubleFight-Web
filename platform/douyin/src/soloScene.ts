import * as THREE from 'three';
import { ART } from '../../../src/config/artDirection';
import { THEMES, type ThemeId } from '../../../src/config/themes';
import { SoloController } from '../../../src/battle/SoloController';
import { BattleBoardView } from '../../../src/rendering/battle/BattleBoardView';
import { setTextureCanvasFactory } from '../../../src/rendering/TextureCanvasFactory';
import type { DouyinPlatform } from '../../../src/platform/douyin/DouyinPlatform';
import type { DouyinCanvas } from './api';
import type { BoardTile, Direction } from '../../../shared/index';

type ProductMode = 'home' | 'solo';

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

  private inputLocked = false;
  private skillCharges = 3;
  private currentTheme: ThemeId;
  private mode: ProductMode = 'home';
  private disposed = false;
  private visualTime = 0;
  private notice: { text: string; until: number } | null = null;

  constructor(
    private readonly platform: DouyinPlatform,
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
    this.scene.add(this.boardView.root);

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
    this.refreshHud();
  }

  get theme(): ThemeId { return this.currentTheme; }
  get currentMode(): ProductMode { return this.mode; }
  get score(): number { return this.controller.board.score; }
  get highest(): number {
    return Math.max(2, ...this.controller.board.tiles().map(tile => tile.value));
  }

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
    else this.handleSoloTap(x, y);
  }

  setTheme(theme: ThemeId): void {
    if (theme === this.currentTheme) return;
    this.currentTheme = theme;
    this.platform.storage.setItem('doublefight-theme', theme);
    this.boardView.setTheme(theme);
    this.boardView.prewarmTheme(theme);
    if (this.mode === 'home') this.boardView.reset(HOME_TILES);
    this.applyThemeLook();
    this.refreshHud();
  }

  render(): void {
    if (this.disposed) return;
    const delta = Math.min(0.033, this.clock.getDelta());
    this.visualTime += delta;
    this.boardView.update(delta);

    const home = this.cameraScratch.copy(this.cameraHome);
    if (this.mode === 'home') {
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

    if (this.notice && this.visualTime >= this.notice.until) {
      this.notice = null;
      this.refreshHud();
    }

    this.renderer.clear();
    this.renderer.render(this.scene, this.camera);
    this.renderer.clearDepth();
    this.renderer.render(this.uiScene, this.uiCamera);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
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
    this.controller.reset();
    this.configureCamera();
    this.platform.haptics.trigger('medium');
    this.refreshHud();
  }

  private showHome(): void {
    this.persistRecord();
    this.mode = 'home';
    this.inputLocked = false;
    this.notice = null;
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
    if (this.hit(x, y, layout.solo)) {
      this.startSolo();
      return;
    }
    if (this.hit(x, y, layout.online)) {
      this.notice = { text: '在线对决正在迁入抖音端', until: this.visualTime + 1.6 };
      this.platform.haptics.trigger('medium');
      this.refreshHud();
    }
  }

  private handleSoloTap(x: number, y: number): void {
    const info = this.platform.getSystemInfo();
    const safeTop = Math.max(12, info.safeArea.top + 8);
    const hudTop = Math.max(safeTop, (info.menuButton?.bottom ?? 0) + 8);
    const safeBottom = Math.max(14, info.safeArea.bottom + 10);

    if (x >= 16 && x <= 62 && y >= hudTop + 6 && y <= hudTop + 54) {
      this.showHome();
      return;
    }

    const skillWidth = 156;
    const skillHeight = 44;
    const skillY = info.height - safeBottom - 52;
    if (
      x >= info.width / 2 - skillWidth / 2
      && x <= info.width / 2 + skillWidth / 2
      && y >= skillY
      && y <= skillY + skillHeight
    ) {
      void this.useRandomClear();
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
    this.cameraTarget.set(0, this.mode === 'home' ? 0.82 : 0.6, ART.board.centerZ + (this.mode === 'home' ? 0.25 : 0));
    const baseDistance = Math.max(20, 5.5 / (Math.tan(THREE.MathUtils.degToRad(21)) * ratio));
    const distance = baseDistance * (this.mode === 'home' ? 1.12 : 1);
    this.cameraHome.copy(this.cameraTarget).add(
      new THREE.Vector3(0, this.mode === 'home' ? 0.94 : 0.88, this.mode === 'home' ? 0.52 : 0.475).multiplyScalar(distance),
    );
    this.camera.position.copy(this.cameraHome);
    this.camera.lookAt(this.cameraTarget);
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
    const logicalWidth = Math.max(1, Math.round(info.width));
    const logicalHeight = Math.max(1, Math.round(info.height));
    const scale = Math.min(2, Math.max(1, info.pixelRatio));
    this.uiCanvas.width = Math.round(logicalWidth * scale);
    this.uiCanvas.height = Math.round(logicalHeight * scale);

    const ctx = this.uiContext;
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    ctx.clearRect(0, 0, logicalWidth, logicalHeight);

    if (this.mode === 'home') this.drawHomeHud(ctx, logicalWidth, logicalHeight, info.safeArea.bottom);
    else this.drawSoloHud(ctx, logicalWidth, logicalHeight, info.safeArea.top, info.safeArea.bottom, info.menuButton?.bottom ?? 0);

    if (this.notice) this.drawNotice(ctx, logicalWidth, logicalHeight, this.notice.text);
    this.uiTexture.needsUpdate = true;
  }

  private drawHomeHud(ctx: CanvasRenderingContext2D, width: number, height: number, safeBottomInset: number): void {
    const info = this.platform.getSystemInfo();
    const safeTop = Math.max(16, info.safeArea.top + 10);
    const menuBottom = info.menuButton?.bottom ?? 0;
    const titleTop = Math.max(safeTop, menuBottom + 8);
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

  private drawSoloHud(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    safeTopInset: number,
    safeBottomInset: number,
    menuBottom: number,
  ): void {
    const safeTop = Math.max(12, safeTopInset + 8);
    const hudTop = Math.max(safeTop, menuBottom + 8);
    const safeBottom = Math.max(14, safeBottomInset + 10);
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
    const skill = { x: width / 2 - skillWidth / 2, y: skillY, width: skillWidth, height: 44 };
    this.roundedRect(ctx, skill.x, skill.y, skill.width, skill.height, 18);
    const skillGradient = ctx.createLinearGradient(skill.x, skill.y, skill.x + skill.width, skill.y);
    if (this.skillCharges > 0) {
      skillGradient.addColorStop(0, '#1f6f73');
      skillGradient.addColorStop(1, '#2b576f');
    } else {
      skillGradient.addColorStop(0, '#414a4d');
      skillGradient.addColorStop(1, '#30383b');
    }
    ctx.fillStyle = skillGradient;
    ctx.fill();
    ctx.strokeStyle = this.skillCharges > 0 ? '#f1ce6a' : '#738184';
    ctx.lineWidth = 1.4;
    ctx.stroke();

    ctx.textAlign = 'center';
    ctx.fillStyle = this.skillCharges > 0 ? '#fff0b6' : '#aeb9ba';
    ctx.font = '850 14px sans-serif';
    ctx.fillText(`✦ 清块  ×${this.skillCharges}`, width / 2, skillY + 22);

    ctx.fillStyle = 'rgba(255,255,255,.68)';
    ctx.font = '650 10px sans-serif';
    ctx.fillText('滑动合成 · 向 2048 进阶', width / 2, skillY - 13);
  }

  private drawPillButton(
    ctx: CanvasRenderingContext2D,
    rect: { x: number; y: number; width: number; height: number },
    label: string,
    kind: 'primary' | 'secondary',
  ): void {
    this.roundedRect(ctx, rect.x, rect.y, rect.width, rect.height, rect.height / 2);
    const gradient = ctx.createLinearGradient(rect.x, rect.y, rect.x + rect.width, rect.y);
    if (kind === 'primary') {
      gradient.addColorStop(0, '#f2cf70');
      gradient.addColorStop(1, '#e49d55');
      ctx.shadowColor = 'rgba(236, 171, 74, .38)';
      ctx.shadowBlur = 14;
    } else {
      gradient.addColorStop(0, 'rgba(18, 54, 64, .92)');
      gradient.addColorStop(1, 'rgba(28, 64, 77, .92)');
      ctx.shadowColor = 'rgba(0, 0, 0, .22)';
      ctx.shadowBlur = 8;
    }
    ctx.fillStyle = gradient;
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = kind === 'primary' ? '#ffe7a1' : 'rgba(255,230,161,.55)';
    ctx.lineWidth = 1.2;
    ctx.stroke();
    ctx.fillStyle = kind === 'primary' ? '#442d1c' : '#fff0c4';
    ctx.font = kind === 'primary' ? '900 16px sans-serif' : '800 14px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(label, rect.x + rect.width / 2, rect.y + rect.height / 2 + 0.5);
  }

  private drawNotice(ctx: CanvasRenderingContext2D, width: number, height: number, text: string): void {
    const rectWidth = Math.min(260, width - 32);
    const y = height * 0.46;
    this.roundedRect(ctx, width / 2 - rectWidth / 2, y, rectWidth, 42, 18);
    ctx.fillStyle = 'rgba(9, 22, 29, .88)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,226,151,.45)';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = '#fff0c7';
    ctx.font = '750 12px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(text, width / 2, y + 21);
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

  private hit(x: number, y: number, rect: { x: number; y: number; width: number; height: number }): boolean {
    return x >= rect.x && x <= rect.x + rect.width && y >= rect.y && y <= rect.y + rect.height;
  }

  private roundedRect(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    width: number,
    height: number,
    radius: number,
  ): void {
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
