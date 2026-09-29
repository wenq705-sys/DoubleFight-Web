/** Backward-compatible night-market adapter. Future themes use ArtThemeAssetLoader directly. */
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import {
  isNativeArtThemeRuntime, canLoadArtThemeModels, loadArtThemeGLB,
} from './ArtThemeAssetLoader';

export const isNativeNightMarketRuntime = isNativeArtThemeRuntime;
export const canLoadNightMarketModels = canLoadArtThemeModels;
export function loadNightMarketGLB(
  loader: GLTFLoader, relativePath: string,
  onLoad: (gltf: GLTF) => void, onError: (error: unknown) => void,
): void {
  loadArtThemeGLB(loader,'nightmarket',relativePath,onLoad,onError);
}
