/// <reference types="vite/client" />
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { normalizePieceValue } from '../../config/themes';
import type { TileVisual } from './TileFactory';

/**
 * Lazy, deduplicated GLB characters. The synchronous placeholder establishes the
 * exact fitTile measurement envelope; the authored character replaces it in-place.
 * No duplicate Board2048 logic and no per-spawn geometry decoding.
 */
const BASE = import.meta.env.BASE_URL + 'assets/themes/nightmarket/tiles/';
const PALETTE: Record<number, number> = {
  2: 0xc5e2bf, 4: 0xb87739, 8: 0xf39cb4, 16: 0x72b98e,
  32: 0x69c8d5, 64: 0x915ab7, 128: 0xe96e82, 256: 0xe9bd60,
  512: 0x90e8e9, 1024: 0xdde7f4, 2048: 0xee8054,
};
const PROXY = new THREE.BoxGeometry(1.48, 2.52, 1.43);
const PROXY_MATERIAL = new THREE.MeshBasicMaterial({ visible: false, depthWrite: false });
const LOADING_GEOMETRY = new THREE.OctahedronGeometry(0.28, 0);

export class NightMarketTileFactory {
  private readonly loader = new GLTFLoader();
  private readonly assets = new Map<number, Promise<THREE.Group | null>>();
  private readonly accents = new Map<number, THREE.MeshStandardMaterial>();

  warmup(values: number[]): void {
    // Lower levels are useful immediately; all other values are requested on demand.
    if (typeof window === 'undefined') return; // Node/Vitest must never fetch browser-relative GLBs.
    values.slice(0, 3).forEach(value => { void this.load(normalizePieceValue(value)); });
  }

  create(value: number): TileVisual {
    const level = normalizePieceValue(value);
    const tier = Math.max(0, Math.log2(level) - 1);
    const root = new THREE.Group();
    root.name = 'NightMarketCharacter_' + level;
    const envelope = new THREE.Mesh(PROXY, PROXY_MATERIAL);
    envelope.scale.y = 1 + tier * .05; // A deliberate increasing authored silhouette envelope.
    envelope.position.y = 2.52 * envelope.scale.y * .5;
    envelope.name = 'fixed tile sizing envelope | invisible';
    root.add(envelope);
    let accent = this.accents.get(level);
    if (!accent) {
      accent = new THREE.MeshStandardMaterial({
        color: PALETTE[level], emissive: PALETTE[level], emissiveIntensity: .31,
        roughness: .31, metalness: .18,
      });
      this.accents.set(level, accent);
    }
    const waiting = new THREE.Mesh(LOADING_GEOMETRY, accent);
    waiting.position.y = .52;
    waiting.name = 'temporary asynchronous loading glint';
    root.add(waiting);

    if (typeof window !== 'undefined') void this.load(level).then(source => {
      if (!source) return; // Remain playable even after a failed asset fetch.
      const model = source.clone(true);
      const bounds = new THREE.Box3().setFromObject(model);
      if (bounds.isEmpty()) return;
      const size = bounds.getSize(new THREE.Vector3());
      const center = bounds.getCenter(new THREE.Vector3());
      const scale = Math.min(
        1.48 / Math.max(.01, size.x),
        (2.43 + tier * .11) / Math.max(.01, size.y),
        1.44 / Math.max(.01, size.z),
      );
      model.scale.setScalar(scale);
      model.position.set(-center.x * scale, -bounds.min.y * scale + .015, -center.z * scale);
      model.name = 'authored mobile LOD ' + level;
      root.remove(waiting);
      root.add(model);
    });
    return { root, animatedParts: [] };
  }

  private load(level: number): Promise<THREE.Group | null> {
    if (typeof window === 'undefined') return Promise.resolve(null);
    const cached = this.assets.get(level);
    if (cached) return cached;
    const url = BASE + String(level).padStart(4, '0') + '.glb';
    const task = new Promise<THREE.Group | null>((resolve) => {
      this.loader.load(url, result => {
        const model = result.scene;
        model.traverse(node => {
          if (node instanceof THREE.Mesh) {
            node.castShadow = false; node.receiveShadow = false;
            node.frustumCulled = true;
          }
        });
        resolve(model);
      }, undefined, error => {
        console.warn('[NightMarket] Tile GLB unavailable:', level, error);
        resolve(null);
      });
    });
    this.assets.set(level, task);
    return task;
  }
}

