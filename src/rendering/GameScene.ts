import * as THREE from 'three';
import type { BoardTile, Direction, MoveResult } from '../game/board/types';
import { ART } from '../config/artDirection';
import type { ThemeId } from '../config/themes';
import { KingdomEnvironment } from './environment/KingdomEnvironment';
import { PalaceEnvironment } from './environment/PalaceEnvironment';
import { TileFactory, type TileVisual } from './tiles/TileFactory';
import { PalaceTileFactory } from './tiles/PalaceTileFactory';
import { Effects } from './vfx/Effects';
import { PerformanceManager, type QualityLevel } from '../performance/PerformanceManager';

type Tween = {
  elapsed: number;
  duration: number;
  update: (t: number) => void;
  complete?: () => void;
};

type TileInstance = TileVisual & { value: number };
type ThemeEnvironment = KingdomEnvironment | PalaceEnvironment;
type ThemeTileFactory = TileFactory | PalaceTileFactory;

export class GameScene {
  readonly canvas: HTMLCanvasElement;

  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(48, 1, 0.1, 100);
  private readonly renderer: THREE.WebGLRenderer;
  private readonly world = new THREE.Group();
  private readonly tileLayer = new THREE.Group();
  private readonly effects: Effects;
  private readonly tiles = new Map<number, TileInstance>();
  private readonly tweens: Tween[] = [];
  private readonly clock = new THREE.Clock();
  private readonly cameraHome = new THREE.Vector3(0.35, 14.5, 17.4);
  private readonly cameraTarget = new THREE.Vector3(0, 0.42, 0.15);
  private readonly cameraScratch = new THREE.Vector3();
  private readonly towardScratch = new THREE.Vector3();
  private readonly dragTarget = new THREE.Vector2();
  private readonly dragCurrent = new THREE.Vector2();
  private readonly environments = new Map<ThemeId, ThemeEnvironment>();
  private readonly factories = new Map<ThemeId, ThemeTileFactory>();
  private readonly performance: PerformanceManager;
  private readonly debugElement: HTMLElement | undefined;

  private environment: ThemeEnvironment;
  private tileFactory: ThemeTileFactory;
  private currentTheme: ThemeId = 'kingdom';
  private cameraShake = 0;
  private cameraPunch = 0;
  private hitStopRemaining = 0;
  private visualTime = 0;
  private disposed = false;
  private homeMode = false;

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

    this.environment = this.getEnvironment('kingdom');
    this.tileFactory = this.getFactory('kingdom');

    this.scene.add(this.world);
    this.world.add(this.environment.root);
    this.world.add(this.tileLayer);
    this.effects = new Effects(this.world, this.isMobileLike());

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

  get theme(): ThemeId { return this.currentTheme; }

  setHomeMode(enabled: boolean): void {
    this.homeMode = enabled;
    this.world.visible = !enabled;
    this.clearGesture();
    this.effects.clearTransient();
  }

  prewarmTheme(theme: ThemeId): void {
    const factory = this.getFactory(theme);
    const run = () => factory.warmup([2, 4, 8, 16, 32, 64, 128]);
    if ('requestIdleCallback' in window) {
      window.requestIdleCallback(run, { timeout: 900 });
    } else {
      window.setTimeout(run, 80);
    }
  }

  setTheme(theme: ThemeId, tiles: BoardTile[]): void {
    if (theme === this.currentTheme) return;

    this.environment.root.removeFromParent();
    this.currentTheme = theme;
    this.environment = this.getEnvironment(theme);
    this.tileFactory = this.getFactory(theme);
    this.world.add(this.environment.root);
    this.tileLayer.removeFromParent();
    this.world.add(this.tileLayer);

    if (theme === 'palace') {
      this.scene.background = new THREE.Color(0xd89069);
      this.scene.fog = new THREE.Fog(0xe6bb93, 18, 38);
      this.renderer.toneMappingExposure = 1.0;
    } else {
      this.scene.background = new THREE.Color(ART.colors.sky);
      this.scene.fog = new THREE.Fog(ART.colors.skyFog, 18, 39);
      this.renderer.toneMappingExposure = 1.03;
    }

    this.reset(tiles);
    this.prewarmTheme(theme);
  }

  reset(tiles: BoardTile[]): void {
    this.tiles.forEach((tile) => tile.root.removeFromParent());
    this.tiles.clear();
    this.tweens.splice(0);
    this.effects.clearTransient();
    this.cameraShake = 0;
    this.cameraPunch = 0;
    this.hitStopRemaining = 0;
    this.clearGesture();
    tiles.forEach((tile) => this.addTile(tile, true));
  }

  setGesture(dx: number, dy: number): void {
    const magnitude = Math.min(1, Math.hypot(dx, dy) / 92);
    this.dragTarget.set(
      THREE.MathUtils.clamp(dx / 92, -1, 1) * magnitude,
      THREE.MathUtils.clamp(dy / 92, -1, 1) * magnitude,
    );
    this.environment.setGesture(dx, dy, magnitude);
  }

  clearGesture(): void {
    this.dragTarget.set(0, 0);
    this.environment.clearGesture();
  }

  commitDirection(direction: Direction): void {
    this.clearGesture();
    this.environment.pulseDirection(direction);
  }

  rejectDirection(direction: Direction): void {
    this.clearGesture();
    this.environment.pulseDirection(direction);
    this.cameraShake = Math.max(this.cameraShake, 0.02);
  }

  async applyMove(result: MoveResult): Promise<void> {
    if (!result.changed) return;

    const movements = result.motions.map(
      (motion) =>
        new Promise<void>((resolve) => {
          const visual = this.tiles.get(motion.id);
          if (!visual) {
            resolve();
            return;
          }
          const start = visual.root.position.clone();
          const target = this.cellPosition(motion.to.row, motion.to.col);
          const dx = target.x - start.x;
          const dz = target.z - start.z;
          this.tweens.push({
            elapsed: 0,
            duration: ART.motion.moveMs / 1000,
            update: (t) => {
              const drive = 1 - Math.pow(1 - t, 5);
              const arc = Math.sin(Math.PI * t);
              const settle = Math.sin(Math.PI * Math.min(1, t * 1.15));
              visual.root.position.lerpVectors(start, target, drive);
              visual.root.position.y += arc * 0.055;
              visual.root.rotation.x = dz * 0.018 * arc;
              visual.root.rotation.z = -dx * 0.018 * arc;
              visual.root.scale.set(
                1 + settle * 0.025,
                1 - settle * 0.045,
                1 + settle * 0.025,
              );
            },
            complete: () => {
              visual.root.position.copy(target);
              visual.root.rotation.set(0, 0, 0);
              visual.root.scale.setScalar(1);
              resolve();
            },
          });
        }),
    );

    await Promise.all(movements);

    result.merges.forEach((merge) => {
      this.removeTileVisual(merge.consumedId);
      this.removeTileVisual(merge.survivorId);

      const tile = {
        id: merge.survivorId,
        value: merge.value,
        row: merge.at.row,
        col: merge.at.col,
      };
      const visual = this.addTile(tile, false);
      const position = this.cellPosition(merge.at.row, merge.at.col);
      visual.root.scale.set(0.34, 0.18, 0.34);
      visual.root.position.y -= 0.1;

      this.effects.merge(position, merge.value, this.currentTheme);
      this.environment.impact(merge.value, position);
      this.mergeBounce(visual.root, merge.value);

      this.hitStopRemaining = Math.max(
        this.hitStopRemaining,
        merge.value >= 1024 ? 0.085 : merge.value >= 512 ? 0.068 : merge.value >= 128 ? 0.052 : ART.motion.hitStopMs / 1000,
      );
      this.cameraShake = Math.max(
        this.cameraShake,
        merge.value >= 1024 ? 0.27 : merge.value >= 512 ? 0.2 : merge.value >= 128 ? 0.12 : 0.058,
      );
      this.cameraPunch = Math.max(
        this.cameraPunch,
        merge.value >= 1024 ? 1.42 : merge.value >= 512 ? 1.0 : merge.value >= 128 ? 0.56 : 0.26,
      );
    });

    if (result.spawned) {
      this.addTile(result.spawned, true);
      this.effects.spawn(this.cellPosition(result.spawned.row, result.spawned.col), this.currentTheme);
    }
  }

  async applyClearSkill(removed: BoardTile[]): Promise<void> {
    if (removed.length === 0) return;

    const positions = removed.map((tile) => this.cellPosition(tile.row, tile.col));
    this.effects.skillClear(positions, this.currentTheme);

    if (this.environment instanceof PalaceEnvironment) {
      this.environment.skillPulse();
    } else {
      positions.forEach((position) => this.environment.impact(512, position));
    }

    this.hitStopRemaining = 0.055;
    this.cameraShake = Math.max(this.cameraShake, 0.24);
    this.cameraPunch = Math.max(this.cameraPunch, 1.15);

    const clears = removed.map((tile, index) =>
      new Promise<void>((resolve) => {
        const visual = this.tiles.get(tile.id);
        if (!visual) {
          resolve();
          return;
        }
        const startScale = visual.root.scale.clone();
        const baseY = visual.root.position.y;
        this.tweens.push({
          elapsed: -index * 0.045,
          duration: 0.42,
          update: (t) => {
            if (t <= 0) return;
            const pop = Math.sin(Math.PI * Math.min(1, t * 1.2));
            const vanish = Math.max(0.01, 1 - Math.pow(t, 1.7));
            visual.root.scale.copy(startScale).multiplyScalar(vanish * (1 + pop * 0.2));
            visual.root.position.y = baseY + t * 0.78;
            visual.root.rotation.y = t * Math.PI * 1.6;
            visual.root.rotation.z = Math.sin(t * Math.PI) * 0.18;
          },
          complete: () => {
            this.removeTileVisual(tile.id);
            resolve();
          },
        });
      }),
    );

    await Promise.all(clears);
  }

  dispose(): void {
    this.disposed = true;
    window.removeEventListener('resize', this.resize);
    window.removeEventListener('orientationchange', this.resize);
    this.effects.clearTransient();
    this.renderer.dispose();
  }

  private removeTileVisual(id: number): void {
    const visual = this.tiles.get(id);
    if (!visual) return;
    visual.root.removeFromParent();
    this.tiles.delete(id);
  }

  private addTile(tile: BoardTile, spawn: boolean): TileInstance {
    const visual = this.tileFactory.create(tile.value);
    const instance: TileInstance = { ...visual, value: tile.value };
    instance.root.position.copy(this.cellPosition(tile.row, tile.col));
    instance.root.name = `Tile-${tile.id}-${tile.value}`;
    this.tileLayer.add(instance.root);
    this.tiles.set(tile.id, instance);

    if (spawn) {
      instance.root.scale.setScalar(0.01);
      const y = instance.root.position.y;
      this.tweens.push({
        elapsed: 0,
        duration: ART.motion.spawnMs / 1000,
        update: (t) => {
          const scale = this.easeOutBack(t);
          instance.root.scale.setScalar(scale);
          instance.root.position.y = y + Math.sin(Math.PI * t) * 0.15;
          instance.root.rotation.y = (1 - t) * 0.1;
        },
        complete: () => {
          instance.root.scale.setScalar(1);
          instance.root.position.y = y;
          instance.root.rotation.y = 0;
        },
      });
    }
    return instance;
  }

  private mergeBounce(root: THREE.Group, value: number): void {
    const baseY = this.cellPosition(0, 0).y;
    const duration = value >= 512 ? 0.52 : ART.motion.mergeMs / 1000;
    const jump = value >= 1024 ? 0.7 : value >= 512 ? 0.52 : value >= 128 ? 0.37 : 0.28;

    this.tweens.push({
      elapsed: 0,
      duration,
      update: (t) => {
        if (t < 0.16) {
          const p = t / 0.16;
          root.scale.set(
            THREE.MathUtils.lerp(0.34, 1.34, p),
            THREE.MathUtils.lerp(0.18, 0.66, p),
            THREE.MathUtils.lerp(0.34, 1.34, p),
          );
        } else if (t < 0.4) {
          const p = (t - 0.16) / 0.24;
          root.scale.set(
            THREE.MathUtils.lerp(1.34, 0.9, p),
            THREE.MathUtils.lerp(0.66, 1.26, p),
            THREE.MathUtils.lerp(1.34, 0.9, p),
          );
        } else {
          const p = (t - 0.4) / 0.6;
          const spring = Math.sin(p * Math.PI * 3.4) * (1 - p);
          root.scale.set(1 + spring * 0.14, 1 - spring * 0.1, 1 + spring * 0.14);
        }
        root.position.y = baseY + Math.sin(Math.PI * t) * jump;
        root.rotation.y = Math.sin(Math.PI * t) * (value >= 512 ? 0.2 : 0.095);
      },
      complete: () => {
        root.scale.setScalar(1);
        root.position.y = baseY;
        root.rotation.y = 0;
      },
    });
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

  private cellPosition(row: number, col: number): THREE.Vector3 {
    return new THREE.Vector3(
      (col - 1.5) * ART.board.gap,
      0.57,
      (row - 1.5) * ART.board.gap + ART.board.centerZ,
    );
  }

  private getEnvironment(theme: ThemeId): ThemeEnvironment {
    const cached = this.environments.get(theme);
    if (cached) return cached;
    const created: ThemeEnvironment = theme === 'palace' ? new PalaceEnvironment() : new KingdomEnvironment();
    this.environments.set(theme, created);
    return created;
  }

  private getFactory(theme: ThemeId): ThemeTileFactory {
    const cached = this.factories.get(theme);
    if (cached) return cached;
    const created: ThemeTileFactory = theme === 'palace' ? new PalaceTileFactory() : new TileFactory();
    this.factories.set(theme, created);
    return created;
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
    requestAnimationFrame(this.animate);

    const delta = Math.min(0.033, this.clock.getDelta());
    let simulationDelta = delta;
    if (this.hitStopRemaining > 0) {
      this.hitStopRemaining -= delta;
      simulationDelta = 0;
    }
    this.visualTime += simulationDelta;

    const dragBlend = 1 - Math.exp(-delta * 19);
    this.dragCurrent.lerp(this.dragTarget, dragBlend);
    this.tileLayer.position.x = this.dragCurrent.x * 0.13;
    this.tileLayer.position.z = this.dragCurrent.y * 0.13;
    this.tileLayer.rotation.z = -this.dragCurrent.x * 0.018;
    this.tileLayer.rotation.x = this.dragCurrent.y * 0.014;

    if (simulationDelta > 0) {
      for (let i = this.tweens.length - 1; i >= 0; i -= 1) {
        const tween = this.tweens[i];
        if (tween.elapsed < 0) {
          tween.elapsed += simulationDelta;
          continue;
        }
        tween.elapsed += simulationDelta;
        const progress = Math.min(1, tween.elapsed / tween.duration);
        tween.update(progress);
        if (progress >= 1) {
          tween.complete?.();
          this.tweens.splice(i, 1);
        }
      }

      this.environment.update(this.visualTime, simulationDelta);
      this.effects.update(simulationDelta);
      this.tiles.forEach((tile, id) => {
        tile.animatedParts.forEach((part, index) => {
          part.rotation.y += simulationDelta * (0.42 + index * 0.14);
          part.rotation.z += Math.sin(this.visualTime * 1.45 + id + index) * 0.00034;
        });
      });
    }

    const home = this.cameraScratch.copy(this.cameraHome);
    if (this.cameraPunch > 0.002) {
      const towardTarget = this.towardScratch.copy(this.cameraTarget).sub(home).normalize();
      home.addScaledVector(towardTarget, this.cameraPunch);
      this.cameraPunch *= Math.pow(0.02, delta);
    }

    const shake = this.cameraShake;
    this.cameraShake *= Math.pow(0.015, delta);
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
    this.effects.setQuality(quality);
    // Keep the gameplay image crisp; reduce expensive shadow updates before reducing canvas resolution further.
    this.renderer.shadowMap.autoUpdate = quality !== 'low';
    if (quality === 'low') this.renderer.shadowMap.needsUpdate = true;
  }

  private isMobileLike(): boolean {
    return window.innerWidth < 760 || window.matchMedia('(pointer: coarse)').matches;
  }

  private easeOutBack(t: number): number {
    const c1 = 1.70158;
    const c3 = c1 + 1;
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
  }
}
