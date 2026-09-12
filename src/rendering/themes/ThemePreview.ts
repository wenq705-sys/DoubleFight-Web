import * as THREE from 'three';
import { THEME_PRESENTATIONS } from './ThemePresentation';
import { fitTile } from '../tiles/TileSizingPolicy';
import type { ThemeId } from '../../config/themes';

let previews: Record<ThemeId, string> | undefined;
/** Two cached images from the actual game factories, with no additional animation loop. */
export function themePreviews(): Record<ThemeId, string> {
  if (previews) return previews;
  const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
  renderer.setSize(512, 512);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xfff2d9, 0x526775, 2.5));
  const sun = new THREE.DirectionalLight(0xffe2b3, 3);
  sun.position.set(-3, 6, 5); scene.add(sun);
  const camera = new THREE.OrthographicCamera(-2.25, 2.25, 2.25, -2.25, 0.1, 30);
  camera.position.set(4, 4.8, 8); camera.lookAt(0, 1.6, 0);
  previews = {} as Record<ThemeId, string>;
  for (const theme of ['kingdom', 'palace'] as const) {
    const adapter = THEME_PRESENTATIONS[theme];
    const model = fitTile(adapter.factory.create(2048), 2048, adapter.sizing).root;
    scene.add(model); renderer.render(scene, camera);
    previews[theme] = renderer.domElement.toDataURL();
    scene.remove(model);
  }
  renderer.dispose(); renderer.forceContextLoss();
  return previews;
}
