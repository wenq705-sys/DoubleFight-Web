import * as THREE from 'three';
import type { BoardTile, CellPosition, Direction, MoveResult, TileMotion } from '../../../shared/index';
import { ART } from '../../config/artDirection';
import type { ThemeId } from '../../config/themes';
import type { QualityLevel } from '../../performance/PerformanceManager';
import type { PresentationEvent } from '../../battle/PresentationEvents';
import { sameTiles } from '../../battle/PresentationEvents';
import type { BattleFeedback } from '../../battle/BattleFeedback';
import { THEME_PRESENTATIONS, type ThemeEnvironment, type EnvironmentDetail } from '../themes/ThemePresentation';
import { fitTile } from '../tiles/TileSizingPolicy';
import type { TileVisual } from '../tiles/TileFactory';
import { Effects } from '../vfx/Effects';

type Tween = { elapsed: number; duration: number; update(t: number): void; complete?(): void; cancel?(): void };
type TileInstance = TileVisual & { value: number };
export const BOARD_PRESENTATION_WIDTH = 9.45;

/** The single board renderer. No clocks, boards, sockets, score or RNG authority. */
export class BattleBoardView {
  readonly root = new THREE.Group();
  private readonly tileLayer = new THREE.Group();
  private readonly effects: Effects;
  private readonly tiles = new Map<number, TileInstance>();
  private readonly tweens: Tween[] = [];
  private readonly environments = new Map<ThemeId, ThemeEnvironment>();
  private readonly dragTarget = new THREE.Vector2();
  private readonly dragCurrent = new THREE.Vector2();
  private readonly blockers: THREE.Mesh[] = [];
  private readonly shield: THREE.Mesh;
  private readonly deferredSpawns = new Map<number, BoardTile>();
  private targetTiles: BoardTile[] = [];
  private environment: ThemeEnvironment;
  private currentTheme: ThemeId;
  private moving = false;
  private hitStopRemaining = 0;
  private visualTime = 0;
  private disposed = false;
  cameraShake = 0;
  cameraPunch = 0;

  constructor(theme: ThemeId = 'kingdom', private readonly detail: EnvironmentDetail = 'full',
    private readonly feedback?: BattleFeedback, private readonly onEvent?: (event: PresentationEvent) => void,
    mobile = false) {
    this.currentTheme = theme;
    this.environment = this.getEnvironment(theme);
    this.root.add(this.environment.root, this.tileLayer);
    this.effects = new Effects(this.root, mobile);
    const geometry = new THREE.OctahedronGeometry(0.58, 0);
    const material = new THREE.MeshStandardMaterial({ color: 0x9edcf2, emissive: 0x2b90ba, emissiveIntensity: 0.42, transparent: true, opacity: 0.82 });
    for (let i = 0; i < 16; i++) {
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.copy(this.cellPosition(Math.floor(i / 4), i % 4));
      mesh.position.y += 0.6;
      mesh.visible = false;
      this.blockers.push(mesh);
      this.root.add(mesh);
    }
    this.shield = new THREE.Mesh(new THREE.TorusGeometry(4.55, 0.045, 6, 48), new THREE.MeshBasicMaterial({ color: this.presentation.effects.skill }));
    this.shield.rotation.x = Math.PI / 2;
    this.shield.position.set(0, this.presentation.surfaceY + 0.1, ART.board.centerZ);
    this.shield.visible = false;
    this.root.add(this.shield);
  }

  get theme(): ThemeId { return this.currentTheme; }
  get presentation() { return THEME_PRESENTATIONS[this.currentTheme]; }
  snapshot(): BoardTile[] { return this.targetTiles.map(tile => ({ ...tile })); }
  setQuality(quality: QualityLevel): void { this.effects.setQuality(quality); }
  prewarmTheme(theme: ThemeId): void { THEME_PRESENTATIONS[theme].factory.warmup([2, 4, 8, 16, 32, 64, 128]); }

  setTheme(theme: ThemeId): void {
    if (theme === this.currentTheme) return;
    const tiles = this.snapshot();
    this.environment.root.removeFromParent();
    this.currentTheme = theme;
    this.environment = this.getEnvironment(theme);
    this.root.add(this.environment.root);
    (this.shield.material as THREE.MeshBasicMaterial).color.setHex(this.presentation.effects.skill);
    this.shield.position.y = this.presentation.surfaceY + 0.1;
    this.blockers.forEach(mesh => { mesh.position.y = this.presentation.surfaceY + 0.6; });
    this.reset(tiles);
  }

  reset(tiles: readonly BoardTile[] = []): void {
    this.cancel();
    this.tileLayer.clear();
    this.tiles.clear();
    this.targetTiles = tiles.map(tile => ({ ...tile }));
    this.effects.clearTransient();
    this.cameraShake = this.cameraPunch = this.hitStopRemaining = 0;
    this.clearGesture();
    this.dragCurrent.set(0, 0);
    this.tileLayer.position.set(0, 0, 0);
    this.tileLayer.rotation.set(0, 0, 0);
    this.blockers.forEach(mesh => { mesh.visible = false; });
    this.shield.visible = false;
    tiles.forEach(tile => this.addTile(tile, false));
  }

  setGesture(dx: number, dy: number): void {
    const magnitude = Math.min(1, Math.hypot(dx, dy) / 92);
    this.dragTarget.set(THREE.MathUtils.clamp(dx / 92, -1, 1) * magnitude, THREE.MathUtils.clamp(dy / 92, -1, 1) * magnitude);
    this.environment.setGesture(dx, dy, magnitude);
  }
  clearGesture(): void { this.dragTarget.set(0, 0); this.environment.clearGesture(); }
  commitDirection(direction: Direction): void { this.clearGesture(); this.environment.pulseDirection(direction); }
  rejectDirection(direction: Direction): void { this.commitDirection(direction); this.cameraShake = Math.max(this.cameraShake, 0.02); }
  react(value: number): void { this.environment.impact(value, this.cellPosition(1, 1)); }

  present(event: PresentationEvent): Promise<void> {
    if (this.disposed) return Promise.resolve();
    if (event.type === 'move') {
      if (!event.result.changed) { this.rejectDirection(event.direction); return Promise.resolve(); }
      this.commitDirection(event.direction);
      this.emit(event);
      return this.applyMove(event.result);
    }
    if (event.type === 'skill_hit' && event.removed?.length) { this.emit(event); return this.applyClearSkill(event.removed); }
    this.emit(event);
    if (event.type === 'skill_cast' || event.type === 'skill_hit') {
      const position = this.cellPosition(event.type === 'skill_hit' && event.cell ? event.cell.row : 1, event.type === 'skill_hit' && event.cell ? event.cell.col : 1);
      this.effects.spawn(position, this.presentation.effects);
      this.presentation.skillReaction(this.environment, [position]);
    }
    return Promise.resolve();
  }

  applyMove(result: MoveResult): Promise<void> {
    if (!result.changed || this.disposed) return Promise.resolve();
    this.finish();
    const next = new Map(this.targetTiles.map(tile => [tile.id, { ...tile }]));
    for (const motion of result.motions) {
      if (motion.consumed) next.delete(motion.id);
      else if (next.has(motion.id)) Object.assign(next.get(motion.id)!, motion.to);
    }
    for (const merge of result.merges) next.set(merge.survivorId, { id: merge.survivorId, value: merge.value, ...merge.at });
    if (result.spawned) next.set(result.spawned.id, { ...result.spawned });
    this.targetTiles = [...next.values()];
    return this.animateMotions(result.motions, () => {
      for (const merge of result.merges) {
        this.removeTileVisual(merge.consumedId);
        this.removeTileVisual(merge.survivorId);
        const visual = this.addTile({ id: merge.survivorId, value: merge.value, ...merge.at }, false);
        const position = this.cellPosition(merge.at.row, merge.at.col);
        visual.root.scale.set(0.34, 0.18, 0.34);
        this.effects.merge(position, merge.value, this.presentation.effects);
        this.environment.impact(merge.value, position);
        this.mergeBounce(visual.root, merge.value);
        this.emit({ type: 'merge', value: merge.value, at: merge.at });
        this.hitStopRemaining = Math.max(this.hitStopRemaining, merge.value >= 512 ? 0.068 : ART.motion.hitStopMs / 1000);
        this.cameraShake = Math.max(this.cameraShake, merge.value >= 512 ? 0.2 : 0.058);
        this.cameraPunch = Math.max(this.cameraPunch, merge.value >= 512 ? 1 : 0.26);
      }
      if (result.spawned) this.spawn(result.spawned);
    });
  }

  /** Equality leaves in-flight prediction untouched. Corrections never replay merge feedback. */
  reconcile(tiles: readonly BoardTile[]): void {
    if (sameTiles(this.targetTiles, tiles)) return;
    const old = new Map(this.targetTiles.map(tile => [tile.id, tile]));
    const additions = tiles.filter(tile => !old.has(tile.id));
    if (tiles.length === old.size + additions.length && this.targetTiles.every(tile => tiles.some(other => sameTiles([tile], [other])))) {
      this.targetTiles = tiles.map(tile => ({ ...tile }));
      for (const tile of additions) {
        if (this.moving) this.deferredSpawns.set(tile.id, { ...tile });
        else this.spawn(tile);
      }
      return;
    }
    this.finish();
    this.targetTiles = tiles.map(tile => ({ ...tile }));
    const ids = new Set(tiles.map(tile => tile.id));
    for (const id of this.tiles.keys()) if (!ids.has(id)) this.removeTileVisual(id);
    const motions: TileMotion[] = [];
    for (const tile of tiles) {
      const existing = this.tiles.get(tile.id);
      if (!existing) { this.spawn(tile); continue; }
      if (existing.value !== tile.value) {
        const position = existing.root.position.clone();
        this.removeTileVisual(tile.id);
        this.addTile(tile, false).root.position.copy(position);
      }
      motions.push({ id: tile.id, value: tile.value, from: tile, to: tile, consumed: false });
    }
    void this.animateMotions(motions);
  }

  setStatus(cells: readonly CellPosition[], shield = this.shield.visible): void {
    const blocked = new Set(cells.map(cell => cell.row * 4 + cell.col));
    this.blockers.forEach((mesh, index) => {
      const visible = blocked.has(index);
      if (visible !== mesh.visible) this.emit({ type: visible ? 'status_apply' : 'status_remove', status: 'petrify', cell: { row: Math.floor(index / 4), col: index % 4 } });
      mesh.visible = visible;
    });
    if (shield !== this.shield.visible) this.emit({ type: shield ? 'status_apply' : 'status_remove', status: 'shield' });
    this.shield.visible = shield;
  }

  private spawn(tile: BoardTile): void {
    if (this.tiles.has(tile.id)) return;
    this.addTile(tile, true);
    this.effects.spawn(this.cellPosition(tile.row, tile.col), this.presentation.effects);
    this.emit({ type: 'spawn', tile });
  }
  private emit(event: PresentationEvent): void { this.feedback?.play(event, this.presentation); this.onEvent?.(event); }

  private animateMotions(motions: readonly TileMotion[], complete?: () => void): Promise<void> {
    this.moving = true;
    const paths = motions.flatMap(motion => {
      const visual = this.tiles.get(motion.id);
      return visual ? [{ visual, start: visual.root.position.clone(), target: this.cellPosition(motion.to.row, motion.to.col) }] : [];
    });
    return new Promise(resolve => {
      this.tweens.push({ elapsed: 0, duration: ART.motion.moveMs / 1000, cancel: resolve,
        update: t => {
          const drive = 1 - Math.pow(1 - t, 5), arc = Math.sin(Math.PI * t);
          const settle = Math.sin(Math.PI * Math.min(1, t * 1.15));
          for (const { visual, start, target } of paths) {
            visual.root.position.lerpVectors(start, target, drive);
            visual.root.position.y += arc * 0.055;
            visual.root.rotation.x = THREE.MathUtils.clamp((target.z - start.z) * 0.018, -0.1, 0.1) * arc;
            visual.root.rotation.z = THREE.MathUtils.clamp(-(target.x - start.x) * 0.018, -0.1, 0.1) * arc;
            visual.root.scale.set(1 + settle * 0.025, 1 - settle * 0.045, 1 + settle * 0.025);
          }
        },
        complete: () => {
          this.moving = false;
          for (const { visual, target } of paths) { visual.root.position.copy(target); visual.root.rotation.set(0, 0, 0); visual.root.scale.setScalar(1); }
          complete?.();
          for (const tile of this.deferredSpawns.values()) this.spawn(tile);
          this.deferredSpawns.clear();
          resolve();
        },
      });
    });
  }

  private finish(): void {
    while (this.tweens.length) {
      const batch = this.tweens.splice(0);
      for (const tween of batch) { tween.update(1); tween.complete?.(); }
    }
    this.hitStopRemaining = 0;
  }
  private cancel(): void {
    for (const tween of this.tweens.splice(0)) tween.cancel?.();
    this.moving = false;
    this.deferredSpawns.clear();
  }

  update(delta: number): void {
    if (this.disposed) return;
    const dt = Math.min(0.05, Math.max(0, delta));
    this.dragCurrent.lerp(this.dragTarget, 1 - Math.exp(-dt * 19));
    this.tileLayer.position.set(this.dragCurrent.x * 0.13, 0, this.dragCurrent.y * 0.13);
    this.tileLayer.rotation.set(this.dragCurrent.y * 0.014, 0, -this.dragCurrent.x * 0.018);
    if (this.hitStopRemaining > 0) { this.hitStopRemaining -= dt; return; }
    this.visualTime += dt;
    for (const tween of [...this.tweens]) {
      tween.elapsed += dt;
      if (tween.elapsed < 0) continue;
      const t = Math.min(1, tween.elapsed / tween.duration);
      tween.update(t);
      if (t >= 1) { this.tweens.splice(this.tweens.indexOf(tween), 1); tween.complete?.(); }
    }
    this.environment.update(this.visualTime, dt);
    this.effects.update(dt);
    this.tiles.forEach((tile, id) => tile.animatedParts.forEach((part, index) => {
      part.rotation.y += dt * (0.42 + index * 0.14);
      part.rotation.z = Math.sin(this.visualTime * 1.45 + id + index) * 0.018;
    }));
    this.blockers.forEach((mesh, index) => { if (mesh.visible) mesh.rotation.y += dt * (index % 2 ? 0.7 : -0.7); });
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.cancel();
    this.tileLayer.clear(); // Factory clones share geometry/materials with other views.
    this.tiles.clear();
    this.effects.dispose();
    const geometry = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>();
    const collect = (node: THREE.Object3D) => { if (node instanceof THREE.Mesh) { geometry.add(node.geometry); for (const material of Array.isArray(node.material) ? node.material : [node.material]) materials.add(material); } };
    for (const environment of this.environments.values()) environment.root.traverse(collect);
    this.root.traverse(collect);
    geometry.forEach(item => item.dispose()); materials.forEach(item => item.dispose());
    this.environments.clear(); this.root.clear(); this.root.removeFromParent();
  }
  private getEnvironment(theme: ThemeId): ThemeEnvironment {
    let environment = this.environments.get(theme);
    if (!environment) { environment = THEME_PRESENTATIONS[theme].environment(this.detail); this.environments.set(theme, environment); }
    return environment;
  }

  async applyClearSkill(removed: readonly BoardTile[]): Promise<void> {
    if (removed.length === 0) return;
    this.finish();
    const ids = new Set(removed.map(tile => tile.id));
    this.targetTiles = this.targetTiles.filter(tile => !ids.has(tile.id));

    const positions = removed.map((tile) => this.cellPosition(tile.row, tile.col));
    this.effects.skillClear(positions, this.presentation.effects);

    this.presentation.skillReaction(this.environment, positions);

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
          cancel: resolve,
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

  private removeTileVisual(id: number): void {
    const visual = this.tiles.get(id);
    if (!visual) return;
    visual.root.removeFromParent();
    this.tiles.delete(id);
  }

  private addTile(tile: BoardTile, spawn: boolean): TileInstance {
    const visual = fitTile(this.presentation.factory.create(tile.value), tile.value);
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

  private cellPosition(row: number, col: number): THREE.Vector3 {
    return new THREE.Vector3(
      (col - 1.5) * ART.board.gap,
      this.presentation.surfaceY,
      (row - 1.5) * ART.board.gap + ART.board.centerZ,
    );
  }


  private easeOutBack(t: number): number {
    const c1 = 1.70158;
    const c3 = c1 + 1;
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
  }
}
