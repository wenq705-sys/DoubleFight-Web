import * as THREE from 'three';
import { ART } from '../../config/artDirection';
import { tierScale } from '../../config/tierProgression';
import type { TileVisual } from './TileFactory';

// Reserve room for the largest Solo squash/stretch and bounded move tilt.
export const MAX_MOTION_STRETCH = 1.34;
export const MAX_MOTION_TILT = 0.13;
export function tileFootprint(value: number): number {
  return tierScale(value, 0.54, 0.94) * ART.board.tileSize / MAX_MOTION_STRETCH;
}

/** Fit once per factory clone, never per frame. Motion acts on a separate outer holder. */
export function fitTile(visual: TileVisual, value: number): TileVisual {
  const model = visual.root;
  model.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(model);
  const center = bounds.getCenter(new THREE.Vector3());
  const swept = bounds.clone();
  for (const part of visual.animatedParts) {
    const box = new THREE.Box3().setFromObject(part);
    const pivot = part.getWorldPosition(new THREE.Vector3());
    const radius = box.getCenter(new THREE.Vector3()).distanceTo(pivot) + box.getSize(new THREE.Vector3()).length() / 2;
    swept.expandByPoint(new THREE.Vector3(pivot.x - radius, bounds.min.y, pivot.z - radius));
    swept.expandByPoint(new THREE.Vector3(pivot.x + radius, bounds.max.y, pivot.z + radius));
  }
  const x = Math.max(Math.abs(swept.min.x - center.x), Math.abs(swept.max.x - center.x));
  const z = Math.max(Math.abs(swept.min.z - center.z), Math.abs(swept.max.z - center.z));
  const radius = Math.hypot(x, z) + bounds.getSize(new THREE.Vector3()).y * Math.sin(MAX_MOTION_TILT);
  const scale = tileFootprint(value) / Math.max(0.001, 2 * radius);
  model.scale.multiplyScalar(scale);
  model.position.set(-center.x * scale, -bounds.min.y * scale, -center.z * scale);
  const holder = new THREE.Group();
  holder.add(model);
  holder.userData.footprint = tileFootprint(value);
  return { root: holder, animatedParts: visual.animatedParts };
}
