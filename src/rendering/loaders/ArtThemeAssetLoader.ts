/// <reference types="vite/client" />
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { isArtTheme } from '../../config/artThemes.generated';

/**
 * THE shared 3D asset import port for browser + Douyin.
 *
 * Browser: /DoubleFight-Web/assets/themes/<themeId>/<manifest path>
 * Douyin: packaged assets/themes/<themeId>/<manifest path>, via tt FileSystemManager.
 * All models are self-contained binary GLB; no external image/texture URL.
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

export function isNativeArtThemeRuntime(): boolean {
  return typeof tt !== 'undefined' && typeof tt.getFileSystemManager === 'function';
}
export function canLoadArtThemeModels(): boolean {
  return isNativeArtThemeRuntime() || typeof window !== 'undefined';
}
function arrayBuffer(data: ArrayBuffer | ArrayBufferView | string): ArrayBuffer {
  if (data instanceof ArrayBuffer) return data;
  if (ArrayBuffer.isView(data))
    return data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer;
  throw new Error('Art pack did not return binary GLB: '+typeof data);
}
function assetPath(themeId: string, relativePath: string): string {
  if (!isArtTheme(themeId) || !relativePath || relativePath.startsWith('/') ||
      relativePath.includes('\\') || relativePath.split('/').some(x=>!x||x==='..'||x==='.')) {
    throw new Error('Invalid art-pack asset path: '+themeId+'/'+relativePath);
  }
  return 'assets/themes/'+themeId+'/'+relativePath;
}
export function loadArtThemeGLB(
  loader: GLTFLoader,
  themeId: string,
  relativePath: string,
  onLoad: (gltf: GLTF) => void,
  onError: (error: unknown) => void,
): void {
  let path: string;
  try{path=assetPath(themeId,relativePath)}
  catch(error){onError(error);return}
  if (isNativeArtThemeRuntime()) {
    tt!.getFileSystemManager!().readFile({
      filePath: path,
      success: result => {
        try{loader.parse(arrayBuffer(result.data),'',onLoad,onError)}
        catch(error){onError(error)}
      },
      fail: error => onError(new Error(path+': '+(error.errMsg??'package read failed'))),
    });
    return;
  }
  try{loader.load(import.meta.env.BASE_URL+path,onLoad,undefined,onError)}
  catch(error){onError(error)}
}
