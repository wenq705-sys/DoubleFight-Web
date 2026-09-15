export type TextureCanvasFactory = (width: number, height: number) => HTMLCanvasElement;

let runtimeFactory: TextureCanvasFactory | null = null;

/**
 * Runtime-neutral source for small 2D canvases used as Three.js textures.
 * Browser defaults to document.createElement('canvas'); Douyin installs a
 * factory backed by subsequent tt.createCanvas() calls (offscreen canvases).
 */
export function setTextureCanvasFactory(factory: TextureCanvasFactory | null): void {
  runtimeFactory = factory;
}

export function createTextureCanvas(width: number, height: number): HTMLCanvasElement {
  if (runtimeFactory) return runtimeFactory(width, height);
  if (typeof document === 'undefined') {
    throw new Error('Texture canvas factory is required outside the browser runtime.');
  }
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
}
