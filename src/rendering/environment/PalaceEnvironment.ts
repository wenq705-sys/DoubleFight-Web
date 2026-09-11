import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import type { Direction } from '../../game/board/types';
import { ART } from '../../config/artDirection';

const gradient = (() => {
  const data = new Uint8Array([40, 92, 164, 255]);
  const texture = new THREE.DataTexture(data, 4, 1, THREE.RedFormat);
  texture.needsUpdate = true;
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  return texture;
})();

const C = {
  sky: 0xe6a878,
  jade: 0x6aa58d,
  jadeLight: 0x91c4aa,
  jadeDark: 0x35685e,
  lacquer: 0x8e2025,
  lacquerLight: 0xb43632,
  lacquerDark: 0x521418,
  gold: 0xe6ae38,
  goldDeep: 0x9f6418,
  goldLight: 0xffd66c,
  stone: 0xd8c5a6,
  stoneDark: 0x917d67,
  roof: 0xb7842c,
  roofDark: 0x6e4420,
  teal: 0x2f7f7b,
  peach: 0xef7d78,
  blossom: 0xf498a9,
  water: 0x3b9aa1,
  lantern: 0xffa63a,
};

const toon = (color: number) => new THREE.MeshToonMaterial({ color, gradientMap: gradient });
const emissive = (color: number, intensity: number) =>
  new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: intensity, roughness: 0.36 });

function add(
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

function box(
  parent: THREE.Object3D,
  size: [number, number, number],
  color: number,
  position: [number, number, number],
  radius = 0.08,
): THREE.Mesh {
  return add(
    parent,
    new RoundedBoxGeometry(size[0], size[1], size[2], 4, Math.min(radius, size[1] * 0.3)),
    toon(color),
    position,
  );
}

function cyl(
  parent: THREE.Object3D,
  radius: number,
  height: number,
  color: number,
  position: [number, number, number],
  segments = 14,
): THREE.Mesh {
  return add(parent, new THREE.CylinderGeometry(radius, radius, height, segments), toon(color), position);
}

function cone(
  parent: THREE.Object3D,
  radius: number,
  height: number,
  color: number,
  position: [number, number, number],
  segments = 14,
): THREE.Mesh {
  return add(parent, new THREE.ConeGeometry(radius, height, segments), toon(color), position);
}

interface SkillSpark {
  mesh: THREE.Mesh;
  life: number;
  maxLife: number;
  velocity: THREE.Vector3;
}

export class PalaceEnvironment {
  readonly root = new THREE.Group();

  private readonly lanternMaterials: THREE.MeshStandardMaterial[] = [];
  private readonly directionMaterials = new Map<Direction, THREE.MeshStandardMaterial>();
  private readonly directionPulse: Record<Direction, number> = { left: 0, right: 0, up: 0, down: 0 };
  private readonly petals: THREE.Mesh[] = [];
  private readonly banners: THREE.Group[] = [];
  private readonly sparks: SkillSpark[] = [];
  private gestureDirection: Direction | null = null;
  private gestureStrength = 0;
  private impactEnergy = 0;

  constructor() {
    this.root.name = 'PalaceEnvironment';
    this.createFoundation();
    this.createBoard();
    this.createRails();
    this.createPalace();
    this.createLanterns();
    this.createGarden();
    this.createPond();
    this.createBanners();
    this.createPetals();
  }

  setGesture(dx: number, dy: number, strength: number): void {
    if (strength <= 0.01) {
      this.clearGesture();
      return;
    }
    this.gestureDirection = Math.abs(dx) > Math.abs(dy)
      ? dx > 0 ? 'right' : 'left'
      : dy > 0 ? 'down' : 'up';
    this.gestureStrength = THREE.MathUtils.clamp(strength, 0, 1);
  }

  clearGesture(): void {
    this.gestureDirection = null;
    this.gestureStrength = 0;
  }

  pulseDirection(direction: Direction): void {
    this.directionPulse[direction] = 1;
  }

  impact(value: number, position: THREE.Vector3): void {
    this.impactEnergy = Math.max(this.impactEnergy, Math.min(1, 0.2 + Math.log2(value) * 0.06));
    const count = value >= 128 ? 8 : 4;
    for (let i = 0; i < count; i += 1) {
      const material = new THREE.MeshBasicMaterial({
        color: i % 2 ? C.goldLight : C.blossom,
        transparent: true,
        opacity: 0.85,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const spark = add(
        this.root,
        i % 2 ? new THREE.OctahedronGeometry(0.055, 0) : new THREE.PlaneGeometry(0.1, 0.07),
        material,
        [position.x, position.y + 0.75, position.z],
      );
      const angle = (i / count) * Math.PI * 2 + Math.random() * 0.3;
      const life = 0.5 + Math.random() * 0.22;
      this.sparks.push({
        mesh: spark,
        life,
        maxLife: life,
        velocity: new THREE.Vector3(Math.cos(angle) * 0.7, 0.7 + Math.random() * 0.6, Math.sin(angle) * 0.7),
      });
    }
  }

  skillPulse(): void {
    this.impactEnergy = 1;
    this.lanternMaterials.forEach((material) => { material.emissiveIntensity = 3.2; });
  }

  update(time: number, delta: number): void {
    this.impactEnergy *= Math.pow(0.035, delta);

    for (const [direction, material] of this.directionMaterials) {
      this.directionPulse[direction] *= Math.pow(0.02, delta);
      const gesture = this.gestureDirection === direction ? this.gestureStrength : 0;
      material.emissiveIntensity = 0.18 + gesture * 1.6 + this.directionPulse[direction] * 1.8 + this.impactEnergy * 0.45;
    }

    this.lanternMaterials.forEach((material, index) => {
      material.emissiveIntensity = 1.1 + Math.sin(time * 2.3 + index) * 0.14 + this.impactEnergy * 1.8;
    });

    this.banners.forEach((banner, index) => {
      banner.rotation.z = Math.sin(time * 1.8 + index * 0.8) * 0.022 + this.impactEnergy * 0.025;
    });

    this.petals.forEach((petal, index) => {
      petal.rotation.z += delta * (0.35 + (index % 3) * 0.12);
      petal.position.y += Math.sin(time * 0.9 + index) * 0.00055;
      petal.position.x += Math.sin(time * 0.45 + index * 0.7) * 0.0004;
    });

    for (let i = this.sparks.length - 1; i >= 0; i -= 1) {
      const spark = this.sparks[i];
      spark.life -= delta;
      spark.velocity.y -= delta * 1.9;
      spark.mesh.position.addScaledVector(spark.velocity, delta);
      spark.mesh.rotation.x += delta * 5;
      spark.mesh.rotation.z += delta * 4;
      const normalized = Math.max(0, spark.life / spark.maxLife);
      spark.mesh.scale.setScalar(Math.max(0.01, normalized));
      if (spark.mesh.material instanceof THREE.MeshBasicMaterial) spark.mesh.material.opacity = normalized;
      if (spark.life <= 0) {
        spark.mesh.removeFromParent();
        spark.mesh.geometry.dispose();
        const material = spark.mesh.material;
        if (Array.isArray(material)) material.forEach((entry) => entry.dispose());
        else material.dispose();
        this.sparks.splice(i, 1);
      }
    }
  }

  private createFoundation(): void {
    box(this.root, [13.7, 0.85, 14.3], C.stoneDark, [0, -0.95, 0.3], 0.3);
    box(this.root, [13.25, 0.62, 13.85], C.stone, [0, -0.55, 0.3], 0.28);
    box(this.root, [12.75, 0.28, 13.35], C.lacquerDark, [0, -0.17, 0.3], 0.2);
    box(this.root, [12.35, 0.18, 12.9], 0x8c9f70, [0, 0.03, 0.3], 0.18);
  }

  private createBoard(): void {
    box(this.root, [9.45, 0.25, 9.45], C.lacquer, [0, 0.23, ART.board.centerZ], 0.18);
    box(this.root, [9.15, 0.18, 9.15], C.gold, [0, 0.38, ART.board.centerZ], 0.14);
    box(this.root, [8.95, 0.13, 8.95], C.jadeDark, [0, 0.5, ART.board.centerZ], 0.12);

    for (let row = 0; row < 4; row += 1) {
      for (let col = 0; col < 4; col += 1) {
        const x = (col - 1.5) * ART.board.gap;
        const z = (row - 1.5) * ART.board.gap + ART.board.centerZ;
        box(this.root, [1.98, 0.1, 1.98], C.gold, [x, 0.57, z], 0.1);
        box(this.root, [1.82, 0.11, 1.82], (row + col) % 2 ? C.jade : C.jadeLight, [x, 0.64, z], 0.09);
      }
    }

    const makeGate = (direction: Direction, size: [number, number, number], pos: [number, number, number], color: number) => {
      const material = new THREE.MeshStandardMaterial({
        color,
        emissive: color,
        emissiveIntensity: 0.18,
        roughness: 0.34,
        metalness: 0.22,
      });
      this.directionMaterials.set(direction, material);
      add(this.root, new RoundedBoxGeometry(size[0], size[1], size[2], 4, 0.04), material, pos);
    };

    makeGate('left', [0.12, 0.05, 7.65], [-4.62, 0.72, ART.board.centerZ], C.teal);
    makeGate('right', [0.12, 0.05, 7.65], [4.62, 0.72, ART.board.centerZ], C.peach);
    makeGate('up', [7.65, 0.05, 0.12], [0, 0.72, -4.43], C.goldLight);
    makeGate('down', [7.65, 0.05, 0.12], [0, 0.72, 4.78], C.gold);
  }

  private createRails(): void {
    const railZ = [-5.05, 5.45];
    railZ.forEach((z) => {
      box(this.root, [11.0, 0.16, 0.14], C.lacquer, [0, 0.95, z], 0.04);
      for (let x = -5.25; x <= 5.25; x += 1.05) {
        cyl(this.root, 0.075, 0.82, C.lacquerDark, [x, 0.72, z], 10);
        sphereGold(this.root, [x, 1.16, z]);
      }
    });

    for (const x of [-5.38, 5.38]) {
      box(this.root, [0.14, 0.16, 10.4], C.lacquer, [x, 0.95, 0.2], 0.04);
      for (let z = -4.6; z <= 4.9; z += 1.06) {
        cyl(this.root, 0.075, 0.82, C.lacquerDark, [x, 0.72, z], 10);
        sphereGold(this.root, [x, 1.16, z]);
      }
    }
  }

  private createPalace(): void {
    const hall = new THREE.Group();
    hall.position.z = -6.2;
    this.root.add(hall);

    box(hall, [5.6, 1.55, 1.35], C.lacquerLight, [0, 1.0, 0], 0.1);
    for (const x of [-2.3, -1.15, 0, 1.15, 2.3]) {
      cyl(hall, 0.16, 2.25, C.lacquer, [x, 1.22, 0.55], 12);
    }

    // Tiered imperial roof.
    const roof1 = add(hall, new THREE.CylinderGeometry(0.8, 3.6, 0.55, 4), toon(C.roof), [0, 2.15, 0]);
    roof1.scale.z = 0.48;
    roof1.rotation.y = Math.PI / 4;
    const roof2 = add(hall, new THREE.CylinderGeometry(0.55, 2.6, 0.42, 4), toon(C.roofDark), [0, 2.55, 0]);
    roof2.scale.z = 0.5;
    roof2.rotation.y = Math.PI / 4;

    box(hall, [2.0, 0.5, 0.18], 0x244e62, [0, 1.7, 0.75], 0.05);
    box(hall, [1.72, 0.34, 0.08], C.gold, [0, 1.7, 0.86], 0.03);

    for (const x of [-1.85, 1.85]) {
      const material = emissive(C.lantern, 1.25);
      this.lanternMaterials.push(material);
      add(hall, new THREE.SphereGeometry(0.22, 12, 10), material, [x, 1.35, 0.82]);
    }

    box(hall, [1.1, 1.05, 0.12], C.roofDark, [0, 0.67, 0.72], 0.15);
  }

  private createLanterns(): void {
    const positions: [number, number][] = [
      [-4.95, -3.4], [4.95, -3.4], [-4.95, 2.9], [4.95, 2.9],
      [-4.3, 4.65], [4.3, 4.65],
    ];
    positions.forEach(([x, z], index) => {
      cyl(this.root, 0.05, 1.5, C.lacquerDark, [x, 1.25, z], 8);
      const material = emissive(index % 2 ? 0xff8e2b : C.lantern, 1.1);
      this.lanternMaterials.push(material);
      const lantern = add(this.root, new THREE.CylinderGeometry(0.22, 0.26, 0.5, 10), material, [x, 1.85, z]);
      lantern.castShadow = false;
      cone(this.root, 0.25, 0.18, C.roofDark, [x, 2.18, z], 10);
    });
  }

  private createGarden(): void {
    const treePositions: [number, number, number][] = [
      [-5.0, -4.0, 0.9], [5.0, -4.1, 0.85], [-5.0, 3.7, 0.8], [5.0, 3.65, 0.82],
    ];
    treePositions.forEach(([x, z, scale], treeIndex) => {
      const tree = new THREE.Group();
      tree.position.set(x, 0.2, z);
      tree.scale.setScalar(scale);
      this.root.add(tree);
      cyl(tree, 0.13, 1.25, 0x68402a, [0, 0.62, 0], 9);
      const branchCount = 5;
      for (let branch = 0; branch < branchCount; branch += 1) {
        const angle = (branch / branchCount) * Math.PI * 2;
        sphere(tree, 0.42, treeIndex % 2 ? 0xe98fa0 : C.blossom, [Math.cos(angle) * 0.4, 1.4 + (branch % 2) * 0.2, Math.sin(angle) * 0.4]);
      }
    });
  }

  private createPond(): void {
    const pond = add(
      this.root,
      new RoundedBoxGeometry(7.2, 0.08, 1.8, 4, 0.12),
      new THREE.MeshStandardMaterial({
        color: C.water,
        emissive: 0x1b666c,
        emissiveIntensity: 0.09,
        roughness: 0.2,
        transparent: true,
        opacity: 0.86,
      }),
      [0, -0.33, 6.15],
    );
    pond.castShadow = false;

    for (const x of [-2.6, -1.1, 1.4, 2.8]) {
      const pad = add(this.root, new THREE.CylinderGeometry(0.24, 0.28, 0.035, 12), toon(0x5d9c57), [x, -0.25, 6.05 + Math.sin(x) * 0.35]);
      pad.rotation.z = 0.05;
      sphere(this.root, 0.11, C.blossom, [x + 0.08, -0.12, 6.02 + Math.sin(x) * 0.35]);
    }
  }

  private createBanners(): void {
    const specs: [number, string][] = [[-5.7, '三千佳丽'], [5.7, '凤仪晋升']];
    specs.forEach(([x, text], index) => {
      const group = new THREE.Group();
      group.position.set(x, 2.0, 0);
      this.root.add(group);
      cyl(group, 0.045, 3.8, C.goldDeep, [0, 0, 0], 8);
      box(group, [0.72, 2.55, 0.05], C.lacquer, [index === 0 ? 0.38 : -0.38, 0, 0], 0.05);
      const texture = this.bannerTexture(text);
      const label = new THREE.Mesh(
        new THREE.PlaneGeometry(0.58, 2.35),
        new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false }),
      );
      label.position.set(index === 0 ? 0.38 : -0.38, 0, 0.031);
      group.add(label);
      this.banners.push(group);
    });
  }

  private createPetals(): void {
    for (let i = 0; i < 14; i += 1) {
      const material = new THREE.MeshBasicMaterial({
        color: i % 3 ? C.blossom : 0xffc0c8,
        transparent: true,
        opacity: 0.68,
        side: THREE.DoubleSide,
        depthWrite: false,
      });
      const petal = add(
        this.root,
        new THREE.PlaneGeometry(0.12 + (i % 3) * 0.02, 0.07),
        material,
        [((i * 2.9) % 11) - 5.5, 1.2 + (i % 5) * 0.55, ((i * 4.3) % 10) - 4.6],
      );
      petal.rotation.set(Math.random(), Math.random(), Math.random());
      petal.castShadow = false;
      this.petals.push(petal);
    }
  }

  private bannerTexture(text: string): THREE.CanvasTexture {
    const canvas = document.createElement('canvas');
    canvas.width = 192;
    canvas.height = 640;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Canvas2D required for palace banners.');
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.font = '900 54px "STKaiti","KaiTi","PingFang SC",serif';
    context.fillStyle = '#ffd66c';
    [...text].forEach((char, index) => context.fillText(char, 96, 118 + index * 115));
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  }
}

function sphere(
  parent: THREE.Object3D,
  radius: number,
  color: number,
  position: [number, number, number],
): THREE.Mesh {
  return add(parent, new THREE.SphereGeometry(radius, 12, 9), toon(color), position);
}

function sphereGold(parent: THREE.Object3D, position: [number, number, number]): void {
  const material = new THREE.MeshStandardMaterial({ color: C.gold, roughness: 0.26, metalness: 0.5 });
  add(parent, new THREE.SphereGeometry(0.09, 10, 8), material, position);
}
