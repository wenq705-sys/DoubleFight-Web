/// <reference types="vite/client" />
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';

/** Douyin package paths are relative to the mini-game project root (no URL prefix).
 * The browser instead loads the same GLB files from Vite's public asset tree.
 * All night-market GLBs are self-contained: vertex colors, no external image URLs.
 */
declare const tt: {
  getFileSystemManager?: () => {
    readFile(options: {
      filePath: string;
      success: (response: { data: ArrayBuffer | ArrayBufferView | string }) => void;
      fail: (error: { errMsg?: string }) => void;
    }): void;
  };
} | undefined;

export function isNativeNightMarketRuntime(): boolean {
  return typeof tt !== 'undefined' && typeof tt.getFileSystemManager === 'function';
}
export function canLoadNightMarketModels(): boolean {
  return isNativeNightMarketRuntime() || typeof window !== 'undefined';
}
function bytes(data: ArrayBuffer | ArrayBufferView | string): ArrayBuffer {
  if (data instanceof ArrayBuffer) return data;
  if (ArrayBuffer.isView(data)) {
    return data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer;
  }
  throw new Error('Douyin returned non-binary GLB data: ' + typeof data);
}
export function loadNightMarketGLB(
  loader: GLTFLoader,
  relativePath: string,
  onLoad: (gltf: GLTF) => void,
  onError: (error: unknown) => void,
): void {
  if (isNativeNightMarketRuntime()) {
    const localPath = 'assets/nightmarket/' + relativePath;
    tt!.getFileSystemManager!().readFile({
      filePath: localPath,
      success: result => {
        try { loader.parse(bytes(result.data), '', onLoad, onError); }
        catch (error) { onError(error); }
      },
      fail: error => onError(new Error(localPath + ': ' + (error.errMsg ?? 'read failed'))),
    });
    return;
  }
  const url = import.meta.env.BASE_URL + 'assets/themes/nightmarket/' + relativePath;
  try { loader.load(url, onLoad, undefined, onError); }
  catch (error) { onError(error); }
}

