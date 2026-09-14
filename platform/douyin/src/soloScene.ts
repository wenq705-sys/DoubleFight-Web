import * as THREE from 'three';
import { ART } from '../../../src/config/artDirection';
import type { ThemeId } from '../../../src/config/themes';
import { SoloController } from '../../../src/battle/SoloController';
import { BattleBoardView } from '../../../src/rendering/battle/BattleBoardView';
import { setTextureCanvasFactory } from '../../../src/rendering/TextureCanvasFactory';
import type { DouyinPlatform } from '../../../src/platform/douyin/DouyinPlatform';
import type { DouyinCanvas } from './api';
import type { Direction } from '../../../shared/game/types';

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
  private disposed = false;

  constructor(
    private readonly platform: DouyinPlatform,
    screenCanvas: DouyinCanvas,
    context: WebGLRenderingContext,
    theme: ThemeId,
  ) {
    this.currentTheme = theme;

    // First tt.createCanvas() is the screen canvas. Every subsequent call is offscreen.
    setTextureCanvasFactory((width, height) => {
      const canvas = this.platform.createCanvas();
      canvas.width = width;
      canvas.height = height;
      return canvas as unknown as HTMLCanvasElement;
    });

    // Three.js expects browser-style canvas event hooks; Douyin Canvas does not always expose them.
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
    this.controller.reset();

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
    this.refreshHud();
  }

  get theme(): ThemeId { return this.currentTheme; }
  get score(): number { return this.controller.board.score; }
  get highest(): number {
    return Math.max(2, ...this.controller.board.tiles().map(tile => tile.value));
  }

  async move(direction: Direction): Promise<boolean> {
    if (this.disposed || this.inputLocked) return false;
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
    this.refreshHud();
    return true;
  }

  async useRandomClear(): Promise<boolean> {
    if (this.disposed || this.inputLocked || this.skillCharges <= 0) {
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
      this.refreshHud();
    }
    return true;
  }

  handleTap(x: number, y: number): void {
    if (this.disposed || this.inputLocked) return;
    const info = this.platform.getSystemInfo();
    const safeTop = Math.max(12, info.safeArea.top + 8);
    const safeBottom = Math.max(14, info.safeArea.bottom + 10);

    const themeWidth = 132;
    const themeY = safeTop + 68;
    if (
      x >= info.width / 2 - themeWidth / 2
      && x <= info.width / 2 + themeWidth / 2
      && y >= themeY
      && y <= themeY + 32
    ) {
      this.setTheme(this.currentTheme === 'kingdom' ? 'palace' : 'kingdom');
      this.platform.haptics.trigger('light');
      return;
    }

    const skillWidth = 150;
    const skillHeight = 42;
    const skillY = info.height - safeBottom - 50;
    if (
      x >= info.width / 2 - skillWidth / 2
      && x <= info.width / 2 + skillWidth / 2
      && y >= skillY
      && y <= skillY + skillHeight
    ) {
      void this.useRandomClear();
    }
  }

  setTheme(theme: ThemeId): void {
    if (theme === this.currentTheme) return;
    this.currentTheme = theme;
    this.platform.storage.setItem('doublefight-theme', theme);
    this.boardView.setTheme(theme);
    this.boardView.prewarmTheme(theme);
    this.applyThemeLook();
    this.refreshHud();
  }

  render(): void {
    if (this.disposed) return;
    const delta = Math.min(0.033, this.clock.getDelta());
    this.boardView.update(delta);

    const home = this.cameraScratch.copy(this.cameraHome);
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

  private resize(): void {
    const info = this.platform.getSystemInfo();
    const width = Math.max(1, info.width);
    const height = Math.max(1, info.height);
    const dpr = Math.min(1.65, Math.max(1, info.pixelRatio));
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(width, height, false);

    const ratio = width / height;
    this.camera.aspect = ratio;
    this.camera.fov = 42;
    this.cameraTarget.set(0, 0.6, ART.board.centerZ);
    const distance = Math.max(20, 5.5 / (Math.tan(THREE.MathUtils.degToRad(21)) * ratio));
    this.cameraHome.copy(this.cameraTarget).add(new THREE.Vector3(0, 0.88, 0.475).multiplyScalar(distance));
    this.camera.position.copy(this.cameraHome);
    this.camera.lookAt(this.cameraTarget);
    this.camera.updateProjectionMatrix();

    const aspect = width / height;
    this.uiCamera.left = -aspect;
    this.uiCamera.right = aspect;
    this.uiCamera.top = 1;
    this.uiCamera.bottom = -1;
    this.uiCamera.updateProjectionMatrix();
    this.uiPlane.scale.set(aspect, 1, 1);
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

    const safeTop = Math.max(12, info.safeArea.top + 8);
    const safeBottom = Math.max(14, info.safeArea.bottom + 10);
    const edge = 16;

    ctx.textBaseline = 'middle';
    ctx.shadowColor = 'rgba(0,0,0,.28)';
    ctx.shadowBlur = 10;

    this.roundedRect(ctx, edge, safeTop, logicalWidth - edge * 2, 58, 18);
    ctx.fillStyle = 'rgba(18, 38, 49, .78)';
    ctx.fill();

    ctx.shadowBlur = 0;
    ctx.fillStyle = '#fff1c9';
    ctx.font = '900 21px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('双数对决', edge + 16, safeTop + 23);
    ctx.fillStyle = '#c8dbe0';
    ctx.font = '700 10px sans-serif';
    ctx.fillText('DOUBLE FIGHT · SOLO', edge + 16, safeTop + 43);

    ctx.textAlign = 'right';
    ctx.fillStyle = '#ffe58a';
    ctx.font = '900 25px sans-serif';
    ctx.fillText(this.score.toLocaleString('zh-CN'), logicalWidth - edge - 16, safeTop + 23);
    ctx.fillStyle = '#d7e7e8';
    ctx.font = '700 10px sans-serif';
    ctx.fillText(`最高 ${this.highest}`, logicalWidth - edge - 16, safeTop + 43);

    const themeLabel = this.currentTheme === 'kingdom' ? '迷你王国' : '宫廷晋升';
    const pillWidth = 132;
    const pillY = safeTop + 68;
    this.roundedRect(ctx, logicalWidth / 2 - pillWidth / 2, pillY, pillWidth, 32, 16);
    ctx.fillStyle = 'rgba(255, 239, 189, .88)';
    ctx.fill();
    ctx.fillStyle = '#543825';
    ctx.font = '800 12px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`‹  ${themeLabel}  ›`, logicalWidth / 2, pillY + 16);

    const skillWidth = 150;
    const skillY = logicalHeight - safeBottom - 50;
    this.roundedRect(ctx, logicalWidth / 2 - skillWidth / 2, skillY, skillWidth, 42, 18);
    ctx.fillStyle = this.skillCharges > 0 ? 'rgba(24, 86, 95, .90)' : 'rgba(50, 60, 64, .70)';
    ctx.fill();
    ctx.strokeStyle = this.skillCharges > 0 ? '#ffe08a' : '#8b989a';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.fillStyle = this.skillCharges > 0 ? '#fff0b6' : '#aeb9ba';
    ctx.font = '850 14px sans-serif';
    ctx.fillText(`✦ 清块  ×${this.skillCharges}`, logicalWidth / 2, skillY + 21);

    ctx.fillStyle = 'rgba(255,255,255,.72)';
    ctx.font = '650 10px sans-serif';
    ctx.fillText('滑动合成 · 点击技能 · 向 2048 进阶', logicalWidth / 2, skillY - 12);

    this.uiTexture.needsUpdate = true;
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
