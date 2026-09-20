import * as THREE from 'three';
import { tierScale } from '../../config/tierProgression';
import type { TileVisual } from './TileFactory';

const gradient = (() => {
  const data = new Uint8Array([40, 118, 180, 255]);
  const texture = new THREE.DataTexture(data, 4, 1, THREE.RedFormat);
  texture.needsUpdate = true;
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  return texture;
})();

const toon = (color: number) => new THREE.MeshToonMaterial({ color, gradientMap: gradient });
const metal = (color: number, emissive = 0) => new THREE.MeshStandardMaterial({
  color,
  roughness: 0.32,
  metalness: 0.36,
  ...(emissive ? { emissive: new THREE.Color(emissive), emissiveIntensity: 0.35 } : {}),
});

function mesh(parent: THREE.Object3D, geometry: THREE.BufferGeometry, material: THREE.Material, position: [number, number, number]): THREE.Mesh {
  const value = new THREE.Mesh(geometry, material);
  value.position.set(...position);
  value.castShadow = true;
  value.receiveShadow = true;
  parent.add(value);
  return value;
}
const sphere = (p: THREE.Object3D, r: number, c: number, pos: [number, number, number], seg = 10) =>
  mesh(p, new THREE.SphereGeometry(r, seg, Math.max(6, seg - 2)), toon(c), pos);
const box = (p: THREE.Object3D, size: [number, number, number], c: number, pos: [number, number, number], metallic = false) =>
  mesh(p, new THREE.BoxGeometry(...size), metallic ? metal(c) : toon(c), pos);
const cylinder = (p: THREE.Object3D, rt: number, rb: number, h: number, c: number, pos: [number, number, number], seg = 10, metallic = false) =>
  mesh(p, new THREE.CylinderGeometry(rt, rb, h, seg), metallic ? metal(c) : toon(c), pos);
const cone = (p: THREE.Object3D, r: number, h: number, c: number, pos: [number, number, number], seg = 10) =>
  mesh(p, new THREE.ConeGeometry(r, h, seg), toon(c), pos);

type Builder = (value: number) => TileVisual;

class CachedLaunchFactory {
  private readonly templates = new Map<number, THREE.Group>();
  constructor(private readonly builder: Builder) {}

  create(value: number): TileVisual {
    let template = this.templates.get(value);
    if (!template) {
      const built = this.builder(value);
      built.animatedParts.forEach(part => { part.userData.tileAnimated = true; });
      template = built.root;
      this.templates.set(value, template);
    }
    const root = template.clone(true);
    const animatedParts: THREE.Object3D[] = [];
    root.traverse(node => {
      if (node.userData.tileAnimated) animatedParts.push(node);
      if (node instanceof THREE.Mesh) node.frustumCulled = true;
    });
    return { root, animatedParts };
  }

  warmup(values: number[]): void {
    values.forEach(value => {
      if (this.templates.has(value)) return;
      const built = this.builder(value);
      built.animatedParts.forEach(part => { part.userData.tileAnimated = true; });
      this.templates.set(value, built.root);
    });
  }
}

const ZODIAC = {
  2: { body: 0x9c8d82, accent: 0xf2c4aa, kind: 'rat' },
  4: { body: 0xc94d3d, accent: 0xf2bd47, kind: 'rooster' },
  8: { body: 0xe7dfca, accent: 0xa88d70, kind: 'goat' },
  16: { body: 0xb56f46, accent: 0xf0c087, kind: 'monkey' },
  32: { body: 0xb98352, accent: 0x463428, kind: 'dog' },
  64: { body: 0x6e5149, accent: 0xe0b292, kind: 'boar' },
  128: { body: 0x3e8e72, accent: 0xe4c753, kind: 'snake' },
  256: { body: 0x8d4a35, accent: 0x2f2522, kind: 'horse' },
  512: { body: 0x5c4a3b, accent: 0xe6c256, kind: 'ox' },
  1024: { body: 0xf0ede3, accent: 0xd79b35, kind: 'tiger' },
  2048: { body: 0xd34b37, accent: 0xf2c64b, kind: 'dragon' },
} as const;

function buildZodiac(value: number): TileVisual {
  const cfg = ZODIAC[value as keyof typeof ZODIAC] ?? ZODIAC[2048];
  const root = new THREE.Group();
  const animatedParts: THREE.Object3D[] = [];
  cylinder(root, 0.86, 0.94, 0.18, value >= 512 ? 0xc7922f : 0x704a35, [0, 0.09, 0], 16, value >= 512);

  if (cfg.kind === 'snake') {
    const coil = mesh(root, new THREE.TorusGeometry(0.52, 0.15, 8, 24), toon(cfg.body), [0, 0.48, 0]);
    coil.rotation.x = Math.PI / 2;
    sphere(root, 0.28, cfg.body, [0.33, 0.88, 0.18], 10);
    sphere(root, 0.055, cfg.accent, [0.40, 0.94, 0.42], 7);
  } else if (cfg.kind === 'dragon') {
    for (let i = 0; i < 5; i += 1) {
      const part = sphere(root, 0.36 - i * 0.025, i % 2 ? cfg.body : 0xe05239, [-0.48 + i * 0.24, 0.66 + Math.sin(i * 0.8) * 0.16, -0.18 + i * 0.12], 10);
      part.userData.tileAnimated = true;
      animatedParts.push(part);
    }
    sphere(root, 0.42, cfg.body, [0.48, 1.04, 0.32], 11);
    for (const x of [0.28, 0.68]) {
      const horn = cone(root, 0.09, 0.46, cfg.accent, [x, 1.48, 0.24], 8);
      horn.rotation.z = x < 0.5 ? -0.22 : 0.22;
    }
    for (const side of [-1, 1]) {
      const whisker = mesh(root, new THREE.TorusGeometry(0.38, 0.018, 5, 24, Math.PI), metal(cfg.accent), [0.5, 0.98, 0.42 + side * 0.04]);
      whisker.rotation.z = side * 0.48;
      whisker.userData.tileAnimated = true;
      animatedParts.push(whisker);
    }
  } else {
    const bodyScale = value >= 512 ? 0.58 : value >= 64 ? 0.52 : 0.46;
    sphere(root, bodyScale, cfg.body, [0, 0.73, -0.08], 11);
    sphere(root, bodyScale * 0.72, cfg.body, [0, 1.18, 0.28], 10);

    if (cfg.kind === 'rat' || cfg.kind === 'monkey') {
      for (const x of [-0.26, 0.26]) sphere(root, cfg.kind === 'rat' ? 0.16 : 0.19, cfg.accent, [x, 1.38, 0.22], 9);
    }
    if (cfg.kind === 'dog') {
      for (const x of [-0.26, 0.26]) {
        const ear = cone(root, 0.15, 0.42, cfg.accent, [x, 1.42, 0.24], 7);
        ear.rotation.z = x < 0 ? 0.34 : -0.34;
      }
    }
    if (cfg.kind === 'rooster') {
      cone(root, 0.15, 0.32, cfg.accent, [0, 1.58, 0.20], 7);
      cone(root, 0.12, 0.28, 0xf0b431, [0, 1.18, 0.63], 7).rotation.x = Math.PI / 2;
      for (let i = -1; i <= 1; i += 1) {
        const feather = cone(root, 0.13, 0.66, i === 0 ? 0x276c78 : cfg.accent, [i * 0.14, 0.96, -0.58], 8);
        feather.rotation.x = -0.65;
      }
    }
    if (cfg.kind === 'goat' || cfg.kind === 'ox') {
      for (const side of [-1, 1]) {
        const horn = cone(root, cfg.kind === 'ox' ? 0.12 : 0.09, cfg.kind === 'ox' ? 0.58 : 0.42, cfg.accent, [side * 0.31, 1.51, 0.22], 8);
        horn.rotation.z = side * -0.54;
      }
    }
    if (cfg.kind === 'horse') {
      for (const x of [-0.19, 0.19]) cone(root, 0.11, 0.34, cfg.body, [x, 1.52, 0.24], 8);
      for (let i = 0; i < 4; i += 1) sphere(root, 0.11, cfg.accent, [0, 1.39 - i * 0.16, -0.16], 8);
    }
    if (cfg.kind === 'boar') {
      for (const x of [-0.23, 0.23]) {
        const tusk = cone(root, 0.06, 0.28, 0xf5e3bf, [x, 1.12, 0.62], 8);
        tusk.rotation.x = Math.PI / 2;
      }
    }
    if (cfg.kind === 'tiger') {
      for (const x of [-0.21, 0.21]) cone(root, 0.13, 0.3, cfg.accent, [x, 1.52, 0.22], 8);
      for (let i = -1; i <= 1; i += 1) box(root, [0.08, 0.5, 0.035], 0x3a2d29, [i * 0.18, 0.82, 0.42]);
      const halo = mesh(root, new THREE.TorusGeometry(0.68, 0.035, 8, 32), metal(cfg.accent, cfg.accent), [0, 1.0, -0.42]);
      halo.rotation.x = Math.PI / 2;
      halo.userData.tileAnimated = true;
      animatedParts.push(halo);
    }
    if (cfg.kind === 'rat' || cfg.kind === 'monkey' || cfg.kind === 'dog') {
      const tail = mesh(root, new THREE.TorusGeometry(0.42, 0.045, 7, 22, Math.PI * 1.3), toon(cfg.accent), [-0.15, 0.70, -0.45]);
      tail.rotation.x = Math.PI / 2;
      tail.userData.tileAnimated = true;
      animatedParts.push(tail);
    }
  }

  const tier = Math.max(1, Math.log2(Math.max(2, value)));
  root.scale.setScalar(tierScale(value, 0.72, 1.18));
  if (tier >= 9) {
    const aura = mesh(root, new THREE.TorusGeometry(0.9, 0.035, 8, 36), metal(cfg.accent, cfg.accent), [0, 0.58, 0]);
    aura.rotation.x = Math.PI / 2;
    aura.userData.tileAnimated = true;
    animatedParts.push(aura);
  }
  return { root, animatedParts };
}

const CANDY_COLORS = [0xff6f9c, 0xffc84c, 0x73d8ce, 0xa889e8, 0xff8b5d, 0x7ac36b, 0xffa8d6, 0x6eb7e8, 0xf27498, 0xa45cc5, 0xffcf50];

function buildCandy(value: number): TileVisual {
  const tier = Math.max(1, Math.log2(Math.max(2, value)));
  const index = Math.min(10, tier - 1);
  const color = CANDY_COLORS[index];
  const root = new THREE.Group();
  const animatedParts: THREE.Object3D[] = [];
  cylinder(root, 0.86, 0.94, 0.16, 0xffe6c3, [0, 0.08, 0], 18);

  if (index === 0) {
    box(root, [0.88, 0.88, 0.88], color, [0, 0.62, 0]);
  } else if (index === 1) {
    sphere(root, 0.52, color, [0, 0.72, 0], 12);
    for (const x of [-0.62, 0.62]) cone(root, 0.24, 0.36, 0xffffff, [x, 0.72, 0], 8).rotation.z = Math.PI / 2;
  } else if (index === 2) {
    sphere(root, 0.48, color, [0, 0.72, 0], 11);
    for (const x of [-0.27, 0.27]) sphere(root, 0.22, color, [x, 1.13, 0], 9);
  } else if (index === 3) {
    cylinder(root, 0.055, 0.055, 0.9, 0xffffff, [0, 0.55, 0], 7);
    const disc = cylinder(root, 0.52, 0.52, 0.16, color, [0, 1.15, 0], 20);
    disc.rotation.x = Math.PI / 2;
  } else if (index === 4) {
    const donut = mesh(root, new THREE.TorusGeometry(0.54, 0.23, 10, 28), toon(color), [0, 0.78, 0]);
    donut.rotation.x = Math.PI / 2;
  } else if (index === 5) {
    for (const y of [0.48, 0.72, 0.96]) cylinder(root, 0.5, 0.5, 0.18, y === 0.72 ? 0xfff3d7 : color, [0, y, 0], 20);
  } else if (index === 6) {
    cone(root, 0.45, 0.9, 0xd79b5d, [0, 0.56, 0], 12);
    sphere(root, 0.52, color, [0, 1.18, 0], 12);
  } else if (index === 7) {
    cylinder(root, 0.52, 0.42, 0.62, 0xf1b16d, [0, 0.58, 0], 16);
    sphere(root, 0.5, color, [0, 1.02, 0], 12);
    sphere(root, 0.13, 0xff4e68, [0, 1.46, 0], 9);
  } else {
    const floors = index - 6;
    for (let i = 0; i < floors; i += 1) {
      cylinder(root, 0.68 - i * 0.09, 0.72 - i * 0.09, 0.28, i % 2 ? 0xfff0d7 : color, [0, 0.44 + i * 0.29, 0], 20);
    }
    const topper = sphere(root, index === 10 ? 0.34 : 0.22, index === 10 ? 0xffcf50 : 0xff6f9c, [0, 0.52 + floors * 0.29, 0], 10);
    topper.userData.tileAnimated = true;
    animatedParts.push(topper);
    if (index >= 9) {
      const ring = mesh(root, new THREE.TorusGeometry(0.72, 0.035, 7, 32), metal(0xffcf50, 0xffcf50), [0, 1.22, 0]);
      ring.rotation.x = Math.PI / 2;
      ring.userData.tileAnimated = true;
      animatedParts.push(ring);
    }
  }
  root.scale.setScalar(tierScale(value, 0.78, 1.18));
  return { root, animatedParts };
}

function roof(parent: THREE.Object3D, width: number, y: number, color: number): THREE.Mesh {
  const value = cone(parent, width * 0.72, width * 0.55, color, [0, y, 0], 4);
  value.rotation.y = Math.PI / 4;
  return value;
}

function buildDreamhouse(value: number): TileVisual {
  const tier = Math.max(1, Math.log2(Math.max(2, value)));
  const index = Math.min(10, tier - 1);
  const root = new THREE.Group();
  const animatedParts: THREE.Object3D[] = [];
  const wall = [0xc99b6c, 0xc6a86f, 0xf0d6a5, 0xf1e3c7, 0xd7e6e9, 0xf0ca9a, 0xf4e1c7, 0xe9d7b0, 0xf1eee0, 0xe2edf2, 0xf3e0aa][index];
  const accent = [0x87533d, 0x6f8b66, 0xc96e4d, 0x4d8aa6, 0x6b7e91, 0x9a603e, 0x5b8f74, 0x7d5b8c, 0x486f86, 0x4f7298, 0xb17b32][index];

  cylinder(root, 0.78, 0.88, 0.15, 0x7da66f, [0, 0.075, 0], 18);
  if (index === 0) {
    box(root, [1.05, 0.72, 0.88], wall, [0, 0.48, 0]);
    box(root, [0.42, 0.5, 0.04], accent, [0, 0.47, 0.46]);
  } else if (index === 1) {
    const tent = cone(root, 0.78, 1.15, wall, [0, 0.66, 0], 4);
    tent.rotation.y = Math.PI / 4;
    box(root, [0.36, 0.48, 0.04], accent, [0, 0.45, 0.54]);
  } else {
    const floors = index >= 8 ? 3 : index >= 4 ? 2 : 1;
    const width = index >= 7 ? 1.38 : index >= 4 ? 1.18 : 1.06;
    for (let floor = 0; floor < floors; floor += 1) {
      box(root, [width - floor * 0.08, 0.58, 0.92], floor % 2 ? 0xf7efe1 : wall, [0, 0.48 + floor * 0.58, 0]);
      for (const x of [-0.32, 0.32]) {
        const window = box(root, [0.20, 0.20, 0.035], 0x79b8cf, [x, 0.52 + floor * 0.58, 0.48]);
        if (index >= 8) {
          window.userData.tileAnimated = true;
          animatedParts.push(window);
        }
      }
    }
    roof(root, width, 0.9 + floors * 0.58, accent);
    box(root, [0.26, 0.44, 0.05], 0x744a36, [0, 0.36, 0.49]);
    if (index >= 5) {
      for (const x of [-0.78, 0.78]) {
        cylinder(root, 0.07, 0.09, 0.52, 0x76543a, [x, 0.38, 0], 7);
        sphere(root, 0.30, index >= 8 ? 0x65a878 : 0x79b86e, [x, 0.86, 0], 9);
      }
    }
    if (index >= 7) {
      const pool = box(root, [1.25, 0.08, 0.42], 0x5fc1d6, [0, 0.18, -0.76]);
      pool.userData.tileAnimated = true;
      animatedParts.push(pool);
    }
    if (index >= 9) {
      const beacon = mesh(root, new THREE.TorusGeometry(0.62, 0.035, 7, 32), metal(0xf0bd4c, 0xf0bd4c), [0, 1.15 + floors * 0.58, 0]);
      beacon.rotation.x = Math.PI / 2;
      beacon.userData.tileAnimated = true;
      animatedParts.push(beacon);
    }
  }

  root.scale.setScalar(tierScale(value, 0.76, 1.18));
  return { root, animatedParts };
}

export class ZodiacTileFactory extends CachedLaunchFactory {
  constructor() { super(buildZodiac); }
}
export class CandyTileFactory extends CachedLaunchFactory {
  constructor() { super(buildCandy); }
}
export class DreamhouseTileFactory extends CachedLaunchFactory {
  constructor() { super(buildDreamhouse); }
}
