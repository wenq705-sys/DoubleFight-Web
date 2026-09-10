import * as THREE from 'three';
import type { BoardTile, MoveResult } from '../game/board/types';
import { ART } from '../config/artDirection';
import { KingdomEnvironment } from './environment/KingdomEnvironment';
import { TileFactory, type TileVisual } from './tiles/TileFactory';
import { Effects } from './vfx/Effects';

type Tween = {
  elapsed: number;
  duration: number;
  update: (t: number) => void;
  complete?: () => void;
};

type TileInstance = TileVisual & { value: number };

export class GameScene {
  readonly canvas: HTMLCanvasElement;

  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(48, 1, 0.1, 100);
  private readonly renderer: THREE.WebGLRenderer;
  private readonly world = new THREE.Group();
  private readonly tileLayer = new THREE.Group();
  private readonly environment = new KingdomEnvironment();
  private readonly tileFactory = new TileFactory();
  private readonly effects: Effects;
  private readonly tiles = new Map<number, TileInstance>();
  private readonly tweens: Tween[] = [];
  private readonly clock = new THREE.Clock();
  private readonly cameraHome = new THREE.Vector3(8.65, 11.2, 13.2);
  private readonly cameraTarget = new THREE.Vector3(0, 0.55, 0.65);
  private cameraShake = 0;
  private cameraPunch = 0;
  private hitStopRemaining = 0;
  private visualTime = 0;
  private disposed = false;

  constructor(container: HTMLElement) {
    this.scene.background = new THREE.Color(ART.colors.sky);
    this.scene.fog = new THREE.Fog(ART.colors.skyFog, 19, 42);

    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: false,
      powerPreference: 'high-performance',
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.06;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.domElement.className = 'game-canvas';
    container.appendChild(this.renderer.domElement);
    this.canvas = this.renderer.domElement;

    this.scene.add(this.world);
    this.world.add(this.environment.root);
    this.world.add(this.tileLayer);
    this.effects = new Effects(this.world);

    this.configureLighting();
    this.resize();
    window.addEventListener('resize', this.resize);
    window.addEventListener('orientationchange', this.resize);
    this.animate();
  }

  reset(tiles: BoardTile[]): void {
    this.tiles.forEach((tile) => tile.root.removeFromParent());
    this.tiles.clear();
    this.tweens.splice(0);
    this.cameraShake = 0;
    this.cameraPunch = 0;
    tiles.forEach((tile) => this.addTile(tile, true));
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
              const eased = 1 - Math.pow(1 - t, 4);
              const arc = Math.sin(Math.PI * t);
              visual.root.position.lerpVectors(start, target, eased);
              visual.root.position.y += arc * 0.035;
              visual.root.rotation.x = dz * 0.012 * arc;
              visual.root.rotation.z = -dx * 0.012 * arc;
              visual.root.scale.set(1 + arc * 0.016, 1 - arc * 0.026, 1 + arc * 0.016);
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
      const consumed = this.tiles.get(merge.consumedId);
      consumed?.root.removeFromParent();
      this.tiles.delete(merge.consumedId);

      const survivor = this.tiles.get(merge.survivorId);
      survivor?.root.removeFromParent();
      this.tiles.delete(merge.survivorId);

      const tile = {
        id: merge.survivorId,
        value: merge.value,
        row: merge.at.row,
        col: merge.at.col,
      };
      const visual = this.addTile(tile, false);
      const position = this.cellPosition(merge.at.row, merge.at.col);
      visual.root.scale.set(0.44, 0.24, 0.44);
      visual.root.position.y -= 0.08;

      this.effects.merge(position, merge.value);
      this.environment.impact(merge.value);
      this.mergeBounce(visual.root, merge.value);

      this.hitStopRemaining = Math.max(
        this.hitStopRemaining,
        merge.value >= 512 ? 0.062 : merge.value >= 128 ? 0.045 : ART.motion.hitStopMs / 1000,
      );
      this.cameraShake = Math.max(
        this.cameraShake,
        merge.value >= 1024 ? 0.19 : merge.value >= 512 ? 0.14 : merge.value >= 128 ? 0.085 : 0.038,
      );
      this.cameraPunch = Math.max(
        this.cameraPunch,
        merge.value >= 1024 ? 1.05 : merge.value >= 512 ? 0.72 : merge.value >= 128 ? 0.38 : 0.16,
      );
    });

    if (result.spawned) {
      this.addTile(result.spawned, true);
      this.effects.spawn(this.cellPosition(result.spawned.row, result.spawned.col));
    }
  }

  dispose(): void {
    this.disposed = true;
    window.removeEventListener('resize', this.resize);
    window.removeEventListener('orientationchange', this.resize);
    this.renderer.dispose();
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
          instance.root.position.y = y + Math.sin(Math.PI * t) * 0.13;
          instance.root.rotation.y = (1 - t) * 0.08;
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
    const duration = value >= 512 ? 0.46 : ART.motion.mergeMs / 1000;
    const jump = value >= 1024 ? 0.52 : value >= 512 ? 0.39 : value >= 128 ? 0.29 : 0.21;

    this.tweens.push({
      elapsed: 0,
      duration,
      update: (t) => {
        if (t < 0.22) {
          const p = t / 0.22;
          root.scale.set(
            THREE.MathUtils.lerp(0.44, 1.2, p),
            THREE.MathUtils.lerp(0.24, 0.73, p),
            THREE.MathUtils.lerp(0.44, 1.2, p),
          );
        } else {
          const p = (t - 0.22) / 0.78;
          const spring = Math.sin(p * Math.PI * 2.5) * (1 - p);
          root.scale.set(1 + spring * 0.14, 1 - spring * 0.1, 1 + spring * 0.14);
        }
        root.position.y = baseY + Math.sin(Math.PI * t) * jump;
        root.rotation.y = Math.sin(Math.PI * t) * (value >= 512 ? 0.12 : 0.06);
      },
      complete: () => {
        root.scale.setScalar(1);
        root.position.y = baseY;
        root.rotation.y = 0;
      },
    });
  }

  private configureLighting(): void {
    this.scene.add(new THREE.HemisphereLight(0xf8fcff, 0x6f9557, 2.05));

    const sun = new THREE.DirectionalLight(0xfff2d5, 3.0);
    sun.position.set(-8, 15, 8);
    sun.castShadow = true;
    const mobile = this.isMobileLike();
    const shadowSize = mobile ? 1024 : 1536;
    sun.shadow.mapSize.set(shadowSize, shadowSize);
    sun.shadow.camera.left = -9;
    sun.shadow.camera.right = 9;
    sun.shadow.camera.top = 10;
    sun.shadow.camera.bottom = -10;
    sun.shadow.bias = -0.00035;
    this.scene.add(sun);

    const warm = new THREE.DirectionalLight(0xffc58c, 0.92);
    warm.position.set(8, 5.8, -3);
    this.scene.add(warm);

    const skyFill = new THREE.DirectionalLight(0xc8efff, 0.48);
    skyFill.position.set(-3, 4, -8);
    this.scene.add(skyFill);
  }

  private cellPosition(row: number, col: number): THREE.Vector3 {
    return new THREE.Vector3(
      (col - 1.5) * ART.board.gap,
      0.29,
      (row - 1.5) * ART.board.gap + ART.board.centerZ,
    );
  }

  private readonly resize = (): void => {
    const width = Math.max(1, window.innerWidth);
    const height = Math.max(1, window.innerHeight);
    const ratio = width / height;
    const mobile = this.isMobileLike();

    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, mobile ? ART.mobile.maxPixelRatio : 1.75));
    this.renderer.setSize(width, height);
    this.camera.aspect = ratio;

    if (ratio < 0.58) {
      this.camera.fov = 56;
      this.cameraHome.set(10.2, 14.8, 18.25);
      this.cameraTarget.set(0, 0.45, 0.72);
    } else if (ratio < 0.82) {
      this.camera.fov = 50;
      this.cameraHome.set(9.25, 13.25, 15.95);
      this.cameraTarget.set(0, 0.5, 0.72);
    } else {
      this.camera.fov = 39;
      this.cameraHome.set(8.65, 11.2, 13.2);
      this.cameraTarget.set(0, 0.55, 0.65);
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

    if (simulationDelta > 0) {
      for (let i = this.tweens.length - 1; i >= 0; i -= 1) {
        const tween = this.tweens[i];
        tween.elapsed += simulationDelta;
        const progress = Math.min(1, tween.elapsed / tween.duration);
        tween.update(progress);
        if (progress >= 1) {
          tween.complete?.();
          this.tweens.splice(i, 1);
        }
      }

      this.environment.update(this.visualTime);
      this.effects.update(simulationDelta);
      this.tiles.forEach((tile, id) => {
        tile.animatedParts.forEach((part, index) => {
          part.rotation.y += simulationDelta * (0.38 + index * 0.12);
          part.rotation.z += Math.sin(this.visualTime * 1.35 + id + index) * 0.00032;
        });
      });
    }

    const home = this.cameraHome.clone();
    if (this.cameraPunch > 0.002) {
      const towardTarget = this.cameraTarget.clone().sub(home).normalize();
      home.addScaledVector(towardTarget, this.cameraPunch);
      this.cameraPunch *= Math.pow(0.025, delta);
    }

    const shake = this.cameraShake;
    this.cameraShake *= Math.pow(0.018, delta);
    if (shake > 0.002) {
      home.x += (Math.random() - 0.5) * shake;
      home.y += (Math.random() - 0.5) * shake * 0.42;
      home.z += (Math.random() - 0.5) * shake * 0.3;
    }

    this.camera.position.copy(home);
    this.camera.lookAt(this.cameraTarget);
    this.renderer.render(this.scene, this.camera);
  };

  private isMobileLike(): boolean {
    return window.innerWidth < 760 || window.matchMedia('(pointer: coarse)').matches;
  }

  private easeOutBack(t: number): number {
    const c1 = 1.70158;
    const c3 = c1 + 1;
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
  }
}
