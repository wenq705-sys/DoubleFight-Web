import * as THREE from 'three';

let legacyWebGl1 = false;

export function configureRuntimeMaterials(webgl2: boolean): void {
  legacyWebGl1 = !webgl2;
}

export function isLegacyWebGl1Materials(): boolean {
  return legacyWebGl1;
}

export interface ToonMaterialOptions {
  color: THREE.ColorRepresentation;
  gradientMap?: THREE.Texture;
  transparent?: boolean;
  opacity?: number;
}

export function createToonMaterial(options: ToonMaterialOptions): THREE.MeshToonMaterial | THREE.MeshLambertMaterial {
  if (!legacyWebGl1) return new THREE.MeshToonMaterial(options);

  // Helium's WebGL1 path can expose OES_standard_derivatives as unavailable.
  // MeshToonMaterial then fails shader validation. Lambert keeps the same
  // palette/lighting contract without that extension and is only used on the
  // compatibility path; real WebGL2 devices retain the production toon look.
  const { gradientMap: _gradientMap, ...common } = options;
  return new THREE.MeshLambertMaterial(common);
}
