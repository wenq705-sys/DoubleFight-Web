import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { afterEach, describe, expect, it } from 'vitest';
import { configureRuntimeMaterials, createToonMaterial } from '../src/rendering/RuntimeMaterialPolicy';

afterEach(() => configureRuntimeMaterials(true));

describe('Douyin WebGL compatibility policy', () => {
  it('uses Lambert only on the WebGL1 compatibility path', () => {
    configureRuntimeMaterials(false);
    const material = createToonMaterial({ color: 0xffcc88 });
    expect(material).toBeInstanceOf(THREE.MeshLambertMaterial);
    expect(material).not.toBeInstanceOf(THREE.MeshToonMaterial);
    material.dispose();
  });

  it('keeps the production toon material on WebGL2', () => {
    configureRuntimeMaterials(true);
    const material = createToonMaterial({ color: 0xffcc88 });
    expect(material).toBeInstanceOf(THREE.MeshToonMaterial);
    material.dispose();
  });

  it('routes devtools to WebGL1 while real devices stay WebGL2-first', () => {
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
