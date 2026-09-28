import * as THREE from 'three';

// Douyin must use one material path on Helium/WebGL1 and real-device WebGL2.
// Running different shaders made device-only theme failures impossible to
// reproduce in the IDE. Keep this hook for callers/tests, but rendering no
// longer forks on context version.
export function configureRuntimeMaterials(_webgl2: boolean): void {}

export function isLegacyWebGl1Materials(): boolean {
  return true;
}

export interface ToonMaterialOptions {
  color: THREE.ColorRepresentation;
  gradientMap?: THREE.Texture;
  transparent?: boolean;
  opacity?: number;
}

export function createToonMaterial(options: ToonMaterialOptions): THREE.MeshLambertMaterial {
  // Gradient maps are a MeshToonMaterial detail. Lambert gives the same
  // authored palette and lighting contract through a shader path that is
  // stable on both Douyin WebGL1 and WebGL2.
  const { gradientMap: _gradientMap, ...common } = options;
  return new THREE.MeshLambertMaterial(common);
}
