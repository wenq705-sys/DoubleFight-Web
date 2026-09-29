/// <reference types="vite/client" />
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { loadNightMarketGLB } from '../loaders/NightMarketAssetLoader';
import { ART } from '../../config/artDirection';
import type { BoardTile, Direction, MoveResult } from '../../game/board/types';
// Browser-independent mood director and VFX share the exact tested preview implementations.
// @ts-ignore The reusable ESM module is intentionally JavaScript to serve both runtimes.
import { ThemeMoodDirector } from './nightmarket/ThemeMoodDirector.mjs';
// @ts-ignore The shared spectacle is bundled by Vite in the actual game.
import { NightMarketSpectacle } from './nightmarket/NightMarketSpectacle.mjs';

const SCALE = ART.board.gap / 1.065;
const STAGE_NAMES = ['初入夜市', '夜市苏醒', '夜市繁盛', '华彩高潮', '神灯盛会'] as const;
type ModelTag = 'lantern' | 'paper' | 'gold' | 'jade' | 'water' | 'lotus';
type Tracked = { material: THREE.MeshStandardMaterial; tag: ModelTag; base: THREE.Color };
type MoodState = {
  lantern: number; moon: number; water: number; gold: number; pulse: number;
  victory: number; stage: number; highest: number; festival: number;
};

/**
 * Production 3D theme:
 * - One board + one environmental GLB, lazily loaded ONLY when this island is entered.
 * - The current game grid retains its canonical ART.board.gap and row/column coordinates.
 * - MoodDirector is driven by original MoveResult, not by demo slider/buttons.
 * - Performance: mobile LOD environment, no per-frame meshes/GLB allocation.
 */
export class NightMarketEnvironment {
  readonly root = new THREE.Group();
  private readonly frame = new THREE.Group();
  private readonly boardFallback = new THREE.Group();
  private readonly loader = new GLTFLoader();
  private readonly tracked: Tracked[] = [];
  private readonly mood = new ThemeMoodDirector();
  private readonly spectacle: { update(delta: number, state: MoodState): void; root: THREE.Group } | null;
  private readonly mobile: boolean;
  private disposed = false;
  private drift = 0;
  private transientPulse = 0;
  private readonly showDetailed: boolean;

  constructor(detail: 'full' | 'duel' | 'board' = 'full') {
    this.root.name = 'NightMarket | Lotus Lantern Island';
    this.frame.name = 'Blender author-space -> shared BattleBoardView coordinate adapter';
    this.frame.scale.setScalar(SCALE);
    // Authored 3D character anchor is 0.88m; move it to production surface Y = 0.695.
    this.frame.position.set(0, .695 - .88 * SCALE, ART.board.centerZ);
    this.root.add(this.frame);
    this.mobile = typeof window === 'undefined' || window.innerWidth < 760 ||
      typeof window.matchMedia !== 'function' || window.matchMedia('(pointer: coarse)').matches;
    this.showDetailed = detail === 'full';
    this.makeFallbackBoard();
    this.spectacle = detail === 'full'
      ? new NightMarketSpectacle(this.frame, { mobile: this.mobile }) : null;
    this.loadGLB('board-4x4.glb', 'board');
    if (detail !== 'board') {
      const environment = this.mobile || detail === 'duel'
        ? 'environment-mobile.glb' : 'environment-nightmarket.glb';
      this.loadGLB(environment, 'environment');
    }
  }

  /** Called from the mainline shared board renderer on restart/theme entry. */
  resetMood(tiles: readonly BoardTile[] = []): void {
    this.mood.reset();
    this.mood.progress(Math.max(2, ...tiles.map(tile => tile.value)));
    this.transientPulse = 0;
  }

  /** Called after a real board move finishes the merge presentation. */
  onBoardMove(result: MoveResult): void {
    if (!result.changed || !result.merges.length) return;
    const merges = result.merges;
    const biggest = merges.reduce((a, b) => a.value >= b.value ? a : b);
    const tier = Math.max(...merges.map(merge => merge.value));
    const type = merges.length >= 3 ? 'combo' : tier >= 256 ? 'bigMerge' : 'merge';
    // The director owns monotonic progress, victory-once and transitional easing.
    this.mood.moment(type, {
      tile: tier, combo: merges.length,
      cell: { row: biggest.at.row, column: biggest.at.col },
    });
    this.transientPulse = Math.max(this.transientPulse, merges.length >= 3 ? 1.1 : .60);
  }

  setGesture(_dx: number, _dy: number, strength: number): void {
    this.transientPulse = Math.max(this.transientPulse, Math.min(.16, strength * .16));
  }
  clearGesture(): void { /* no independent gameplay state */ }
  pulseDirection(_direction: Direction): void {
    this.transientPulse = Math.max(this.transientPulse, .19);
  }
  impact(value: number, _position: THREE.Vector3): void {
    // Visual punch is immediate; long-lived stage advances in onBoardMove.
    this.transientPulse = Math.max(this.transientPulse, value >= 256 ? 1.03 : .48);
  }

  update(_time: number, delta: number): void {
    if (this.disposed || !this.root.visible) return;
    const dt = Math.min(.05, Math.max(0, delta));
    this.drift += dt;
    this.transientPulse *= Math.exp(-dt * 4.1);
    const state = this.mood.update(dt) as MoodState;
    const flash = Math.max(state.pulse, this.transientPulse);
    const glow = state.lantern;
    for (const entry of this.tracked) {
      const { material, tag, base } = entry;
      if (tag === 'lantern' || tag === 'paper') {
        material.emissive.setHex(tag === 'lantern' ? 0xffae56 : 0xffdda8);
        material.emissiveIntensity = (tag === 'lantern' ? .10 : .025)
          + glow * (tag === 'lantern' ? .80 : .26) + flash * .16;
      } else if (tag === 'gold') {
        material.emissive.setHex(0xffc776);
        material.emissiveIntensity = .025 + state.gold * .24 + flash * .12;
      } else if (tag === 'jade') {
        material.emissive.setHex(0x75e8d1);
        material.emissiveIntensity = .01 + state.moon * .16;
      } else if (tag === 'water') {
        material.emissive.setHex(0x61c4d8);
        material.emissiveIntensity = .02 + state.water * .26;
        material.color.copy(base).lerp(new THREE.Color(0x86dae4),
          Math.min(.23, state.water * .19));
      } else if (tag === 'lotus') {
        material.emissive.setHex(0xffc79c);
        material.emissiveIntensity = .10 + state.moon * .47;
      }
    }
    this.spectacle?.update(dt, { ...state, pulse: flash });
  }

  get moodStage(): number { return (this.mood.snapshot() as MoodState).stage; }
  get moodName(): string { return STAGE_NAMES[this.moodStage]; }
  get reachedValue(): number { return (this.mood.snapshot() as MoodState).highest; }

  private makeFallbackBoard(): void {
    const foundation = new THREE.Mesh(new THREE.BoxGeometry(5.52, .26, 5.52),
      new THREE.MeshStandardMaterial({ color: 0x6b3729, roughness: .61 }));
    foundation.position.y = .69;this.boardFallback.add(foundation);
    const tile = new THREE.BoxGeometry(.94, .055, .94);
    const face = new THREE.MeshStandardMaterial({ color: 0xe7b99d, roughness: .43 });
    for (let row = 0; row < 4; row++) for (let col = 0; col < 4; col++) {
      const square = new THREE.Mesh(tile, face);
      square.position.set((col - 1.5) * 1.065, .851, (row - 1.5) * 1.065);
      this.boardFallback.add(square);
    }
    this.boardFallback.name = 'Temporary board until authored GLB arrives';
    this.frame.add(this.boardFallback);
  }

  private loadGLB(filename: string, purpose: 'board' | 'environment'): void {
    loadNightMarketGLB(this.loader, filename, result => {
      if (this.disposed) return;
      const imported = result.scene;
      imported.name = 'authored night market ' + purpose;
      const processed = new Map<THREE.Material, THREE.Material>();
      imported.traverse(node => {
        if (!(node instanceof THREE.Mesh)) return;
        node.castShadow = false; node.receiveShadow = false;
        node.material = Array.isArray(node.material)
          ? node.material.map(item => this.prepareMaterial(item, processed))
          : this.prepareMaterial(node.material, processed);
      });
      this.frame.add(imported);
      if (purpose === 'board') {
        this.boardFallback.removeFromParent();
        this.boardFallback.traverse(node => {
          if (node instanceof THREE.Mesh) {
            node.geometry.dispose();
            if (Array.isArray(node.material)) node.material.forEach(m => m.dispose());
            else node.material.dispose();
          }
        });
      }
    }, error => {
      console.warn('[NightMarket] Douyin/Browser asset failed: ' + filename, error);
    });
  }

  private prepareMaterial(material: THREE.Material, cache: Map<THREE.Material, THREE.Material>): THREE.Material {
    const found = cache.get(material);
    if (found) return found;
    const clone = material.clone();
    cache.set(material, clone);
    if (clone instanceof THREE.MeshStandardMaterial) {
      const name = clone.name.toLowerCase();
      let tag: ModelTag | undefined;
      if (name.includes('lantern golden illumination')) tag = 'lantern';
      else if (name.includes('warm ivory rice paper')) tag = 'paper';
      else if (name.includes('aged imperial gilt') || name.includes('burnished pale gold')) tag = 'gold';
      else if (name.includes('celadon inset') || name.includes('jade inset')) tag = 'jade';
      else if (name.includes('teal still water') || name.includes('turquoise ripples')) tag = 'water';
      else if (name.includes('lotus center glowing')) tag = 'lotus';
      if (tag) this.tracked.push({ material: clone, tag, base: clone.color.clone() });
    }
    return clone;
  }
}

