import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import type { BoardTile } from '../../shared/index';
import type { ThemeId } from '../config/themes';
import { PalaceTileFactory } from './tiles/PalaceTileFactory';
import { TileFactory } from './tiles/TileFactory';

type BoardRole = 'local' | 'remote';

interface VisualTile {
  id: number;
  value: number;
  holder: THREE.Group;
  from: THREE.Vector3;
  target: THREE.Vector3;
  startedAt: number;
  duration: number;
  bornAt: number;
}

interface BoardLayer {
  group: THREE.Group;
  pieces: THREE.Group;
  tiles: Map<number, VisualTile>;
  cellMaterial: THREE.MeshStandardMaterial;
  frameMaterial: THREE.MeshStandardMaterial;
  glowMaterial: THREE.MeshStandardMaterial;
  glowBase: number;
  pulse: number;
  theme: ThemeId;
}

const CELL_SPACING = 1.18;
const CELL_Y = 0.16;

const THEME_COLORS: Record<ThemeId, { cell: number; frame: number; glow: number }> = {
  kingdom: { cell: 0x76b866, frame: 0x356f72, glow: 0x66c9e7 },
  palace: { cell: 0x79b09d, frame: 0x8e2830, glow: 0xf0b84c },
};

/**
 * Lightweight duel renderer.
 *
 * It intentionally reuses the existing cached piece factories but does not instantiate
 * either full Solo environment. One WebGL scene renders both boards.
 */
export class DuelScene {
  readonly canvas: HTMLCanvasElement;

  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(38, 1, 0.1, 80);
  private readonly clock = new THREE.Clock();
  private readonly kingdomFactory = new TileFactory();
  private readonly palaceFactory = new PalaceTileFactory();
  private readonly local: BoardLayer;
  private readonly remote: BoardLayer;
  private active = false;
  private raf = 0;

  constructor(container: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: 'high-performance',
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.35));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.domElement.className = 'duel-canvas';
    this.canvas = this.renderer.domElement;
    container.appendChild(this.canvas);

    this.scene.fog = new THREE.Fog(0xd9d8c6, 18, 34);

    const hemi = new THREE.HemisphereLight(0xfff4d6, 0x33525c, 2.05);
    this.scene.add(hemi);

    const key = new THREE.DirectionalLight(0xffe1ab, 3.0);
    key.position.set(-4, 12, 8);
    key.castShadow = true;
    key.shadow.mapSize.set(768, 768);
    key.shadow.camera.left = -8;
    key.shadow.camera.right = 8;
    key.shadow.camera.top = 9;
    key.shadow.camera.bottom = -9;
    this.scene.add(key);

    const fill = new THREE.DirectionalLight(0x8cccec, 1.15);
    fill.position.set(6, 7, -8);
    this.scene.add(fill);

    this.local = this.createBoardLayer('local');
    this.remote = this.createBoardLayer('remote');

    this.local.group.position.set(0, 0, 3.25);
    this.local.group.scale.setScalar(0.82);
    this.remote.group.position.set(0, 0, -3.5);
    this.remote.group.scale.setScalar(0.59);

    this.scene.add(this.local.group, this.remote.group);

    this.camera.position.set(0, 13.7, 12.6);
    this.camera.lookAt(0, 0.2, -0.2);

    this.kingdomFactory.warmup([2, 4, 8, 16, 32, 64, 128]);
    this.palaceFactory.warmup([2, 4, 8, 16, 32, 64, 128]);

    window.addEventListener('resize', this.resize);
    this.resize();
    this.animate();
  }

  setActive(active: boolean): void {
    this.active = active;
    this.canvas.style.visibility = active ? 'visible' : 'hidden';
  }

  setBoard(role: BoardRole, tiles: readonly BoardTile[], theme: ThemeId, immediate = false): void {
    const layer = role === 'local' ? this.local : this.remote;
    this.applyTheme(layer, theme);
    const incoming = new Map(tiles.map((tile) => [tile.id, tile]));
    const now = performance.now();

    for (const [id, visual] of layer.tiles) {
      if (incoming.has(id)) continue;
      visual.holder.removeFromParent();
      layer.tiles.delete(id);
    }

    for (const tile of tiles) {
      const target = this.positionFor(tile.row, tile.col);
      const existing = layer.tiles.get(tile.id);

      if (existing && existing.value === tile.value) {
        existing.from.copy(existing.holder.position);
        existing.target.copy(target);
        existing.startedAt = immediate ? now - 1_000 : now;
        existing.duration = role === 'local' ? 105 : 145;
        continue;
      }

      const previousPosition = existing?.holder.position.clone();
      if (existing) {
        existing.holder.removeFromParent();
        layer.tiles.delete(tile.id);
      }

      const holder = new THREE.Group();
      const visual = this.createPiece(theme, tile.value);
      holder.add(visual.root);
      holder.position.copy(previousPosition ?? target);
      holder.scale.setScalar(previousPosition ? 0.82 : 0.18);
      layer.pieces.add(holder);

      layer.tiles.set(tile.id, {
        id: tile.id,
        value: tile.value,
        holder,
        from: holder.position.clone(),
        target,
        startedAt: immediate ? now - 1_000 : now,
        duration: previousPosition ? 125 : 160,
        bornAt: now,
      });
    }
  }

  pulseEnergy(role: BoardRole, gain: number): void {
    const layer = role === 'local' ? this.local : this.remote;
    layer.pulse = Math.max(layer.pulse, Math.min(1, 0.18 + gain / 28));
  }

  nudge(direction: 'left' | 'right' | 'up' | 'down'): void {
    const amount = 0.09;
    const x = direction === 'left' ? -amount : direction === 'right' ? amount : 0;
    const z = direction === 'up' ? -amount : direction === 'down' ? amount : 0;
    this.local.pieces.position.set(x, 0, z);
    window.setTimeout(() => {
      this.local.pieces.position.set(0, 0, 0);
    }, 90);
  }

  clear(): void {
    for (const layer of [this.local, this.remote]) {
      for (const visual of layer.tiles.values()) visual.holder.removeFromParent();
      layer.tiles.clear();
    }
  }

  dispose(): void {
    cancelAnimationFrame(this.raf);
    window.removeEventListener('resize', this.resize);
    this.renderer.dispose();
    this.canvas.remove();
  }

  private createBoardLayer(role: BoardRole): BoardLayer {
    const group = new THREE.Group();
    const pieces = new THREE.Group();
    group.add(pieces);

    const colors = THEME_COLORS.kingdom;
    const cellMaterial = new THREE.MeshStandardMaterial({
      color: colors.cell,
      roughness: 0.62,
      metalness: 0.02,
    });
    const frameMaterial = new THREE.MeshStandardMaterial({
      color: colors.frame,
      roughness: 0.52,
      metalness: 0.08,
    });
    const glowMaterial = new THREE.MeshStandardMaterial({
      color: colors.glow,
      emissive: colors.glow,
      emissiveIntensity: role === 'local' ? 0.14 : 0.08,
      roughness: 0.42,
    });

    const frame = new THREE.Mesh(
      new RoundedBoxGeometry(5.18, 0.22, 5.18, 4, 0.18),
      frameMaterial,
    );
    frame.position.y = -0.08;
    frame.receiveShadow = true;
    group.add(frame);

    const inset = new THREE.Mesh(
      new RoundedBoxGeometry(4.82, 0.12, 4.82, 4, 0.16),
      glowMaterial,
    );
    inset.position.y = 0.055;
    inset.receiveShadow = true;
    group.add(inset);

    const cellGeometry = new RoundedBoxGeometry(1.02, 0.12, 1.02, 3, 0.12);
    const cells = new THREE.InstancedMesh(cellGeometry, cellMaterial, 16);
    const dummy = new THREE.Object3D();
    let index = 0;
    for (let row = 0; row < 4; row += 1) {
      for (let col = 0; col < 4; col += 1) {
        const p = this.positionFor(row, col);
        dummy.position.set(p.x, 0.12, p.z);
        dummy.updateMatrix();
        cells.setMatrixAt(index++, dummy.matrix);
      }
    }
    cells.instanceMatrix.needsUpdate = true;
    cells.receiveShadow = true;
    group.add(cells);

    return {
      group,
      pieces,
      tiles: new Map(),
      cellMaterial,
      frameMaterial,
      glowMaterial,
      glowBase: role === 'local' ? 0.14 : 0.08,
      pulse: 0,
      theme: 'kingdom',
    };
  }

  private applyTheme(layer: BoardLayer, theme: ThemeId): void {
    if (layer.theme === theme) return;
    layer.theme = theme;
    const colors = THEME_COLORS[theme];
    layer.cellMaterial.color.setHex(colors.cell);
    layer.frameMaterial.color.setHex(colors.frame);
    layer.glowMaterial.color.setHex(colors.glow);
    layer.glowMaterial.emissive.setHex(colors.glow);
  }

  private createPiece(theme: ThemeId, value: number) {
    return theme === 'palace'
      ? this.palaceFactory.create(value)
      : this.kingdomFactory.create(value);
  }

  private positionFor(row: number, col: number): THREE.Vector3 {
    return new THREE.Vector3(
      (col - 1.5) * CELL_SPACING,
      CELL_Y,
      (row - 1.5) * CELL_SPACING,
    );
  }

  private readonly resize = (): void => {
    const width = Math.max(1, this.canvas.parentElement?.clientWidth ?? window.innerWidth);
    const height = Math.max(1, this.canvas.parentElement?.clientHeight ?? window.innerHeight);
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  };

  private animate = (): void => {
    this.raf = requestAnimationFrame(this.animate);
    if (!this.active) return;

    const now = performance.now();
    const delta = Math.min(0.05, this.clock.getDelta());
    const time = this.clock.elapsedTime;

    for (const layer of [this.local, this.remote]) {
      layer.pulse = Math.max(0, layer.pulse - delta * 1.8);
      layer.glowMaterial.emissiveIntensity = layer.glowBase + layer.pulse * 0.9;
      for (const visual of layer.tiles.values()) {
        const progress = THREE.MathUtils.clamp((now - visual.startedAt) / visual.duration, 0, 1);
        const eased = 1 - (1 - progress) ** 3;
        visual.holder.position.lerpVectors(visual.from, visual.target, eased);

        const age = now - visual.bornAt;
        const pop = age < 180 ? 0.18 + 0.82 * (1 - (1 - age / 180) ** 3) : 1;
        visual.holder.scale.setScalar(pop);
        visual.holder.rotation.y = Math.sin(time * 1.5 + visual.id * 0.37) * 0.018;
      }
    }

    this.renderer.render(this.scene, this.camera);
  };
}
