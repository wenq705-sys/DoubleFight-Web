import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { ART } from '../../config/artDirection';

const C = ART.colors;
const gradient = (() => {
  const data = new Uint8Array([48, 112, 184, 255]);
  const texture = new THREE.DataTexture(data, 4, 1, THREE.RedFormat);
  texture.needsUpdate = true;
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  return texture;
})();

const toon = (color: number) => new THREE.MeshToonMaterial({ color, gradientMap: gradient });
const standard = (color: number, roughness = 0.72, metalness = 0) =>
  new THREE.MeshStandardMaterial({ color, roughness, metalness });

function mesh(geometry: THREE.BufferGeometry, material: THREE.Material, parent: THREE.Object3D): THREE.Mesh {
  const value = new THREE.Mesh(geometry, material);
  value.castShadow = true;
  value.receiveShadow = true;
  parent.add(value);
  return value;
}

function roundedBox(
  parent: THREE.Object3D,
  size: [number, number, number],
  color: number,
  position: [number, number, number],
  radius = 0.12,
  metal = false,
): THREE.Mesh {
  const value = mesh(
    new RoundedBoxGeometry(size[0], size[1], size[2], 4, Math.min(radius, size[1] * 0.34)),
    metal ? standard(color, 0.3, 0.52) : toon(color),
    parent,
  );
  value.position.set(...position);
  return value;
}

function cylinder(
  parent: THREE.Object3D,
  radius: number,
  height: number,
  color: number,
  position: [number, number, number],
  segments = 20,
  metal = false,
): THREE.Mesh {
  const value = mesh(
    new THREE.CylinderGeometry(radius, radius, height, segments),
    metal ? standard(color, 0.3, 0.58) : toon(color),
    parent,
  );
  value.position.set(...position);
  return value;
}

function cone(
  parent: THREE.Object3D,
  radius: number,
  height: number,
  color: number,
  position: [number, number, number],
  segments = 20,
): THREE.Mesh {
  const value = mesh(new THREE.ConeGeometry(radius, height, segments), toon(color), parent);
  value.position.set(...position);
  return value;
}

function sphere(parent: THREE.Object3D, radius: number, color: number, position: [number, number, number]): THREE.Mesh {
  const value = mesh(new THREE.SphereGeometry(radius, 18, 12), toon(color), parent);
  value.position.set(...position);
  return value;
}

function crystal(parent: THREE.Object3D, color: number, position: [number, number, number], scale: number): THREE.Mesh {
  const value = mesh(
    new THREE.OctahedronGeometry(scale, 0),
    new THREE.MeshStandardMaterial({
      color,
      emissive: color,
      emissiveIntensity: 0.18,
      roughness: 0.2,
      metalness: 0.08,
    }),
    parent,
  );
  value.position.set(...position);
  value.rotation.set(0.16, 0.35, 0.08);
  return value;
}

function numberTexture(value: number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 256;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas2D is required for number labels.');
  const fontSize = value >= 1024 ? 102 : value >= 128 ? 122 : 150;
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.font = `1000 ${fontSize}px ui-rounded, "Arial Rounded MT Bold", "Trebuchet MS", sans-serif`;
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.lineJoin = 'round';
  context.lineWidth = value >= 512 ? 11 : 14;
  context.strokeStyle = '#633d21';
  context.strokeText(String(value), 256, 132);
  context.fillStyle = value >= 512 ? '#fff8d8' : '#fff4c7';
  context.fillText(String(value), 256, 132);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

function addNumberBadge(parent: THREE.Object3D, value: number, y: number, z: number, scale = 1): void {
  const badgeColor = value >= 512 ? C.goldDeep : value >= 128 ? C.gold : C.cream;
  const badgeY = Math.min(y, 0.48);
  const badgeX = 0.5 * scale;
  const badge = cylinder(parent, 0.25 * scale, 0.075, badgeColor, [badgeX, badgeY, z], 20, value >= 128);
  badge.rotation.x = Math.PI / 2;
  const material = new THREE.MeshBasicMaterial({ map: numberTexture(value), transparent: true, depthWrite: false });
  const label = new THREE.Mesh(new THREE.PlaneGeometry(0.46 * scale, 0.3 * scale), material);
  label.position.set(badgeX, badgeY, z + 0.046);
  label.renderOrder = 20;
  parent.add(label);
}

function flag(parent: THREE.Object3D, color: number, x: number, z: number, height: number): THREE.Object3D {
  cylinder(parent, 0.035, height, C.woodDark, [x, height / 2, z], 8);
  const cloth = roundedBox(parent, [0.52, 0.3, 0.035], color, [x + 0.25, height - 0.24, z], 0.05);
  cloth.rotation.z = -0.07;
  return cloth;
}

function crown(parent: THREE.Object3D, y: number): void {
  roundedBox(parent, [1.04, 0.17, 0.34], C.goldDeep, [0, y, 0], 0.06, true);
  [-0.4, -0.2, 0, 0.2, 0.4].forEach((x, index) =>
    cone(parent, 0.13, index % 2 ? 0.34 : 0.5, C.gold, [x, y + (index % 2 ? 0.25 : 0.33), 0], 4),
  );
}

function crenels(parent: THREE.Object3D, radius: number, y: number, color: number, count = 8): void {
  for (let i = 0; i < count; i += 1) {
    const angle = (i / count) * Math.PI * 2;
    roundedBox(
      parent,
      [0.22, 0.22, 0.22],
      color,
      [Math.cos(angle) * radius, y, Math.sin(angle) * radius],
      0.05,
    );
  }
}

export interface TileVisual {
  root: THREE.Group;
  animatedParts: THREE.Object3D[];
}

export class TileFactory {
  private readonly templates = new Map<number, THREE.Group>();

  create(value: number): TileVisual {
    let template = this.templates.get(value);
    if (!template) {
      const built = this.build(value);
      built.animatedParts.forEach((part) => { part.userData.tileAnimated = true; });
      template = built.root;
      this.templates.set(value, template);
    }

    const root = template.clone(true);
    const animatedParts: THREE.Object3D[] = [];
    root.traverse((node) => {
      if (node.userData.tileAnimated) animatedParts.push(node);
      if (node instanceof THREE.Mesh) node.frustumCulled = true;
    });
    return { root, animatedParts };
  }

  warmup(values: number[]): void {
    values.forEach((value) => {
      if (!this.templates.has(value)) {
        const built = this.build(value);
        built.animatedParts.forEach((part) => { part.userData.tileAnimated = true; });
        this.templates.set(value, built.root);
      }
    });
  }

  private build(value: number): TileVisual {
    const root = new THREE.Group();
    const animatedParts: THREE.Object3D[] = [];

    cylinder(root, 0.91, 0.16, C.stoneShade, [0, 0.08, 0], 24);
    cylinder(root, 0.82, 0.07, C.cream, [0, 0.19, 0], 24);

    if (value <= 4) {
      const blue = value === 2;
      roundedBox(root, [1.48, 0.62, 1.48], blue ? C.wood : C.woodLight, [0, 0.5, 0], 0.18);
      roundedBox(root, [1.3, 0.12, 1.3], blue ? C.royalBlueLight : C.coralLight, [0, 0.84, 0], 0.08);
      for (const x of [-0.57, 0.57]) for (const z of [-0.57, 0.57]) sphere(root, 0.075, C.gold, [x, 0.84, z]);
      animatedParts.push(flag(root, blue ? C.royalBlue : C.coral, -0.45, -0.43, 1.18));
      addNumberBadge(root, value, 0.5, 0.765, 0.92);
    } else if (value === 8) {
      cylinder(root, 0.7, 0.78, C.stone, [0, 0.55, 0], 22);
      roundedBox(root, [1.48, 0.12, 1.48], C.stoneShade, [0, 0.94, 0], 0.06);
      cone(root, 0.84, 0.72, C.royalBlueLight, [0, 1.34, 0], 22);
      animatedParts.push(flag(root, C.royalBlue, 0, 0, 1.88));
      addNumberBadge(root, value, 0.61, 0.72, 0.88);
    } else if (value === 16) {
      roundedBox(root, [1.43, 0.86, 1.43], C.stone, [0, 0.58, 0], 0.14);
      for (const x of [-0.56, 0.56]) for (const z of [-0.56, 0.56]) {
        cylinder(root, 0.17, 0.82, C.stoneShade, [x, 0.69, z], 14);
        cone(root, 0.22, 0.28, z > 0 ? C.coralLight : C.royalBlueLight, [x, 1.24, z], 14);
      }
      roundedBox(root, [0.58, 0.58, 0.09], C.coral, [0, 0.69, 0.74], 0.07);
      addNumberBadge(root, value, 0.68, 0.805, 0.78);
    } else if (value === 32) {
      cylinder(root, 0.76, 0.9, C.wood, [0, 0.59, 0], 22);
      crenels(root, 0.66, 1.06, C.stone, 8);
      cone(root, 0.64, 0.6, C.royalBlue, [0, 1.42, 0], 20);
      sphere(root, 0.1, C.gold, [0, 1.75, 0]);
      addNumberBadge(root, value, 0.64, 0.79, 0.8);
    } else if (value === 64) {
      cylinder(root, 0.77, 0.96, C.stone, [0, 0.62, 0], 24);
      cylinder(root, 0.82, 0.13, C.gold, [0, 1.02, 0], 24, true);
      crenels(root, 0.68, 1.15, C.cream, 10);
      cone(root, 0.72, 0.67, C.royalBlue, [0, 1.55, 0], 22);
      animatedParts.push(flag(root, C.goldDeep, 0, 0, 2.08));
      addNumberBadge(root, value, 0.68, 0.8, 0.77);
    } else if (value === 128) {
      cylinder(root, 0.79, 0.77, C.cream, [0, 0.5, 0], 24);
      cylinder(root, 0.85, 0.14, C.gold, [0, 0.92, 0], 26, true);
      roundedBox(root, [1.35, 0.16, 1.35], C.royalBlueLight, [0, 1.04, 0], 0.07);
      animatedParts.push(crystal(root, C.crystalBlue, [0, 1.47, 0], 0.4));
      for (const x of [-0.52, 0.52]) sphere(root, 0.1, C.gold, [x, 1.14, 0]);
      addNumberBadge(root, value, 0.58, 0.81, 0.73);
    } else if (value === 256) {
      roundedBox(root, [1.56, 0.77, 1.56], C.purple, [0, 0.54, 0], 0.17);
      for (const x of [-0.58, 0.58]) for (const z of [-0.58, 0.58]) cylinder(root, 0.17, 0.84, C.goldDeep, [x, 0.72, z], 14, true);
      cylinder(root, 0.65, 0.13, C.gold, [0, 0.98, 0], 24, true);
      animatedParts.push(crystal(root, 0xdca0ff, [0, 1.48, 0], 0.43));
      addNumberBadge(root, value, 0.63, 0.83, 0.68);
    } else if (value === 512) {
      roundedBox(root, [1.62, 0.73, 1.62], C.stone, [0, 0.51, 0], 0.16);
      for (const x of [-0.59, 0.59]) for (const z of [-0.59, 0.59]) {
        cylinder(root, 0.19, 1.02, C.stoneShade, [x, 0.7, z], 16);
        cone(root, 0.29, 0.42, x + z > 0 ? C.coralLight : C.royalBlueLight, [x, 1.4, z], 16);
      }
      roundedBox(root, [1.18, 0.24, 1.18], C.royalBlue, [0, 1.04, 0], 0.08);
      crown(root, 1.29);
      addNumberBadge(root, value, 0.62, 0.86, 0.64);
    } else if (value === 1024) {
      roundedBox(root, [1.68, 0.82, 1.68], C.cream, [0, 0.56, 0], 0.18);
      for (const x of [-0.62, 0.62]) for (const z of [-0.62, 0.62]) {
        cylinder(root, 0.18, 1.02, C.goldDeep, [x, 0.72, z], 16, true);
        sphere(root, 0.12, C.gold, [x, 1.28, z]);
      }
      cylinder(root, 0.49, 0.82, C.royalBlue, [0, 1.04, 0], 18);
      cone(root, 0.56, 0.5, C.royalBlueLight, [0, 1.66, 0], 18);
      animatedParts.push(crystal(root, C.crystalBlue, [0, 2.0, 0], 0.28));
      addNumberBadge(root, value, 0.65, 0.89, 0.58);
    } else {
      cylinder(root, 0.88, 0.32, C.goldDeep, [0, 0.32, 0], 28, true);
      roundedBox(root, [1.72, 0.72, 1.72], C.gold, [0, 0.72, 0], 0.2, true);
      roundedBox(root, [1.45, 0.25, 1.45], C.coralLight, [0, 1.18, 0], 0.09);
      for (const x of [-0.54, 0.54]) for (const z of [-0.54, 0.54]) {
        cylinder(root, 0.15, 0.75, C.cream, [x, 1.25, z], 14);
        cone(root, 0.22, 0.34, z > 0 ? C.coral : C.royalBlue, [x, 1.78, z], 14);
      }
      crown(root, 1.68);
      animatedParts.push(crystal(root, 0xd79cff, [0, 2.48, 0], 0.37));
      const ring = mesh(new THREE.TorusGeometry(0.8, 0.04, 10, 56), standard(C.gold, 0.18, 0.75), root);
      ring.position.y = 2.13;
      ring.rotation.x = Math.PI / 2;
      animatedParts.push(ring);
      addNumberBadge(root, value, 0.83, 0.9, 0.58);
    }

    root.traverse((node: THREE.Object3D) => {
      if (node instanceof THREE.Mesh) node.frustumCulled = true;
    });
    return { root, animatedParts };
  }
}
