import * as THREE from 'three';
import type { BoardTile, Direction, MoveResult } from '../game/board/types';
import { ART } from '../config/artDirection';
import type { ThemeId } from '../config/themes';
import { BattleBoardView } from './battle/BattleBoardView';
import { BattleFeedback } from '../battle/BattleFeedback';
import { PerformanceManager, type QualityLevel } from '../performance/PerformanceManager';

/** Solo viewport and camera only; all board presentation belongs to BattleBoardView. */
export class GameScene {
  readonly canvas: HTMLCanvasElement;
  readonly boardView: BattleBoardView;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(48, 1, 0.1, 100);
  private readonly renderer: THREE.WebGLRenderer;
  private readonly clock = new THREE.Clock();
  private readonly cameraHome = new THREE.Vector3(0.35, 14.5, 17.4);
  private readonly cameraTarget = new THREE.Vector3(0, 0.42, 0.15);
  private readonly cameraScratch = new THREE.Vector3();
  private readonly towardScratch = new THREE.Vector3();
  private readonly performance: PerformanceManager;
  private readonly debugElement: HTMLElement | undefined;
  private disposed = false;
  private homeMode = false;
  private raf = 0;

  constructor(container: HTMLElement) {
    this.scene.background = new THREE.Color(ART.colors.sky);
    this.scene.fog = new THREE.Fog(ART.colors.skyFog, 18, 39);

    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: false,
      powerPreference: 'high-performance',
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.03;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.domElement.className = 'game-canvas';
    container.appendChild(this.renderer.domElement);
    this.canvas = this.renderer.domElement;

    if (new URLSearchParams(window.location.search).get('debug') === '1') {
      const debug = document.createElement('pre');
      debug.className = 'perf-debug';
      container.appendChild(debug);
      this.debugElement = debug;
    }

    this.boardView = new BattleBoardView('kingdom', 'full', new BattleFeedback(), undefined, this.isMobileLike());
    this.scene.add(this.boardView.root);

    this.performance = new PerformanceManager(
      this.renderer,
      (dpr) => this.applyPixelRatio(dpr),
      (quality) => this.applyQuality(quality),
      this.debugElement,
    );

    this.configureLighting();
    this.resize();
    this.prewarmTheme('kingdom');
    window.addEventListener('resize', this.resize);
    window.addEventListener('orientationchange', this.resize);
    this.animate();
  }


  get theme(): ThemeId { return this.boardView.theme; }
  setHomeMode(enabled: boolean): void {
    this.homeMode = enabled; this.boardView.root.visible = !enabled; this.boardView.clearGesture();
  }
  prewarmTheme(theme: ThemeId): void { this.boardView.prewarmTheme(theme); }
  setTheme(theme: ThemeId, tiles: BoardTile[]): void {
    this.boardView.setTheme(theme);
    this.boardView.reset(tiles);
    const presentation = this.boardView.presentation;
    this.scene.background = new THREE.Color(presentation.sky);
    this.scene.fog = new THREE.Fog(presentation.fog, 18, 39);
    this.renderer.toneMappingExposure = presentation.exposure;
    this.prewarmTheme(theme);
  }
  reset(tiles: BoardTile[]): void { this.boardView.reset(tiles); }
  setGesture(dx: number, dy: number): void { this.boardView.setGesture(dx, dy); }
  clearGesture(): void { this.boardView.clearGesture(); }
  commitDirection(direction: Direction): void { this.boardView.commitDirection(direction); }
  rejectDirection(direction: Direction): void { this.boardView.rejectDirection(direction); }
  applyMove(result: MoveResult): Promise<void> { return this.boardView.applyMove(result); }
  applyClearSkill(tiles: BoardTile[]): Promise<void> { return this.boardView.applyClearSkill(tiles); }
  dispose(): void {
    this.disposed = true; cancelAnimationFrame(this.raf);
    window.removeEventListener('resize', this.resize); window.removeEventListener('orientationchange', this.resize);
    this.boardView.dispose(); this.renderer.dispose(); this.canvas.remove(); this.debugElement?.remove();
  }
  private configureLighting(): void {
    this.scene.add(new THREE.HemisphereLight(0xdff5ff, 0x496f36, 1.72));

    const sun = new THREE.DirectionalLight(0xffd9a0, 3.25);
    sun.position.set(-7, 14, 9);
    sun.castShadow = true;
    const mobile = this.isMobileLike();
    const shadowSize = mobile ? 768 : 1536;
    sun.shadow.mapSize.set(shadowSize, shadowSize);
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


  private readonly resize = (): void => {
    const width = Math.max(1, window.innerWidth);
    const height = Math.max(1, window.innerHeight);
    const ratio = width / height;
    this.renderer.setSize(width, height);
    this.camera.aspect = ratio;

    if (ratio < 0.58) {
      this.camera.fov = 50;
      this.cameraHome.set(0.28, 14.35, 17.35);
      this.cameraTarget.set(0, 0.48, 0.02);
    } else if (ratio < 0.82) {
      this.camera.fov = 46;
      this.cameraHome.set(0.55, 13.1, 15.85);
      this.cameraTarget.set(0, 0.5, 0.08);
    } else {
      this.camera.fov = 39;
      this.cameraHome.set(1.8, 11.7, 14.2);
      this.cameraTarget.set(0, 0.52, 0.12);
    }

    this.camera.position.copy(this.cameraHome);
    this.camera.lookAt(this.cameraTarget);
    this.camera.updateProjectionMatrix();
  };


  private animate = (): void => {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(this.animate);
    const delta = Math.min(0.033, this.clock.getDelta());
    if (!this.homeMode) this.boardView.update(delta);
    const home = this.cameraScratch.copy(this.cameraHome);
    if (this.boardView.cameraPunch > 0.002) {
      const towardTarget = this.towardScratch.copy(this.cameraTarget).sub(home).normalize();
      home.addScaledVector(towardTarget, this.boardView.cameraPunch);
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
    this.renderer.render(this.scene, this.camera);
    this.performance.frame(delta);
  };


  private applyPixelRatio(dpr: number): void {
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(Math.max(1, window.innerWidth), Math.max(1, window.innerHeight), false);
  }

  private applyQuality(quality: QualityLevel): void {
    this.boardView.setQuality(quality);
    // Keep the gameplay image crisp; reduce expensive shadow updates before reducing canvas resolution further.
    this.renderer.shadowMap.autoUpdate = quality !== 'low';
    if (quality === 'low') this.renderer.shadowMap.needsUpdate = true;
  }

  private isMobileLike(): boolean {
    return window.innerWidth < 760 || window.matchMedia('(pointer: coarse)').matches;
  }


}
