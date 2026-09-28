import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { configureRuntimeMaterials, createToonMaterial } from '../src/rendering/RuntimeMaterialPolicy';

describe('Douyin WebGL compatibility policy', () => {
  it('uses the same stable Lambert material on WebGL1 and WebGL2', () => {
    configureRuntimeMaterials(false);
    const webgl1 = createToonMaterial({ color: 0xffcc88 });
    configureRuntimeMaterials(true);
    const webgl2 = createToonMaterial({ color: 0xffcc88 });

    expect(webgl1).toBeInstanceOf(THREE.MeshLambertMaterial);
    expect(webgl2).toBeInstanceOf(THREE.MeshLambertMaterial);
    expect(webgl1).not.toBeInstanceOf(THREE.MeshToonMaterial);
    expect(webgl2).not.toBeInstanceOf(THREE.MeshToonMaterial);

    webgl1.dispose();
    webgl2.dispose();
  });

  it('keeps WebGL2-first context selection on real devices while material shaders stay unified', () => {
    const source = readFileSync(new URL('../platform/douyin/src/main.ts', import.meta.url), 'utf8');
    expect(source).toContain("runtimeInfo.platform === 'devtools'");
    expect(source).toContain("canvas.getContext('webgl'");
    expect(source).toContain("canvas.getContext('webgl2'");
    expect(source).toContain('configureRuntimeMaterials');
  });

  it('pins the last three.js line that still supports WebGL1', () => {
    const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
    expect(pkg.dependencies.three).toBe('0.162.0');
    expect(pkg.devDependencies['@types/three']).toBe('0.162.0');
  });
});
