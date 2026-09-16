import { afterEach, describe, expect, it, vi } from 'vitest';
import { createTextureCanvas, setTextureCanvasFactory } from '../src/rendering/TextureCanvasFactory';

afterEach(() => setTextureCanvasFactory(null));

describe('runtime texture canvas factory', () => {
  it('uses the installed runtime canvas factory outside browser DOM assumptions', () => {
    const fake = { width: 0, height: 0 } as unknown as HTMLCanvasElement;
    const factory = vi.fn((width: number, height: number) => {
      fake.width = width;
      fake.height = height;
      return fake;
    });
    setTextureCanvasFactory(factory);
    const canvas = createTextureCanvas(192, 640);
    expect(canvas).toBe(fake);
    expect(factory).toHaveBeenCalledExactlyOnceWith(192, 640);
    expect(canvas.width).toBe(192);
    expect(canvas.height).toBe(640);
  });
});
