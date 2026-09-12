import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import type {
  BoardTile,
  CellPosition,
  MoveResult,
  PredictedMove,
  SkillId,
} from '../../shared/index';
import type { ThemeId } from '../config/themes';
import { Effects } from './vfx/Effects';
import { PalaceTileFactory } from './tiles/PalaceTileFactory';
import { TileFactory } from './tiles/TileFactory';

type BoardRole = 'local' | 'remote';

interface VisualTile {
  id: number;
  value: number;
  holder: THREE.Group;
  from: THREE.Vector3;
  target: THREE.Vector3;
  targetScale: number;
  startedAt: number;
  duration: number;
  bornAt: number;
}

interface BoardLayer {
  group: THREE.Group;
  board: THREE.Group;
  pieces: THREE.Group;
  deco: THREE.Group;
  tiles: Map<number, VisualTile>;
  blockers: THREE.Mesh[];
  cellMaterials: THREE.MeshStandardMaterial[];
  frameMaterial: THREE.MeshStandardMaterial;
  glowMaterial: THREE.MeshStandardMaterial;
  effects: Effects;
  glowBase: number;
  pulse: number;
  impact: number;
  theme: ThemeId;
}

const CELL_SPACING = 1.18;
const CELL_Y = 0.16;

const THEME_COLORS: Record<ThemeId, {
  cellA: number;
  cellB: number;
  frame: number;
  glow: number;
  accent: number;
  background: number;
}> = {
  kingdom: {
    cellA: 0x89cf67,
    cellB: 0x69b954,
    frame: 0xb97a46,
    glow: 0x54cbe8,
    accent: 0xf3b93f,
    background: 0x78c8ee,
  },
  palace: {
    cellA: 0x91c4aa,
    cellB: 0x6aa58d,
    frame: 0x8e2025,
    glow: 0xe6ae38,
    accent: 0xef7d78,
    background: 0xe6a878,
  },
};

/**
 * PvP renderer: one lightweight WebGL scene, but it deliberately shares the same
 * tile factories, toon-ish palette, merge VFX language and tier hierarchy as Solo.
 * The two duel boards are themed mini-stages rather than generic colored grids.
 */
export class DuelScene {
  readonly canvas: HTMLCanvasElement;

  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(36, 1, 0.1, 80);
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
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.02;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.45));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.domElement.className = 'duel-canvas';
    this.canvas = this.renderer.domElement;
    container.appendChild(this.canvas);

    this.scene.fog = new THREE.Fog(0x20343c, 17, 35);

    const hemi = new THREE.HemisphereLight(0xfff4d6, 0x254551, 2.25);
    this.scene.add(hemi);

    const key = new THREE.DirectionalLight(0xffe1ab, 3.15);
    key.position.set(-4, 12, 8);
    key.castShadow = true;
    key.shadow.mapSize.set(768, 768);
    key.shadow.camera.left = -8;
    key.shadow.camera.right = 8;
    key.shadow.camera.top = 9;
    key.shadow.camera.bottom = -9;
    this.scene.add(key);

    const fill = new THREE.DirectionalLight(0x8cccec, 1.2);
    fill.position.set(6, 7, -8);
    this.scene.add(fill);

    this.local = this.createBoardLayer('local');
    this.remote = this.createBoardLayer('remote');

    // The opponent is still readable, but the local board receives the larger action area.
    this.local.group.position.set(0, 0, 3.1);
    this.local.group.scale.setScalar(0.72);
    this.remote.group.position.set(0, 0, -3.65);
    this.remote.group.scale.setScalar(0.52);

    this.scene.add(this.local.group, this.remote.group);

    this.camera.position.set(0, 14.6, 13.9);
    this.camera.lookAt(0, 0.18, -0.15);

    this.kingdomFactory.warmup([2, 4, 8, 16, 32, 64, 128, 256]);
    this.palaceFactory.warmup([2, 4, 8, 16, 32, 64, 128, 256]);

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
        existing.duration = role === 'local' ? 86 : 112;
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
      const targetScale = this.fitScale(tile.value, visual.root);
      holder.position.copy(previousPosition ?? target);
      holder.scale.setScalar(previousPosition ? targetScale * 0.84 : targetScale * 0.2);
      layer.pieces.add(holder);

      layer.tiles.set(tile.id, {
        id: tile.id,
        value: tile.value,
        holder,
        from: holder.position.clone(),
        target,
        targetScale,
        startedAt: immediate ? now - 1_000 : now,
        duration: previousPosition ? 105 : 145,
        bornAt: now,
      });
    }
  }

  setBlockedCells(role: BoardRole, cells: readonly CellPosition[]): void {
    const layer = role === 'local' ? this.local : this.remote;
    const blocked = new Set(cells.map((cell) => `${cell.row}:${cell.col}`));

    layer.blockers.forEach((mesh, index) => {
      const row = Math.floor(index / 4);
      const col = index % 4;
      const visible = blocked.has(`${row}:${col}`);
      const becameVisible = visible && !mesh.visible;
      mesh.visible = visible;
      if (visible) {
        const position = this.positionFor(row, col);
        mesh.position.set(position.x, 0.7, position.z);
        if (becameVisible) {
          mesh.scale.setScalar(0.1);
          layer.impact = 1;
          layer.effects.skillClear([position], layer.theme);
        }
      }
    });
  }

  playPredictedMove(role: BoardRole, prediction: PredictedMove, theme: ThemeId): void {
    const layer = role === 'local' ? this.local : this.remote;
    if (!prediction.changed) return;
    this.applyTheme(layer, theme);

    const mergedTargets = new Map<string, number>();
    for (const motion of prediction.motions) {
      if (!motion.consumed) continue;
      const key = `${motion.to.row}:${motion.to.col}`;
      const partner = prediction.tiles.find((tile) =>
        tile.row === motion.to.row && tile.col === motion.to.col);
      if (partner) mergedTargets.set(key, partner.value);
    }

    for (const [key, value] of mergedTargets) {
      const [row, col] = key.split(':').map(Number);
      const position = this.positionFor(row, col);
      layer.effects.merge(position, value, theme);
      layer.pulse = Math.max(layer.pulse, 0.55);
      layer.impact = Math.max(layer.impact, Math.min(1, 0.3 + Math.log2(value) * 0.055));
    }
  }

  playServerMove(role: BoardRole, result: MoveResult, theme: ThemeId): void {
    if (!result.changed) return;
    const layer = role === 'local' ? this.local : this.remote;
    this.applyTheme(layer, theme);
    for (const merge of result.merges) {
      const position = this.positionFor(merge.at.row, merge.at.col);
      layer.effects.merge(position, merge.value, theme);
      layer.impact = Math.max(layer.impact, Math.min(1, 0.3 + Math.log2(merge.value) * 0.055));
    }
    if (result.spawned) layer.effects.spawn(this.positionFor(result.spawned.row, result.spawned.col), theme);
  }

  playSkill(role: BoardRole, skillId: SkillId, cells: readonly CellPosition[] = []): void {
    const layer = role === 'local' ? this.local : this.remote;
    const positions = cells.map((cell) => this.positionFor(cell.row, cell.col));
    const fallback = [new THREE.Vector3(0, 0.2, 0)];
    layer.effects.skillClear(positions.length ? positions : fallback, layer.theme);
    layer.pulse = 1;
    layer.impact = 1;

    if (skillId === 'shield') {
      layer.glowMaterial.emissiveIntensity = 1.65;
    }
    if (skillId === 'petrify') {
      layer.board.rotation.y = role === 'local' ? -0.018 : 0.018;
      window.setTimeout(() => { layer.board.rotation.y = 0; }, 150);
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
    window.setTimeout(() => this.local.pieces.position.set(0, 0, 0), 80);
  }

  clear(): void {
    for (const layer of [this.local, this.remote]) {
      for (const visual of layer.tiles.values()) visual.holder.removeFromParent();
      layer.tiles.clear();
      layer.blockers.forEach((blocker) => { blocker.visible = false; });
      layer.effects.clearTransient();
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
    const board = new THREE.Group();
    const pieces = new THREE.Group();
    const deco = new THREE.Group();
    group.add(board, deco, pieces);

    const colors = THEME_COLORS.kingdom;
    const frameMaterial = new THREE.MeshStandardMaterial({
      color: colors.frame,
      roughness: 0.62,
      metalness: 0.02,
    });
    const glowMaterial = new THREE.MeshStandardMaterial({
      color: colors.glow,
      emissive: colors.glow,
      emissiveIntensity: role === 'local' ? 0.18 : 0.11,
      roughness: 0.36,
      metalness: 0.05,
    });

    const frame = new THREE.Mesh(
      new RoundedBoxGeometry(5.36, 0.34, 5.36, 4, 0.22),
      frameMaterial,
    );
    frame.position.y = -0.1;
    frame.receiveShadow = true;
    board.add(frame);

    const inset = new THREE.Mesh(
      new RoundedBoxGeometry(5.03, 0.16, 5.03, 4, 0.18),
      glowMaterial,
    );
    inset.position.y = 0.08;
    inset.receiveShadow = true;
    board.add(inset);

    const cellMaterials = [
      new THREE.MeshStandardMaterial({ color: colors.cellA, roughness: 0.72 }),
      new THREE.MeshStandardMaterial({ color: colors.cellB, roughness: 0.72 }),
    ];
    const cellGeometry = new RoundedBoxGeometry(1.02, 0.12, 1.02, 3, 0.12);
    for (let row = 0; row < 4; row += 1) {
      for (let col = 0; col < 4; col += 1) {
        const p = this.positionFor(row, col);
        const cell = new THREE.Mesh(cellGeometry, cellMaterials[(row + col) % 2]);
        cell.position.set(p.x, 0.19, p.z);
        cell.receiveShadow = true;
        board.add(cell);
      }
    }

    const blockerGeometry = new THREE.OctahedronGeometry(0.48, 1);
    const blockerMaterial = new THREE.MeshStandardMaterial({
      color: 0xbcecff,
      emissive: 0x36b7ed,
      emissiveIntensity: 0.72,
      roughness: 0.08,
      metalness: 0.1,
      transparent: true,
      opacity: 0.88,
    });
    const blockers: THREE.Mesh[] = [];
    for (let index = 0; index < 16; index += 1) {
      const blocker = new THREE.Mesh(blockerGeometry, blockerMaterial);
      blocker.visible = false;
      blocker.castShadow = false;
      blocker.receiveShadow = false;
      blocker.rotation.set(0.18, 0.45, 0.08);
      blockers.push(blocker);
      group.add(blocker);
    }

    const effects = new Effects(group, true);
    const layer: BoardLayer = {
      group,
      board,
      pieces,
      deco,
      tiles: new Map(),
      blockers,
      cellMaterials,
      frameMaterial,
      glowMaterial,
      effects,
      glowBase: role === 'local' ? 0.18 : 0.11,
      pulse: 0,
      impact: 0,
      theme: 'kingdom',
    };
    this.rebuildDeco(layer, 'kingdom');
    return layer;
  }

  private applyTheme(layer: BoardLayer, theme: ThemeId): void {
    if (layer.theme === theme) return;
    layer.theme = theme;
    const colors = THEME_COLORS[theme];
    layer.cellMaterials[0].color.setHex(colors.cellA);
    layer.cellMaterials[1].color.setHex(colors.cellB);
    layer.frameMaterial.color.setHex(colors.frame);
    layer.glowMaterial.color.setHex(colors.glow);
    layer.glowMaterial.emissive.setHex(colors.glow);
    this.rebuildDeco(layer, theme);
  }

  private rebuildDeco(layer: BoardLayer, theme: ThemeId): void {
    layer.deco.clear();
    const colors = THEME_COLORS[theme];
    const toon = (color: number) => new THREE.MeshToonMaterial({ color });

    if (theme === 'kingdom') {
      for (const side of [-1, 1]) {
        const tower = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.3, 0.72, 8), toon(0xd4ae75));
        tower.position.set(side * 2.25, 0.35, -2.28);
        const roof = new THREE.Mesh(new THREE.ConeGeometry(0.34, 0.42, 8), toon(0x3478c8));
        roof.position.set(side * 2.25, 0.92, -2.28);
        layer.deco.add(tower, roof);
      }
      const crystal = new THREE.Mesh(new THREE.OctahedronGeometry(0.24, 0), toon(colors.glow));
      crystal.position.set(0, 0.48, -2.5);
      crystal.rotation.z = 0.2;
      layer.deco.add(crystal);
    } else {
      const gateMat = toon(0x8e2025);
      const goldMat = toon(0xe6ae38);
      for (const side of [-1, 1]) {
        const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.14, 0.82, 10), gateMat);
        pillar.position.set(side * 2.25, 0.43, -2.32);
        const lantern = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8), goldMat);
        lantern.position.set(side * 2.25, 0.96, -2.32);
        layer.deco.add(pillar, lantern);
      }
      const roof = new THREE.Mesh(new RoundedBoxGeometry(2.1, 0.14, 0.4, 3, 0.08), goldMat);
      roof.position.set(0, 0.88, -2.42);
      layer.deco.add(roof);
    }
  }

  private createPiece(theme: ThemeId, value: number) {
    return theme === 'palace'
      ? this.palaceFactory.create(value)
      : this.kingdomFactory.create(value);
  }

  private fitScale(value: number, root: THREE.Object3D): number {
    const bounds = new THREE.Box3().setFromObject(root);
    const size = bounds.getSize(new THREE.Vector3());
    const footprint = Math.max(0.001, size.x, size.z);
    const tier = Math.max(1, Math.log2(value));
    // Strong tier progression remains, but every model is guaranteed to fit inside one duel cell.
    const desiredFootprint = CELL_SPACING * THREE.MathUtils.clamp(0.58 + tier * 0.032, 0.63, 0.88);
    const byFootprint = desiredFootprint / footprint;
    const byHeight = 1.28 / Math.max(0.001, size.y);
    return Math.min(byFootprint, byHeight);
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
      layer.pulse = Math.max(0, layer.pulse - delta * 1.9);
      layer.impact = Math.max(0, layer.impact - delta * 2.5);
      layer.glowMaterial.emissiveIntensity = layer.glowBase + layer.pulse * 1.05;
      layer.board.position.y = Math.sin(time * 1.5) * 0.006 + layer.impact * 0.035;

      layer.effects.update(delta);

      layer.blockers.forEach((blocker, index) => {
        if (!blocker.visible) return;
        blocker.rotation.y += delta * (index % 2 ? 1.15 : -1.15);
        const target = 0.95 + Math.sin(time * 5 + index) * 0.08;
        blocker.scale.lerp(new THREE.Vector3(target, target * 1.08, target), 0.18);
      });

      for (const visual of layer.tiles.values()) {
        const progress = THREE.MathUtils.clamp((now - visual.startedAt) / visual.duration, 0, 1);
        const eased = 1 - (1 - progress) ** 3;
        visual.holder.position.lerpVectors(visual.from, visual.target, eased);

        const age = now - visual.bornAt;
        const spawn = age < 170 ? 0.2 + 0.8 * (1 - (1 - age / 170) ** 3) : 1;
        visual.holder.scale.setScalar(visual.targetScale * spawn);
        visual.holder.rotation.y = Math.sin(time * 1.55 + visual.id * 0.37) * 0.014;
      }
    }

    this.renderer.render(this.scene, this.camera);
  };
}
