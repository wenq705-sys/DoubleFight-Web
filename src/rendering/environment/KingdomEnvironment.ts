import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import type { Direction } from '../../game/board/types';
import { ART } from '../../config/artDirection';

const C = ART.colors;
const gradient = (() => {
  const data = new Uint8Array([42, 104, 178, 255]);
  const texture = new THREE.DataTexture(data, 4, 1, THREE.RedFormat);
  texture.needsUpdate = true;
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  return texture;
})();

const toon = (color: number) => new THREE.MeshToonMaterial({ color, gradientMap: gradient });
const standard = (color: number, roughness = 0.76, metalness = 0) =>
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
  parent: THREE.Object3D,
  radius: number,
  height: number,
  color: number,
  position: [number, number, number],
  segments = 18,
) => addMesh(parent, new THREE.CylinderGeometry(radius, radius, height, segments), toon(color), position);

const cone = (
  parent: THREE.Object3D,
  radius: number,
  height: number,
  color: number,
  position: [number, number, number],
  segments = 18,
) => addMesh(parent, new THREE.ConeGeometry(radius, height, segments), toon(color), position);

const sphere = (
  parent: THREE.Object3D,
  radius: number,
  color: number,
  position: [number, number, number],
) => addMesh(parent, new THREE.SphereGeometry(radius, 16, 10), toon(color), position);

interface EnergyMote {
  root: THREE.Group;
  start: THREE.Vector3;
  control: THREE.Vector3;
  end: THREE.Vector3;
  age: number;
  duration: number;
}

function numberTexture(value: number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas2D is required for kingdom number totems.');
  context.clearRect(0, 0, 256, 256);
  context.font = '1000 150px ui-rounded, "Arial Rounded MT Bold", sans-serif';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.lineJoin = 'round';
  context.lineWidth = 15;
  context.strokeStyle = '#4b2c1a';
  context.strokeText(String(value), 128, 135);
  context.fillStyle = '#ffe6a9';
  context.fillText(String(value), 128, 135);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export class KingdomEnvironment {
  readonly root = new THREE.Group();
  readonly flags: THREE.Object3D[] = [];

  private readonly swayProps: THREE.Object3D[] = [];
  private readonly clouds: THREE.Group[] = [];
  private readonly cellMaterials: THREE.MeshStandardMaterial[] = [];
  private readonly runeMaterials: THREE.MeshStandardMaterial[] = [];
  private readonly directionMaterials = new Map<Direction, THREE.MeshStandardMaterial>();
  private readonly directionPulse: Record<Direction, number> = { left: 0, right: 0, up: 0, down: 0 };
  private readonly castleWindowMaterials: THREE.MeshStandardMaterial[] = [];
  private readonly energyMotes: EnergyMote[] = [];
  private readonly water: THREE.Mesh;
  private impactEnergy = 0;
  private castlePulse = 0;
  private gestureDirection: Direction | null = null;
  private gestureStrength = 0;

  constructor() {
    this.root.name = 'KingdomEnvironment';
    this.createIsland();
    this.createBoard();
    this.createEnergyNetwork();
    this.createWalls();
    this.createCastle();
    this.createVillage();
    this.createTrees();
    this.createFlowers();
    this.createLanterns();
    this.createNumberTotems();
    this.createMountains();
    this.createFlags();
    this.createClouds();

    this.water = addMesh(
      this.root,
      new RoundedBoxGeometry(5.5, 0.09, 2.65, 4, 0.08),
      new THREE.MeshStandardMaterial({
        color: C.water,
        emissive: 0x0f6f8a,
        emissiveIntensity: 0.08,
        roughness: 0.12,
        transparent: true,
        opacity: 0.86,
      }),
      [0, -0.49, 6.4],
    );

    const bridge = new THREE.Group();
    bridge.position.set(0, -0.15, 6.26);
    this.root.add(bridge);
    for (let z = -0.98; z <= 0.98; z += 0.28) {
      const plank = roundedBox(bridge, [2.25, 0.15, 0.22], C.woodLight, [0, 0, z], 0.045);
      plank.rotation.y = Math.sin(z * 3.4) * 0.018;
    }
    for (const x of [-1.03, 1.03]) {
      const rail = cyl(bridge, 0.045, 2.2, C.woodDark, [x, 0.13, 0], 8);
      rail.rotation.x = Math.PI / 2;
    }
  }

  setGesture(dx: number, dy: number, strength: number): void {
    if (strength <= 0.01) {
      this.gestureDirection = null;
      this.gestureStrength = 0;
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
    const tier = Math.max(1, Math.log2(value) - 1);
    this.impactEnergy = Math.max(this.impactEnergy, Math.min(1, 0.2 + tier * 0.07));
    this.castlePulse = Math.max(this.castlePulse, value >= 512 ? 1 : value >= 128 ? 0.72 : 0.38);

    const moteCount = value >= 512 ? 3 : value >= 128 ? 2 : 1;
    const color = value >= 512 ? C.gold : value >= 128 ? C.crystalBlue : C.coralLight;
    for (let index = 0; index < moteCount; index += 1) {
      const root = new THREE.Group();
      const head = addMesh(
        root,
        new THREE.SphereGeometry(0.085 + index * 0.012, 10, 8),
        new THREE.MeshBasicMaterial({
          color,
          transparent: true,
          opacity: 0.92,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        }),
        [0, 0, 0],
      );
      head.castShadow = false;
      const halo = addMesh(
        root,
        new THREE.SphereGeometry(0.17 + index * 0.015, 10, 8),
        new THREE.MeshBasicMaterial({
          color,
          transparent: true,
          opacity: 0.18,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        }),
        [0, 0, 0],
      );
      halo.castShadow = false;
      this.root.add(root);

      const start = position.clone().add(new THREE.Vector3((index - (moteCount - 1) / 2) * 0.12, 0.66, 0));
      const end = new THREE.Vector3((index - (moteCount - 1) / 2) * 0.12, 3.45, -5.92);
      const control = start.clone().lerp(end, 0.48);
      control.y += 2.4 + index * 0.22;
      const duration = 0.62 + index * 0.08;
      root.position.copy(start);
      this.energyMotes.push({ root, start, control, end, age: 0, duration });
    }
  }

  update(time: number, delta: number): void {
    const impact = this.impactEnergy;
    this.impactEnergy *= Math.pow(0.035, delta);
    this.castlePulse *= Math.pow(0.075, delta);

    this.flags.forEach((flag, index) => {
      flag.rotation.z = -0.07 + Math.sin(time * 2.35 + index * 0.72) * (0.045 + impact * 0.08);
      flag.scale.x = 1 + Math.sin(time * 3.25 + index) * 0.025 + impact * 0.04;
    });

    this.swayProps.forEach((prop, index) => {
      prop.rotation.z =
        Math.sin(time * 1.35 + index * 0.63) * 0.022 +
        Math.sin(time * 9 + index) * impact * 0.045;
    });

    this.clouds.forEach((cloud, index) => {
      cloud.position.x += Math.sin(time * 0.2 + index) * 0.0009;
      cloud.position.y += Math.sin(time * 0.62 + index * 1.7) * 0.00065;
    });

    this.cellMaterials.forEach((material, index) => {
      const phase = Math.sin(time * 1.7 + index * 0.45) * 0.012;
      material.emissiveIntensity = 0.025 + phase + impact * 0.12;
    });

    this.runeMaterials.forEach((material, index) => {
      material.emissiveIntensity = 0.22 + Math.sin(time * 2.2 + index) * 0.08 + impact * 0.8;
    });

    (Object.keys(this.directionPulse) as Direction[]).forEach((direction) => {
      this.directionPulse[direction] *= Math.pow(0.025, delta);
      const material = this.directionMaterials.get(direction);
      if (!material) return;
      const gesture = this.gestureDirection === direction ? this.gestureStrength : 0;
      material.emissiveIntensity = 0.16 + gesture * 1.25 + this.directionPulse[direction] * 1.55 + impact * 0.18;
    });

    this.castleWindowMaterials.forEach((material, index) => {
      material.emissiveIntensity =
        0.62 + Math.sin(time * 2.5 + index * 0.7) * 0.09 + this.castlePulse * 2.7;
    });

    for (let index = this.energyMotes.length - 1; index >= 0; index -= 1) {
      const mote = this.energyMotes[index];
      mote.age += delta;
      const t = THREE.MathUtils.clamp(mote.age / mote.duration, 0, 1);
      const oneMinus = 1 - t;
      mote.root.position
        .copy(mote.start)
        .multiplyScalar(oneMinus * oneMinus)
        .add(mote.control.clone().multiplyScalar(2 * oneMinus * t))
        .add(mote.end.clone().multiplyScalar(t * t));
      const scale = 0.65 + Math.sin(t * Math.PI) * 0.7;
      mote.root.scale.setScalar(scale);
      if (t >= 1) {
        mote.root.traverse((node) => {
          if (!(node instanceof THREE.Mesh)) return;
          node.geometry.dispose();
          const material = node.material;
          if (Array.isArray(material)) material.forEach((entry) => entry.dispose());
          else material.dispose();
        });
        mote.root.removeFromParent();
        this.energyMotes.splice(index, 1);
        this.castlePulse = Math.max(this.castlePulse, 1);
      }
    }

    if (this.water.material instanceof THREE.MeshStandardMaterial) {
      this.water.material.opacity = 0.84 + Math.sin(time * 1.25) * 0.035;
      this.water.material.emissiveIntensity = 0.07 + impact * 0.16;
    }
  }

  private createIsland(): void {
    roundedBox(this.root, [13.9, 0.92, 14.15], C.stoneDark, [0, -1.12, 0.35], 0.36);
    roundedBox(this.root, [13.45, 0.72, 13.75], C.stoneShade, [0, -0.72, 0.35], 0.34);
    roundedBox(this.root, [12.95, 0.55, 13.25], C.grassDark, [0, -0.34, 0.35], 0.3);
    roundedBox(this.root, [12.55, 0.28, 12.8], C.grass, [0, -0.08, 0.35], 0.26);
    roundedBox(this.root, [10.3, 0.12, 10.15], C.moss, [0, 0.06, 0.28], 0.22);
    roundedBox(this.root, [9.75, 0.13, 9.55], C.grassLight, [0, 0.14, 0.28], 0.2);
  }

  private createBoard(): void {
    roundedBox(this.root, [9.45, 0.24, 9.35], C.woodDark, [0, 0.2, ART.board.centerZ], 0.25);
    roundedBox(this.root, [9.12, 0.18, 9.02], C.stoneShade, [0, 0.35, ART.board.centerZ], 0.22);

    for (let row = 0; row < 4; row += 1) {
      for (let col = 0; col < 4; col += 1) {
        const x = (col - 1.5) * ART.board.gap;
        const z = (row - 1.5) * ART.board.gap + ART.board.centerZ;
        roundedBox(this.root, [2.0, 0.11, 2.0], C.wood, [x, 0.43, z], 0.16);
        const material = new THREE.MeshStandardMaterial({
          color: (row + col) % 2 ? 0x8fc95f : 0xa6d96f,
          emissive: C.grassDark,
          emissiveIntensity: 0.025,
          roughness: 0.82,
        });
        this.cellMaterials.push(material);
        addMesh(
          this.root,
          new RoundedBoxGeometry(1.82, 0.12, 1.82, 4, 0.15),
          material,
          [x, 0.51, z],
        );
        sphere(this.root, 0.035, C.gold, [x - 0.76, 0.6, z - 0.76]);
        sphere(this.root, 0.035, C.gold, [x + 0.76, 0.6, z + 0.76]);
      }
    }
  }

  private createEnergyNetwork(): void {
    const makeGate = (
      direction: Direction,
      size: [number, number, number],
      position: [number, number, number],
      color: number,
    ) => {
      const material = new THREE.MeshStandardMaterial({
        color,
        emissive: color,
        emissiveIntensity: 0.16,
        roughness: 0.36,
        metalness: 0.18,
      });
      this.directionMaterials.set(direction, material);
      addMesh(this.root, new RoundedBoxGeometry(size[0], size[1], size[2], 4, 0.05), material, position);
    };

    makeGate('left', [0.12, 0.05, 7.55], [-4.55, 0.58, ART.board.centerZ], C.royalBlue);
    makeGate('right', [0.12, 0.05, 7.55], [4.55, 0.58, ART.board.centerZ], C.coral);
    makeGate('up', [7.55, 0.05, 0.12], [0, 0.58, -4.18], C.teal);
    makeGate('down', [7.55, 0.05, 0.12], [0, 0.58, 4.54], C.gold);

    const runePositions: [number, number][] = [[-4.35, -4.0], [4.35, -4.0], [-4.35, 4.38], [4.35, 4.38]];
    runePositions.forEach(([x, z], index) => {
      const color = index % 2 ? C.coralLight : C.crystalBlue;
      const material = new THREE.MeshStandardMaterial({
        color,
        emissive: color,
        emissiveIntensity: 0.24,
        roughness: 0.26,
        metalness: 0.25,
      });
      this.runeMaterials.push(material);
      const ring = addMesh(this.root, new THREE.TorusGeometry(0.28, 0.055, 8, 24), material, [x, 0.62, z]);
      ring.rotation.x = Math.PI / 2;
      const gem = addMesh(this.root, new THREE.OctahedronGeometry(0.16, 0), material, [x, 0.82, z]);
      gem.rotation.y = index * 0.5;
    });
  }

  private createWalls(): void {
    const wallZTop = -5.36;
    const wallZBottom = 5.72;
    for (let x = -5.38; x <= 5.38; x += 1.08) {
      roundedBox(this.root, [0.84, 0.66, 0.68], C.stone, [x, 0.46, wallZTop], 0.1);
      roundedBox(this.root, [0.84, 0.66, 0.68], C.stone, [x, 0.46, wallZBottom], 0.1);
      if (Math.abs(x) < 4.8) {
        roundedBox(this.root, [0.46, 0.12, 0.34], C.brick, [x, 0.84, wallZTop + 0.02], 0.05);
        roundedBox(this.root, [0.46, 0.12, 0.34], C.brick, [x, 0.84, wallZBottom - 0.02], 0.05);
      }
    }
    for (let z = -4.3; z <= 4.7; z += 1.08) {
      roundedBox(this.root, [0.68, 0.66, 0.84], C.stone, [-5.38, 0.46, z], 0.1);
      roundedBox(this.root, [0.68, 0.66, 0.84], C.stone, [5.38, 0.46, z], 0.1);
    }
  }

  private createCastle(): void {
    const g = new THREE.Group();
    g.position.z = -5.82;
    this.root.add(g);

    roundedBox(g, [4.25, 1.86, 1.06], C.brick, [0, 1.02, 0], 0.17);
    roundedBox(g, [3.85, 1.66, 1.1], C.stone, [0, 1.08, 0.02], 0.17);
    roundedBox(g, [1.1, 2.65, 1.18], C.stone, [-1.86, 1.4, 0], 0.15);
    roundedBox(g, [1.1, 2.65, 1.18], C.stone, [1.86, 1.4, 0], 0.15);
    cyl(g, 0.72, 2.8, C.stoneShade, [-2.78, 1.42, 0], 20);
    cyl(g, 0.72, 2.8, C.stoneShade, [2.78, 1.42, 0], 20);

    cone(g, 0.86, 1.28, C.coral, [-2.78, 3.46, 0], 20);
    cone(g, 0.86, 1.28, C.royalBlue, [2.78, 3.46, 0], 20);
    cone(g, 0.8, 1.15, C.royalBlueLight, [0, 3.08, 0], 20);

    const door = roundedBox(g, [0.92, 1.2, 0.18], C.woodDark, [0, 0.7, 0.59], 0.22);
    door.castShadow = false;

    for (let x = -1.95; x <= 1.95; x += 0.65) {
      roundedBox(g, [0.3, 0.32, 0.35], C.cream, [x, 2.08, 0.35], 0.05);
    }

    const windowPositions: [number, number, number][] = [
      [-1.84, 1.5, 0.61], [1.84, 1.5, 0.61], [-2.78, 1.65, 0.73], [2.78, 1.65, 0.73],
    ];
    windowPositions.forEach((position) => {
      const material = new THREE.MeshStandardMaterial({
        color: 0xffc84d,
        emissive: 0xff9b2f,
        emissiveIntensity: 0.65,
        roughness: 0.3,
      });
      this.castleWindowMaterials.push(material);
      const window = addMesh(g, new RoundedBoxGeometry(0.24, 0.42, 0.05, 4, 0.06), material, position);
      window.castShadow = false;
    });

    const crestMaterial = new THREE.MeshStandardMaterial({
      color: C.crystalBlue,
      emissive: C.crystalBlue,
      emissiveIntensity: 1.15,
      roughness: 0.16,
      metalness: 0.06,
    });
    this.castleWindowMaterials.push(crestMaterial);
    const crest = addMesh(g, new THREE.OctahedronGeometry(0.24, 0), crestMaterial, [0, 3.45, 0.18]);
    crest.rotation.y = 0.4;
  }

  private createVillage(): void {
    const huts: [number, number, number, number][] = [
      [-4.65, -2.85, C.coral, 0.8],
      [4.62, -2.7, C.royalBlue, 0.82],
      [-4.62, 2.82, C.royalBlue, 0.72],
      [4.65, 2.98, C.coral, 0.76],
    ];
    huts.forEach(([x, z, roofColor, scale], index) => {
      const g = new THREE.Group();
      g.position.set(x, 0.32, z);
      g.scale.setScalar(scale);
      this.root.add(g);
      roundedBox(g, [1.0, 0.72, 0.9], index % 2 ? C.woodLight : C.wood, [0, 0.38, 0], 0.13);
      cone(g, 0.76, 0.72, roofColor, [0, 1.02, 0], 4).rotation.y = Math.PI / 4;
      roundedBox(g, [0.22, 0.38, 0.05], C.woodDark, [0, 0.35, 0.48], 0.05);
      sphere(g, 0.07, C.gold, [0.34, 0.56, 0.47]);
    });

    const stalls: [number, number, number][] = [[-4.25, 0.0, C.gold], [4.25, 0.15, C.teal]];
    stalls.forEach(([x, z, color]) => {
      const g = new THREE.Group();
      g.position.set(x, 0.28, z);
      this.root.add(g);
      roundedBox(g, [1.15, 0.12, 0.72], C.woodDark, [0, 0.18, 0], 0.05);
      roundedBox(g, [1.25, 0.12, 0.82], color, [0, 0.78, 0], 0.05);
      for (const px of [-0.48, 0.48]) cyl(g, 0.035, 0.72, C.woodDark, [px, 0.48, 0], 8);
    });
  }

  private createTrees(): void {
    const positions: [number, number, number][] = [
      [-5.0, -4.0, 0.84], [5.0, -3.9, 0.9], [-5.05, 4.15, 0.84], [5.05, 4.1, 0.88],
      [-5.16, 1.6, 0.7], [5.16, 1.75, 0.74], [-3.9, 5.0, 0.58], [3.95, 5.0, 0.62],
    ];
    positions.forEach(([x, z, scale], index) => {
      const g = new THREE.Group();
      g.position.set(x, 0.18, z);
      g.scale.setScalar(scale);
      this.root.add(g);
      cyl(g, 0.13, 0.68, C.woodDark, [0, 0.34, 0], 9);
      const top = new THREE.Group();
      g.add(top);
      cone(top, 0.72, 1.24, index % 2 ? C.grassDark : C.moss, [0, 1.04, 0], 12);
      cone(top, 0.54, 0.98, C.grass, [0, 1.65, 0], 12);
      this.swayProps.push(top);
    });
  }

  private createFlowers(): void {
    const flowers: [number, number, number][] = [
      [-3.95, -3.95, C.flowerPink], [-4.12, -3.65, C.flowerYellow], [3.98, -3.92, C.flowerYellow],
      [4.18, -3.62, C.flowerPink], [-4.08, 3.72, C.crystalBlue], [4.08, 3.7, C.flowerPink],
      [-3.7, 4.55, C.flowerYellow], [3.68, 4.58, C.crystalBlue],
    ];
    flowers.forEach(([x, z, color], index) => {
      const g = new THREE.Group();
      g.position.set(x, 0.24, z);
      this.root.add(g);
      cyl(g, 0.025, 0.25, C.grassDark, [0, 0.12, 0], 7);
      sphere(g, 0.095, color, [0, 0.29, 0]);
      this.swayProps.push(g);
      g.rotation.y = index * 0.4;
    });
  }

  private createLanterns(): void {
    const specs: [number, number][] = [[-4.58, -1.2], [4.58, -1.2], [-4.58, 1.55], [4.58, 1.55]];
    specs.forEach(([x, z]) => {
      cyl(this.root, 0.045, 0.74, C.woodDark, [x, 0.73, z], 8);
      const material = new THREE.MeshStandardMaterial({
        color: C.gold,
        emissive: 0xff8d22,
        emissiveIntensity: 0.85,
        roughness: 0.26,
      });
      this.castleWindowMaterials.push(material);
      addMesh(this.root, new THREE.SphereGeometry(0.13, 10, 8), material, [x, 1.14, z]);
    });
  }

  private createNumberTotems(): void {
    const specs: [number, number, number, number][] = [
      [2, -4.72, 4.72, C.royalBlue],
      [4, 4.72, 4.72, C.coral],
      [8, -4.7, -4.68, C.teal],
      [16, 4.7, -4.68, C.gold],
    ];
    specs.forEach(([value, x, z, color], index) => {
      const g = new THREE.Group();
      g.position.set(x, 0.2, z);
      g.rotation.y = z < 0 ? Math.PI : 0;
      g.scale.setScalar(index < 2 ? 0.72 : 0.64);
      this.root.add(g);
      cyl(g, 0.36, 0.34, C.stoneShade, [0, 0.17, 0], 16);
      roundedBox(g, [0.68, 0.68, 0.18], color, [0, 0.72, 0], 0.14);
      const label = new THREE.Mesh(
        new THREE.PlaneGeometry(0.58, 0.58),
        new THREE.MeshBasicMaterial({ map: numberTexture(value), transparent: true, depthWrite: false }),
      );
      label.position.set(0, 0.72, 0.1);
      g.add(label);
    });
  }

  private createMountains(): void {
    const a = new THREE.MeshToonMaterial({ color: 0x85c5d9, transparent: true, opacity: 0.7 });
    const b = new THREE.MeshToonMaterial({ color: 0x81bfa2, transparent: true, opacity: 0.63 });
    const positions: [number, number, number][] = [
      [-8.4, -2.8, 2.25], [-6.7, -5.6, 1.9], [7.0, -5.0, 2.3],
      [8.8, -2.0, 2.0], [-7.7, 1.0, 1.75], [7.8, 0.8, 1.7],
    ];
    positions.forEach(([x, z, scale], index) => {
      const mountain = addMesh(
        this.root,
        new THREE.ConeGeometry(scale, scale * 3.4, 4),
        index % 2 ? a : b,
        [x, scale * 1.14, z],
      );
      mountain.rotation.y = Math.PI / 4;
      mountain.castShadow = false;
    });
  }

  private createFlags(): void {
    const specs: [number, number, number][] = [
      [-5.05, -1.25, C.royalBlue], [5.05, -1.25, C.coral],
      [-5.05, 3.65, C.royalBlue], [5.05, 3.65, C.coral],
    ];
    specs.forEach(([x, z, color]) => {
      cyl(this.root, 0.05, 1.8, C.woodDark, [x, 1.04, z], 8);
      const flag = roundedBox(this.root, [0.78, 0.43, 0.035], color, [x + 0.38, 1.72, z], 0.04);
      this.flags.push(flag);
    });
  }

  private createClouds(): void {
    const specs: [number, number, number, number][] = [
      [-6.6, 4.3, 5.5, 0.72], [6.2, 5.1, 2.8, 0.58], [-5.0, 6.0, -2.3, 0.48],
    ];
    specs.forEach(([x, y, z, scale], index) => {
      const g = new THREE.Group();
      g.position.set(x, y, z);
      g.scale.setScalar(scale);
      this.root.add(g);
      const material = new THREE.MeshToonMaterial({ color: index % 2 ? 0xf8e8c7 : 0xe6f3f6, transparent: true, opacity: 0.62 });
      [[0, 0, 0], [0.75, 0.05, 0], [-0.7, -0.04, 0], [0.2, 0.34, 0]].forEach(([px, py, pz], part) => {
        const cloud = addMesh(g, new THREE.SphereGeometry(part === 3 ? 0.62 : 0.72, 12, 8), material, [px, py, pz]);
        cloud.castShadow = false;
      });
      this.clouds.push(g);
    });
  }
}
