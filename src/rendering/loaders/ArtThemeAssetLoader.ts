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
/** The Douyin Helium runtime does not consistently expose Web TextDecoder.
 * GLTFLoader 0.162 instantiates it unconditionally even for texture-free GLBs. */
function ensureUtf8Decoder(): void {
  if (typeof globalThis.TextDecoder === 'function') return;
  class MiniUtf8Decoder {
    decode(input?: ArrayBuffer | ArrayBufferView): string {
      if (!input) return '';
      const bytes = input instanceof ArrayBuffer
        ? new Uint8Array(input)
        : new Uint8Array(input.buffer, input.byteOffset, input.byteLength);
      const parts: string[] = [];
      for (let i = 0; i < bytes.length;) {
        const x = bytes[i++];
        let cp = x;
        if (x >= 0xc2 && x < 0xe0) cp = ((x & 31) << 6) | (bytes[i++] & 63);
        else if (x >= 0xe0 && x < 0xf0) cp = ((x & 15) << 12) | ((bytes[i++] & 63) << 6) | (bytes[i++] & 63);
        else if (x >= 0xf0 && x < 0xf5) cp = ((x & 7) << 18) | ((bytes[i++] & 63) << 12) | ((bytes[i++] & 63) << 6) | (bytes[i++] & 63);
        else if (x >= 0x80) cp = 0xfffd;
        if (cp > 0xffff) { cp -= 0x10000; parts.push(String.fromCharCode(0xd800 + (cp >> 10), 0xdc00 + (cp & 1023))); }
        else parts.push(String.fromCharCode(cp));
      }
      return parts.join('');
    }
  }
  (globalThis as typeof globalThis & { TextDecoder: typeof TextDecoder }).TextDecoder =
    MiniUtf8Decoder as unknown as typeof TextDecoder;
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
        try{ensureUtf8Decoder();loader.parse(arrayBuffer(result.data),'',onLoad,onError)}
        catch(error){onError(error)}
      },
      fail: error => onError(new Error(path+': '+(error.errMsg??'package read failed'))),
    });
    return;
  }
  try{loader.load(import.meta.env.BASE_URL+path,onLoad,undefined,onError)}
  catch(error){onError(error)}
}
