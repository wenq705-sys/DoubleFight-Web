import * as THREE from 'three';
import { THEME_PRESENTATIONS } from './ThemePresentation';
import { fitTile } from '../tiles/TileSizingPolicy';
import { THEME_IDS, type ThemeId } from '../../config/themes';

const previews = new Map<ThemeId, string>();

function generateThemePreview(theme: ThemeId): string {
  const cached = previews.get(theme);
  if (cached) return cached;
  const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
  renderer.setSize(384, 384);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xfff2d9, 0x526775, 2.5));
  const sun = new THREE.DirectionalLight(0xffe2b3, 3);
  sun.position.set(-3, 6, 5); scene.add(sun);
  const camera = new THREE.OrthographicCamera(-2.25, 2.25, 2.25, -2.25, 0.1, 30);
  camera.position.set(4, 4.8, 8); camera.lookAt(0, 1.6, 0);
  const adapter = THEME_PRESENTATIONS[theme];
  const model = fitTile(adapter.factory.create(2048), 2048, adapter.sizing).root;
  scene.add(model);
  renderer.render(scene, camera);
  const dataUrl = renderer.domElement.toDataURL();
  previews.set(theme, dataUrl);
  renderer.dispose();
  renderer.forceContextLoss();
  return dataUrl;
}

export function loadThemePreviews(onReady: (theme: ThemeId, dataUrl: string) => void): () => void {
  let index = 0;
  let cancelled = false;
  let idleHandle: number | null = null;
  let timerHandle: ReturnType<typeof setTimeout> | null = null;

  const schedule = (callback: () => void) => {
    if (cancelled) return;
    if ('requestIdleCallback' in window) {
      idleHandle = window.requestIdleCallback(() => {
        idleHandle = null;
        callback();
      }, { timeout: 800 });
    } else {
      timerHandle = setTimeout(() => {
        timerHandle = null;
        callback();
      }, 32);
    }
  };

  const next = () => {
    if (cancelled || index >= THEME_IDS.length) return;
    const theme = THEME_IDS[index++];
    onReady(theme, generateThemePreview(theme));
    schedule(next);
  };

  schedule(next);
  return () => {
    cancelled = true;
    if (idleHandle !== null) window.cancelIdleCallback(idleHandle);
    if (timerHandle !== null) window.clearTimeout(timerHandle);
  };
}
