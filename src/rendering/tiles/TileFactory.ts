import * as THREE from 'three';
import { ART } from '../../config/artDirection';

const C = ART.colors;
const gradient = (() => {
  const data = new Uint8Array([55, 125, 205, 255]);
  const texture = new THREE.DataTexture(data, 4, 1, THREE.RedFormat);
  texture.needsUpdate = true;
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  return texture;
})();

const toon = (color: number) => new THREE.MeshToonMaterial({ color, gradientMap: gradient });
const standard = (color: number, roughness = 0.7, metalness = 0) => new THREE.MeshStandardMaterial({ color, roughness, metalness });

function mesh(geometry: THREE.BufferGeometry, material: THREE.Material, parent: THREE.Object3D): THREE.Mesh {
  const value = new THREE.Mesh(geometry, material);
  value.castShadow = true;
  value.receiveShadow = true;
  parent.add(value);
  return value;
}

function box(parent: THREE.Object3D, size: [number, number, number], color: number, position: [number, number, number], metal = false): THREE.Mesh {
  const value = mesh(new THREE.BoxGeometry(...size), metal ? standard(color, 0.35, 0.55) : toon(color), parent);
  value.position.set(...position);
  return value;
}

function cylinder(parent: THREE.Object3D, radius: number, height: number, color: number, position: [number, number, number], segments = 16, metal = false): THREE.Mesh {
  const value = mesh(new THREE.CylinderGeometry(radius, radius, height, segments), metal ? standard(color, 0.32, 0.6) : toon(color), parent);
  value.position.set(...position);
  return value;
}

function cone(parent: THREE.Object3D, radius: number, height: number, color: number, position: [number, number, number], segments = 16): THREE.Mesh {
  const value = mesh(new THREE.ConeGeometry(radius, height, segments), toon(color), parent);
  value.position.set(...position);
  return value;
}

function crystal(parent: THREE.Object3D, color: number, position: [number, number, number], scale: number): THREE.Mesh {
  const value = mesh(new THREE.OctahedronGeometry(scale, 0), new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.22, roughness: 0.18, metalness: 0.08 }), parent);
  value.position.set(...position);
  value.rotation.set(0.2, 0.35, 0.12);
  return value;
}

function numberTexture(value: number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 256;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas2D is required for number labels.');
  const fontSize = value >= 1024 ? 86 : value >= 128 ? 104 : 128;
  context.font = `900 ${fontSize}px ui-rounded, "Arial Rounded MT Bold", "Trebuchet MS", sans-serif`;
  context.textAlign = 'center'; context.textBaseline = 'middle'; context.lineJoin = 'round';
  context.lineWidth = value >= 512 ? 17 : 20; context.strokeStyle = '#5a351d';
  context.strokeText(String(value), 256, 132);
  context.fillStyle = value >= 512 ? '#fff7cf' : '#fff1bb';
  context.fillText(String(value), 256, 132);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

function addNumber(parent: THREE.Object3D, value: number, y: number, scale = 1): void {
  const material = new THREE.MeshBasicMaterial({ map: numberTexture(value), transparent: true, depthWrite: false });
  const label = new THREE.Mesh(new THREE.PlaneGeometry(1.55 * scale, 0.76 * scale), material);
  label.position.set(0, y, 0.9);
  label.rotation.x = -Math.PI / 2;
  label.renderOrder = 12;
  parent.add(label);
}

function flag(parent: THREE.Object3D, color: number, x: number, z: number, height: number): void {
  cylinder(parent, 0.04, height, C.woodDark, [x, height / 2, z], 8);
  const cloth = box(parent, [0.52, 0.32, 0.035], color, [x + 0.26, height - 0.25, z]);
  cloth.rotation.z = -0.08;
}

function crown(parent: THREE.Object3D, y: number): void {
  box(parent, [1.1, 0.18, 0.32], C.goldDeep, [0, y, 0], true);
  [-0.42, -0.2, 0, 0.2, 0.42].forEach((x, index) => cone(parent, 0.14, index % 2 ? 0.38 : 0.58, C.gold, [x, y + (index % 2 ? 0.27 : 0.37), 0], 4));
}

export interface TileVisual { root: THREE.Group; animatedParts: THREE.Object3D[]; }

export class TileFactory {
  create(value: number): TileVisual {
    const root = new THREE.Group();
    const animatedParts: THREE.Object3D[] = [];
    cylinder(root, 0.94, 0.18, C.stoneShade, [0, 0.09, 0], 20);

    if (value <= 4) {
      box(root, [1.55, 0.64, 1.55], value === 2 ? 0xb9723d : 0xc88f59, [0, 0.48, 0]);
      box(root, [1.34, 0.11, 1.34], value === 2 ? C.royalBlueLight : C.coralLight, [0, 0.85, 0]);
      flag(root, value === 2 ? C.royalBlue : C.coral, -0.48, -0.42, 1.18);
      addNumber(root, value, 0.91);
    } else if (value === 8) {
      cylinder(root, 0.74, 0.77, C.stone, [0, 0.5, 0], 16);
      cone(root, 0.88, 0.78, C.royalBlueLight, [0, 1.28, 0], 16);
      flag(root, C.royalBlue, 0, 0, 1.92); addNumber(root, value, 1.01);
    } else if (value === 16) {
      box(root, [1.48, 0.82, 1.48], C.stone, [0, 0.56, 0]);
      for (const x of [-0.57, 0.57]) for (const z of [-0.57, 0.57]) cylinder(root, 0.18, 0.72, C.stoneShade, [x, 0.73, z], 12);
      box(root, [0.54, 0.56, 0.08], C.coral, [0, 0.7, 0.77]); addNumber(root, value, 1.03);
    } else if (value === 32) {
      cylinder(root, 0.79, 0.86, C.wood, [0, 0.54, 0], 16);
      for (let i = 0; i < 8; i += 1) { const a = i * Math.PI / 4; box(root, [0.23, 0.24, 0.23], C.stone, [Math.cos(a) * 0.67, 1, Math.sin(a) * 0.67]); }
      cone(root, 0.64, 0.62, C.royalBlue, [0, 1.35, 0], 16); addNumber(root, value, 1.04);
    } else if (value === 64) {
      cylinder(root, 0.79, 0.94, C.stone, [0, 0.58, 0], 18);
      cylinder(root, 0.84, 0.14, C.gold, [0, 0.98, 0], 20, true);
      cone(root, 0.74, 0.72, C.royalBlue, [0, 1.46, 0], 18); flag(root, C.goldDeep, 0, 0, 2.14); addNumber(root, value, 1.08);
    } else if (value === 128) {
      cylinder(root, 0.82, 0.76, C.stone, [0, 0.48, 0], 20); cylinder(root, 0.87, 0.15, C.gold, [0, 0.91, 0], 22, true);
      animatedParts.push(crystal(root, C.crystalBlue, [0, 1.36, 0], 0.42)); addNumber(root, value, 1.03, 0.92);
    } else if (value === 256) {
      box(root, [1.62, 0.72, 1.62], C.purple, [0, 0.51, 0]); [-0.62, 0.62].forEach((x) => cylinder(root, 0.19, 0.82, C.goldDeep, [x, 0.7, 0], 12, true));
      cylinder(root, 0.68, 0.15, C.gold, [0, 0.94, 0], 20, true); animatedParts.push(crystal(root, 0xd98cff, [0, 1.44, 0], 0.45)); addNumber(root, value, 1.08, 0.9);
    } else if (value === 512) {
      box(root, [1.7, 0.72, 1.7], C.stone, [0, 0.5, 0]);
      for (const x of [-0.62, 0.62]) for (const z of [-0.62, 0.62]) { cylinder(root, 0.21, 1.02, C.stoneShade, [x, 0.68, z], 12); cone(root, 0.3, 0.45, x + z > 0 ? C.coral : C.royalBlue, [x, 1.38, z], 12); }
      crown(root, 1.27); addNumber(root, value, 1.07, 0.86);
    } else if (value === 1024) {
      box(root, [1.74, 0.8, 1.74], C.cream, [0, 0.54, 0]);
      for (const x of [-0.64, 0.64]) for (const z of [-0.64, 0.64]) cylinder(root, 0.2, 1, C.goldDeep, [x, 0.7, z], 12, true);
      cylinder(root, 0.52, 0.85, C.royalBlue, [0, 1, 0], 12); animatedParts.push(crystal(root, C.crystalBlue, [0, 1.72, 0], 0.34)); addNumber(root, value, 1.14, 0.8);
    } else {
      box(root, [1.82, 0.7, 1.82], C.gold, [0, 0.48, 0], true); box(root, [1.5, 0.29, 1.5], C.coral, [0, 0.93, 0]); crown(root, 1.29);
      animatedParts.push(crystal(root, 0xc879ff, [0, 2.02, 0], 0.42));
      const ring = mesh(new THREE.TorusGeometry(0.82, 0.045, 10, 56), standard(C.gold, 0.2, 0.75), root); ring.position.y = 1.72; ring.rotation.x = Math.PI / 2; animatedParts.push(ring);
      addNumber(root, value, 1.1, 0.79);
    }

    root.traverse((node: THREE.Object3D) => { if (node instanceof THREE.Mesh) node.frustumCulled = false; });
    return { root, animatedParts };
  }
}
