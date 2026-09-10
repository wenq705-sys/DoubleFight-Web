import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { ART } from '../../config/artDirection';

const C = ART.colors;
const gradient = (() => {
  const data = new Uint8Array([44, 112, 188, 255]);
  const texture = new THREE.DataTexture(data, 4, 1, THREE.RedFormat);
  texture.needsUpdate = true;
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  return texture;
})();

const toon = (color: number) => new THREE.MeshToonMaterial({ color, gradientMap: gradient });
const standard = (color: number, roughness = 0.78, metalness = 0) =>
  new THREE.MeshStandardMaterial({ color, roughness, metalness });

function addMesh(
  parent: THREE.Object3D,
  geometry: THREE.BufferGeometry,
  material: THREE.Material,
  position: [number, number, number],
): THREE.Mesh {
  const value = new THREE.Mesh(geometry, material);
  value.position.set(...position);
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
): THREE.Mesh {
  return addMesh(
    parent,
    new RoundedBoxGeometry(size[0], size[1], size[2], 4, Math.min(radius, size[1] * 0.34)),
    toon(color),
    position,
  );
}

const cyl = (
  p: THREE.Object3D,
  r: number,
  h: number,
  c: number,
  pos: [number, number, number],
  seg = 18,
) => addMesh(p, new THREE.CylinderGeometry(r, r, h, seg), toon(c), pos);
const cone = (
  p: THREE.Object3D,
  r: number,
  h: number,
  c: number,
  pos: [number, number, number],
  seg = 18,
) => addMesh(p, new THREE.ConeGeometry(r, h, seg), toon(c), pos);
const sphere = (p: THREE.Object3D, r: number, c: number, pos: [number, number, number]) =>
  addMesh(p, new THREE.SphereGeometry(r, 16, 10), toon(c), pos);

export class KingdomEnvironment {
  readonly root = new THREE.Group();
  readonly flags: THREE.Object3D[] = [];
  private readonly swayProps: THREE.Object3D[] = [];
  private readonly clouds: THREE.Group[] = [];
  private readonly water: THREE.Mesh;
  private impactEnergy = 0;

  constructor() {
    this.root.name = 'KingdomEnvironment';
    this.createIsland();
    this.createBoard();
    this.createWalls();
    this.createCastle();
    this.createTrees();
    this.createFlowers();
    this.createMountains();
    this.createFlags();
    this.createClouds();

    this.water = addMesh(
      this.root,
      new RoundedBoxGeometry(5.2, 0.08, 2.45, 4, 0.08),
      new THREE.MeshStandardMaterial({
        color: C.water,
        roughness: 0.18,
        transparent: true,
        opacity: 0.78,
      }),
      [0, -0.5, -6.35],
    );

    const bridge = new THREE.Group();
    bridge.position.set(0, -0.18, -6.28);
    this.root.add(bridge);
    for (let z = -0.9; z <= 0.9; z += 0.3) {
      const plank = roundedBox(bridge, [2.15, 0.14, 0.24], 0xe1ad69, [0, 0, z], 0.05);
      plank.rotation.y = Math.sin(z * 3.2) * 0.015;
    }
    for (const x of [-1.0, 1.0]) cyl(bridge, 0.04, 2.1, C.woodDark, [x, 0.07, 0], 8).rotation.x = Math.PI / 2;
  }

  impact(value: number): void {
    const tier = Math.max(1, Math.log2(value) - 1);
    this.impactEnergy = Math.max(this.impactEnergy, Math.min(1, 0.18 + tier * 0.075));
  }

  update(time: number): void {
    const impact = this.impactEnergy;
    this.impactEnergy *= 0.9;

    this.flags.forEach((flag, index) => {
      flag.rotation.z = -0.07 + Math.sin(time * 2.25 + index * 0.72) * (0.04 + impact * 0.08);
      flag.scale.x = 1 + Math.sin(time * 3.1 + index) * 0.025 + impact * 0.035;
    });

    this.swayProps.forEach((prop, index) => {
      prop.rotation.z = Math.sin(time * 1.3 + index * 0.63) * 0.018 + Math.sin(time * 8 + index) * impact * 0.03;
    });

    this.clouds.forEach((cloud, index) => {
      cloud.position.x += Math.sin(time * 0.22 + index) * 0.0008;
      cloud.position.y += Math.sin(time * 0.65 + index * 1.7) * 0.0006;
    });

    if (this.water.material instanceof THREE.MeshStandardMaterial) {
      this.water.material.opacity = 0.76 + Math.sin(time * 1.15) * 0.028;
    }
  }

  private createIsland(): void {
    roundedBox(this.root, [13.4, 0.96, 13.8], C.stoneShade, [0, -0.92, 0.72], 0.34);
    roundedBox(this.root, [12.85, 0.58, 13.25], C.grass, [0, -0.3, 0.72], 0.3);
    roundedBox(this.root, [11.55, 0.18, 11.28], C.grassLight, [0, 0.04, 0.56], 0.23);
    roundedBox(this.root, [4.15, 0.1, 1.5], C.cream, [0, 0.15, -5.1], 0.14);
  }

  private createBoard(): void {
    for (let row = 0; row < 4; row += 1) {
      for (let col = 0; col < 4; col += 1) {
        const x = (col - 1.5) * ART.board.gap;
        const z = (row - 1.5) * ART.board.gap + ART.board.centerZ;
        roundedBox(this.root, [2.06, 0.13, 2.06], C.stoneShade, [x, 0.1, z], 0.18);
        roundedBox(
          this.root,
          [1.88, 0.13, 1.88],
          (row + col) % 2 ? 0xb8df8b : 0xc8e9a1,
          [x, 0.19, z],
          0.16,
        );
      }
    }
  }

  private createWalls(): void {
    for (let x = -5.35; x <= 5.35; x += 1.07) {
      roundedBox(this.root, [0.82, 0.66, 0.64], C.stone, [x, 0.41, -5.32], 0.11);
      roundedBox(this.root, [0.82, 0.66, 0.64], C.stone, [x, 0.41, 6.58], 0.11);
    }
    for (let z = -4.25; z <= 5.55; z += 1.07) {
      roundedBox(this.root, [0.64, 0.66, 0.82], C.stone, [-5.35, 0.41, z], 0.11);
      roundedBox(this.root, [0.64, 0.66, 0.82], C.stone, [5.35, 0.41, z], 0.11);
    }
  }

  private createCastle(): void {
    const g = new THREE.Group();
    g.position.z = 6.15;
    this.root.add(g);

    roundedBox(g, [4.2, 1.9, 1.05], C.stone, [0, 1.02, 0], 0.16);
    roundedBox(g, [1.1, 2.75, 1.16], C.stone, [-1.85, 1.38, 0], 0.14);
    roundedBox(g, [1.1, 2.75, 1.16], C.stone, [1.85, 1.38, 0], 0.14);
    cyl(g, 0.72, 2.85, C.stone, [-2.78, 1.42, -0.04], 20);
    cyl(g, 0.72, 2.85, C.stone, [2.78, 1.42, -0.04], 20);

    cone(g, 0.85, 1.26, C.coralLight, [-2.78, 3.48, -0.04], 20);
    cone(g, 0.85, 1.26, C.royalBlueLight, [2.78, 3.48, -0.04], 20);
    cone(g, 0.78, 1.12, C.royalBlueLight, [0, 3.05, -0.04], 20);

    const door = roundedBox(g, [0.92, 1.25, 0.16], C.woodDark, [0, 0.69, -0.58], 0.22);
    door.castShadow = false;
    for (let x = -1.95; x <= 1.95; x += 0.65) roundedBox(g, [0.28, 0.31, 0.34], C.cream, [x, 2.1, -0.32], 0.05);

    for (const x of [-2.78, 0, 2.78]) sphere(g, 0.09, C.gold, [x, x === 0 ? 3.68 : 4.18, -0.04]);
  }

  private createTrees(): void {
    const positions: [number, number, number][] = [
      [-4.75, -3.92, 0.88], [4.72, -3.82, 0.94], [-4.82, 4.48, 0.9], [4.76, 4.55, 0.92],
      [-4.92, 1.2, 0.76], [4.98, 1.65, 0.82], [-3.95, -5.02, 0.65], [4.02, -5.0, 0.68],
    ];

    positions.forEach(([x, z, s], index) => {
      const g = new THREE.Group();
      g.position.set(x, 0.18, z);
      g.scale.setScalar(s);
      this.root.add(g);
      cyl(g, 0.13, 0.68, C.woodDark, [0, 0.34, 0], 9);
      const top = new THREE.Group();
      g.add(top);
      cone(top, 0.7, 1.22, index % 2 ? 0x68b95f : 0x73c66a, [0, 1.06, 0], 12);
      cone(top, 0.53, 0.98, 0x8bd579, [0, 1.58, 0], 12);
      sphere(top, 0.08, C.flowerYellow, [0.18, 1.25, 0.24]);
      this.swayProps.push(top);
    });
  }

  private createFlowers(): void {
    const specs: [number, number, number][] = [
      [-4.2, -1.8, C.flowerPink], [-4.55, -1.45, C.flowerYellow], [4.35, -1.65, C.flowerPink],
      [4.6, -1.25, C.flowerYellow], [-4.1, 3.25, C.flowerYellow], [4.15, 3.4, C.flowerPink],
    ];
    specs.forEach(([x, z, color], index) => {
      const g = new THREE.Group();
      g.position.set(x, 0.2, z);
      this.root.add(g);
      sphere(g, 0.12, color, [0, 0.12, 0]);
      sphere(g, 0.09, color, [0.13, 0.08, 0.03]);
      sphere(g, 0.09, color, [-0.12, 0.08, -0.02]);
      sphere(g, 0.055, C.cream, [0, 0.16, 0.02]);
      g.rotation.y = index * 0.7;
    });
  }

  private createMountains(): void {
    const a = new THREE.MeshToonMaterial({ color: 0xb5e4f7, transparent: true, opacity: 0.66 });
    const b = new THREE.MeshToonMaterial({ color: 0xc1e7d4, transparent: true, opacity: 0.56 });
    const positions: [number, number, number][] = [
      [-7.9, 2.8, 2.1], [-6.2, 5.5, 1.8], [6.55, 5.0, 2.2], [8.0, 2.0, 1.9], [-7.0, -1.2, 1.6], [7.1, -0.9, 1.55],
    ];
    positions.forEach(([x, z, s], index) => {
      const mountain = addMesh(this.root, new THREE.ConeGeometry(s, s * 3.2, 4), index % 2 ? a : b, [x, s * 1.12, z]);
      mountain.rotation.y = Math.PI / 4;
      mountain.castShadow = false;
    });
  }

  private createFlags(): void {
    const specs: [number, number, number][] = [
      [-4.98, -0.92, C.royalBlue], [4.98, -0.92, C.coral], [-4.98, 3.85, C.royalBlue], [4.98, 3.85, C.coral],
    ];
    specs.forEach(([x, z, color]) => {
      cyl(this.root, 0.04, 1.7, C.woodDark, [x, 0.98, z], 8);
      const cloth = roundedBox(this.root, [0.72, 0.4, 0.035], color, [x + 0.34, 1.57, z], 0.05);
      this.flags.push(cloth);
    });
  }

  private createClouds(): void {
    const specs: [number, number, number, number][] = [
      [-5.7, 7.4, 2.7, 0.88], [4.7, 8.1, 3.6, 1.08], [-1.2, 9.1, 7.2, 0.76],
    ];
    specs.forEach(([x, y, z, scale]) => {
      const g = new THREE.Group();
      g.position.set(x, y, z);
      g.scale.setScalar(scale);
      this.root.add(g);
      const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.72, depthWrite: false });
      [[0, 0, 0, 0.48], [0.5, 0.04, 0, 0.34], [-0.48, 0, 0.02, 0.31], [0.12, 0.2, 0, 0.38]].forEach(([px, py, pz, r]) => {
        const puff = new THREE.Mesh(new THREE.SphereGeometry(r, 14, 9), mat);
        puff.position.set(px, py, pz);
        puff.castShadow = false;
        g.add(puff);
      });
      this.clouds.push(g);
    });
  }
}
