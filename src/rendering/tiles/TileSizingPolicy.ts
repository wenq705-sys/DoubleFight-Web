import * as THREE from 'three';
import { ART } from '../../config/artDirection';
import { tierIndex, tierScale } from '../../config/tierProgression';
import type { TileVisual } from './TileFactory';

export interface TileVisualSizingProfile {
  horizontalLimit(value: number): number;
  minimumHeight(value: number): number;
}
const kingdomHeights = [1.05, 1.16, 1.82, 1.96, 2.12, 2.28, 2.46, 2.64, 2.83, 3.10, 3.55];
const kingdomFootprints = [1.20, 1.27, 1.38, 1.48, 1.58, 1.66, 1.73, 1.80, 1.86, 1.91, 1.94];
export const KINGDOM_SIZING: TileVisualSizingProfile = {
  horizontalLimit: value => kingdomFootprints[tierIndex(value)],
  minimumHeight: value => kingdomHeights[tierIndex(value)],
};
export const PALACE_SIZING: TileVisualSizingProfile = {
  horizontalLimit: value => tierScale(value, 1.60, 1.94),
  minimumHeight: value => tierScale(value, 1.90, 2.85),
};
export const MOTION_FOOTPRINT = ART.board.gap * 1.06;

/** Preserve authored dimensions until the horizontal silhouette exceeds its cell. */
export function fitTile(visual: TileVisual, value: number, profile = KINGDOM_SIZING): TileVisual {
  const model = visual.root;
  model.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(model);
  const swept = bounds.clone();
  // Measure decorative rotation, not a sphere that also counts height as width.
  for (const part of visual.animatedParts) {
    const rotation = part.rotation.clone();
    for (let step = 0; step < 24; step++) {
      part.rotation.y = step * Math.PI / 12;
      part.rotation.z = Math.sin(step) * 0.018;
      model.updateMatrixWorld(true);
      swept.union(new THREE.Box3().setFromObject(part));
    }
    part.rotation.copy(rotation);
  }
  const size = swept.getSize(new THREE.Vector3());
  const center = swept.getCenter(new THREE.Vector3());
  const horizontal = Math.min(1, profile.horizontalLimit(value) / Math.max(size.x, size.z, 0.001));
  const vertical = Math.max(1, profile.minimumHeight(value) / Math.max(bounds.max.y - bounds.min.y, 0.001));
  const fitting = new THREE.Group();
  fitting.scale.set(horizontal, vertical, horizontal);
  model.position.x -= center.x;
  model.position.y -= bounds.min.y;
  model.position.z -= center.z;
  fitting.add(model);
  const holder = new THREE.Group();
  holder.add(fitting);
  holder.userData.restFootprint = Math.max(size.x, size.z) * horizontal;
  holder.userData.visualHeight = size.y * vertical;
  return { root: holder, animatedParts: visual.animatedParts };
}

/** Limit current overshoot, never reserve peak animation space in the resting model. */
export function constrainTileMotion(root: THREE.Group): void {
  const yaw = Math.abs(Math.cos(root.rotation.y)) + Math.abs(Math.sin(root.rotation.y));
  const tilt = Math.max(Math.abs(root.rotation.x), Math.abs(root.rotation.z));
  const projectedHeight = root.userData.visualHeight * root.scale.y * Math.sin(tilt);
  const limit = Math.max(0.1, (MOTION_FOOTPRINT - projectedHeight) / (root.userData.restFootprint * yaw));
  root.scale.x = Math.min(root.scale.x, limit);
  root.scale.z = Math.min(root.scale.z, limit);
}
