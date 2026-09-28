import * as THREE from 'three';
import { createToonMaterial } from '../RuntimeMaterialPolicy';
import type { Direction } from '../../../shared/game/types';
import { ART } from '../../config/artDirection';
import type { EnvironmentDetail } from '../themes/ThemePresentation';

export interface CollectibleEnvironmentConfig {
  ground: number;
  groundAlt: number;
  rim: number;
  accent: number;
  glow: number;
  skyProp: number;
  motif: 'zodiac' | 'candy' | 'dreamhouse';
}

const toon = (color: number) => createToonMaterial({ color });
const standard = (color: number, emissive = 0) => new THREE.MeshStandardMaterial({
  color,
  roughness: 0.62,
  metalness: 0.05,
  ...(emissive ? { emissive: new THREE.Color(emissive), emissiveIntensity: 0.35 } : {}),
});

export class CollectibleThemeEnvironment {
  readonly root = new THREE.Group();
  private readonly world = new THREE.Group();
  private readonly accentLight: THREE.PointLight;
  private readonly pulseRing: THREE.Mesh;
  private readonly flameMeshes: THREE.Mesh[] = [];
  private pulse = 0;
  private gestureX = 0;
  private gestureY = 0;

  constructor(detail: EnvironmentDetail, private readonly config: CollectibleEnvironmentConfig) {
    this.root.add(this.world);

    const base = new THREE.Mesh(
      new THREE.CylinderGeometry(5.45, 5.78, 0.72, 32),
      standard(config.ground),
    );
    base.position.set(0, 0.1, ART.board.centerZ);
    base.receiveShadow = true;
    this.world.add(base);

    const rim = new THREE.Mesh(
      new THREE.TorusGeometry(4.95, 0.12, 8, 48),
      standard(config.rim, config.glow),
    );
    rim.position.set(0, 0.48, ART.board.centerZ);
    rim.rotation.x = Math.PI / 2;
    this.world.add(rim);

    const padGeometry = new THREE.BoxGeometry(1.90, 0.12, 1.90);
    const padMaterial = toon(config.groundAlt);
    const pads = new THREE.InstancedMesh(padGeometry, padMaterial, 16);
    const matrix = new THREE.Matrix4();
    for (let row = 0; row < 4; row += 1) {
      for (let col = 0; col < 4; col += 1) {
        const x = (col - 1.5) * ART.board.gap;
        const z = ART.board.centerZ + (row - 1.5) * ART.board.gap;
        matrix.makeTranslation(x, 0.54, z);
        pads.setMatrixAt(row * 4 + col, matrix);
      }
    }
    pads.instanceMatrix.needsUpdate = true;
    pads.receiveShadow = true;
    this.world.add(pads);

    this.pulseRing = new THREE.Mesh(
      new THREE.TorusGeometry(2.25, 0.045, 6, 40),
      new THREE.MeshBasicMaterial({
        color: config.glow,
        transparent: true,
        opacity: 0,
        depthWrite: false,
      }),
    );
    this.pulseRing.position.set(0, 0.72, ART.board.centerZ);
    this.pulseRing.rotation.x = Math.PI / 2;
    this.world.add(this.pulseRing);

    this.accentLight = new THREE.PointLight(config.glow, 0.28, 15, 2);
    this.accentLight.position.set(0, 5.4, 2.2);
    this.world.add(this.accentLight);

    this.addHeroSetpiece(detail);
    if (detail === 'full') this.addFullDecor();
    else if (detail === 'duel') this.addCompactDecor();
  }

  setGesture(dx: number, dy: number, magnitude: number): void {
    this.gestureX = THREE.MathUtils.clamp(dx / 92, -1, 1) * magnitude;
    this.gestureY = THREE.MathUtils.clamp(dy / 92, -1, 1) * magnitude;
  }

  clearGesture(): void {
    this.gestureX = 0;
    this.gestureY = 0;
  }

  pulseDirection(direction: Direction): void {
    this.pulse = Math.max(this.pulse, 0.56);
    const offset = direction === 'left' ? [-3.2, 1.8, 0]
      : direction === 'right' ? [3.2, 1.8, 0]
        : direction === 'up' ? [0, 2.4, -3]
          : [0, 2.4, 3.2];
    this.accentLight.position.set(offset[0], offset[1], ART.board.centerZ + offset[2]);
  }

  impact(value: number, position: THREE.Vector3): void {
    this.pulse = Math.max(this.pulse, value >= 1024 ? 1 : value >= 256 ? 0.76 : 0.48);
    this.accentLight.position.set(position.x, Math.max(2.2, position.y + 2.8), position.z + 0.8);
  }

  update(time: number, dt: number): void {
    const ease = 1 - Math.exp(-dt * 8);
    this.world.rotation.z += ((-this.gestureX * 0.012) - this.world.rotation.z) * ease;
    this.world.rotation.x += ((this.gestureY * 0.008) - this.world.rotation.x) * ease;
    this.world.position.x += ((this.gestureX * 0.07) - this.world.position.x) * ease;
    this.world.position.z += ((this.gestureY * 0.05) - this.world.position.z) * ease;

    this.pulse = Math.max(0, this.pulse - dt * 1.9);
    const material = this.pulseRing.material as THREE.MeshBasicMaterial;
    material.opacity = this.pulse * 0.45;
    const scale = 1 + (1 - this.pulse) * 0.18;
    this.pulseRing.scale.setScalar(scale);
    this.pulseRing.rotation.z += dt * 0.16;
    this.accentLight.intensity = 0.24 + this.pulse * 2.2 + Math.sin(time * 1.8) * 0.04;
    for (const flame of this.flameMeshes) {
      const breathe = 1 + Math.sin(time * 7 + flame.position.x) * .08;
      flame.scale.set(1 / breathe, breathe, 1 / breathe);
      flame.rotation.y += dt * .7;
    }
  }

  private addHeroSetpiece(detail: EnvironmentDetail): void {
    if (detail === 'board') return;
    const centerZ = ART.board.centerZ;
    const add = (geometry: THREE.BufferGeometry, material: THREE.Material, x: number, y: number, z: number) => {
      const value = new THREE.Mesh(geometry, material);
      value.position.set(x, y, z);
      value.castShadow = true;
      value.receiveShadow = true;
      this.world.add(value);
      return value;
    };

    if (this.config.motif === 'zodiac') {
      // Ceremonial red-lacquer battle shrine: stairs, gate, war drum and braziers.
      const stairMat = standard(0x7e2d27);
      for (let step = 0; step < 3; step += 1) {
        add(new THREE.BoxGeometry(4.4 - step * .55, .18, .58), stairMat, 0, .47 + step * .16, centerZ + 5.35 + step * .20);
      }
      for (const x of [-4.55, 4.55]) {
        add(new THREE.BoxGeometry(.34, 1.55, .34), standard(0x6c2824), x, 1.24, centerZ - 4.55);
        add(new THREE.BoxGeometry(.70, .16, .70), standard(0xd9a94b), x, 2.06, centerZ - 4.55);
      }
      add(new THREE.BoxGeometry(9.65, .24, .32), standard(0x873229), 0, 1.92, centerZ - 4.55);
      const drum = add(new THREE.CylinderGeometry(1.12, 1.12, .42, 24), standard(0x8c332b), 0, 2.48, centerZ - 5.0);
      drum.rotation.x = Math.PI / 2;
      const drumTrim = add(new THREE.TorusGeometry(1.10, .055, 8, 32), standard(0xe2b554, this.config.glow), 0, 2.48, centerZ - 4.76);
      drumTrim.rotation.x = Math.PI / 2;

      for (const x of [-3.85, 3.85]) {
        for (const zOffset of [-3.65, 3.65]) {
          add(new THREE.CylinderGeometry(.28, .40, .58, 10), standard(0x4d3029), x, .92, centerZ + zOffset);
          const flame = add(new THREE.ConeGeometry(.22, .62, 9), standard(0xff9a32, 0xff6a24), x, 1.48, centerZ + zOffset);
          this.flameMeshes.push(flame);
        }
      }
      for (const x of [-4.75, 4.75]) {
        const banner = add(new THREE.BoxGeometry(.72, 1.55, .06), standard(0x9e302b), x, 2.15, centerZ - 1.1);
        banner.rotation.y = x < 0 ? .14 : -.14;
        add(new THREE.BoxGeometry(.92, .08, .10), standard(0xd7a64a), x, 2.92, centerZ - 1.1);
      }
    } else if (this.config.motif === 'candy') {
      // Cake-showcase board: layered sponge, frosting pearls and glowing candy lamps.
      add(new THREE.CylinderGeometry(5.18, 5.34, .38, 32), standard(0xf1b98c), 0, .34, centerZ);
      add(new THREE.CylinderGeometry(5.08, 5.18, .18, 32), standard(0xffd9e9), 0, .58, centerZ);
      for (let i = 0; i < 20; i += 1) {
        const angle = i / 20 * Math.PI * 2;
        add(
          new THREE.SphereGeometry(.18, 9, 7),
          standard(i % 3 === 0 ? 0xffffff : i % 3 === 1 ? 0xff9fc7 : 0xffd36d),
          Math.cos(angle) * 5.06,
          .72,
          centerZ + Math.sin(angle) * 5.06,
        );
      }
      for (const x of [-4.45, 4.45]) {
        for (const zOffset of [-4.0, 4.0]) {
          add(new THREE.CylinderGeometry(.07, .07, 1.15, 8), standard(0xfff0dc), x, 1.12, centerZ + zOffset);
          add(new THREE.SphereGeometry(.28, 12, 9), standard(0xffd966, 0xffca55), x, 1.79, centerZ + zOffset);
          const bow = add(new THREE.TorusGeometry(.18, .055, 7, 18), standard(0xff6fa6), x, 1.43, centerZ + zOffset);
          bow.scale.x = 1.5;
        }
      }
      for (const x of [-3.35, 0, 3.35]) {
        const cloud = add(new THREE.SphereGeometry(.55, 10, 8), standard(0xfff5fb), x, 2.15, centerZ - 5.0);
        cloud.scale.set(1.55, .72, .78);
      }
    } else {
      // Premium garden estate: stone forecourt, hedges, lamps, water and a fountain axis.
      add(new THREE.BoxGeometry(9.65, .10, 9.65), standard(0xcfc7ac), 0, .43, centerZ);
      add(new THREE.BoxGeometry(8.95, .11, 8.95), standard(0x8ab77b), 0, .50, centerZ);
      for (const x of [-4.65, 4.65]) {
        add(new THREE.BoxGeometry(.36, .62, 9.45), standard(0x4f8b61), x, .82, centerZ);
      }
      for (const zOffset of [-4.65, 4.65]) {
        add(new THREE.BoxGeometry(9.45, .62, .36), standard(0x4f8b61), 0, .82, centerZ + zOffset);
      }
      const basin = add(new THREE.CylinderGeometry(1.02, 1.16, .20, 24), standard(0xe5dcc6), 0, .72, centerZ - 5.05);
      basin.receiveShadow = true;
      add(new THREE.CylinderGeometry(.54, .68, .12, 20), standard(0x61bed4, 0x61bed4), 0, .86, centerZ - 5.05);
      add(new THREE.CylinderGeometry(.12, .16, 1.0, 12), standard(0xe4dac2), 0, 1.25, centerZ - 5.05);
      add(new THREE.SphereGeometry(.20, 10, 8), standard(0x73cee0, 0x73cee0), 0, 1.82, centerZ - 5.05);

      for (const x of [-4.30, 4.30]) {
        for (const zOffset of [-3.55, 3.55]) {
          add(new THREE.CylinderGeometry(.065, .075, 1.08, 8), standard(0x45433d), x, 1.10, centerZ + zOffset);
          add(new THREE.SphereGeometry(.16, 10, 8), standard(0xffdf8f, 0xffc65a), x, 1.72, centerZ + zOffset);
        }
      }
      // Water strip sells the lakefront theme without expensive transparent meshes.
      add(new THREE.BoxGeometry(8.25, .06, .62), standard(0x5bb7cf, 0x5bb7cf), 0, .51, centerZ + 5.18);
    }
  }

  private addFullDecor(): void {
    for (let index = 0; index < 8; index += 1) {
      const angle = (index / 8) * Math.PI * 2;
      const radius = index % 2 ? 5.45 : 5.85;
      const x = Math.cos(angle) * radius;
      const z = ART.board.centerZ + Math.sin(angle) * radius;
      this.world.add(this.decorativeProp(index, x, z));
    }
  }

  private addCompactDecor(): void {
    for (let index = 0; index < 4; index += 1) {
      const angle = (index / 4) * Math.PI * 2 + Math.PI / 4;
      this.world.add(this.decorativeProp(index, Math.cos(angle) * 5.2, ART.board.centerZ + Math.sin(angle) * 5.2));
    }
  }

  private decorativeProp(index: number, x: number, z: number): THREE.Object3D {
    const group = new THREE.Group();
    group.position.set(x, 0.5, z);
    group.rotation.y = Math.atan2(x, z - ART.board.centerZ);

    if (this.config.motif === 'zodiac') {
      if (index === 0) {
        // Rabbit is the twelfth zodiac resident and world guide, intentionally
        // outside the 11-tier combat-power merge chain.
        const body = new THREE.Mesh(new THREE.SphereGeometry(0.30, 10, 8), toon(0xf5eee5));
        body.position.set(0, 0.42, 0);
        const head = new THREE.Mesh(new THREE.SphereGeometry(0.23, 10, 8), toon(0xfff6ec));
        head.position.set(0, 0.82, 0.08);
        const leftEar = new THREE.Mesh(new THREE.CapsuleGeometry(0.07, 0.30, 4, 7), toon(0xffe4dd));
        leftEar.position.set(-0.10, 1.15, 0.03);
        leftEar.rotation.z = -0.12;
        const rightEar = leftEar.clone();
        rightEar.position.x = 0.10;
        rightEar.rotation.z = 0.12;
        const tail = new THREE.Mesh(new THREE.SphereGeometry(0.11, 8, 6), toon(0xffffff));
        tail.position.set(0, 0.48, -0.28);
        group.add(body, head, leftEar, rightEar, tail);
      } else {
        const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.22, 1.4, 8), standard(this.config.rim));
        pillar.position.y = 0.7;
        const lantern = new THREE.Mesh(new THREE.OctahedronGeometry(index % 2 ? 0.34 : 0.28, 0), standard(this.config.skyProp, this.config.glow));
        lantern.position.y = 1.6;
        group.add(pillar, lantern);
      }
    } else if (this.config.motif === 'candy') {
      const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 1.15, 7), toon(0xfff1d5));
      stick.position.y = 0.58;
      const candy = new THREE.Mesh(new THREE.SphereGeometry(0.34, 10, 8), toon(index % 2 ? this.config.accent : this.config.skyProp));
      candy.position.y = 1.24;
      group.add(stick, candy);
    } else {
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.10, 0.14, 0.9, 7), toon(0x8f6345));
      trunk.position.y = 0.45;
      const crown = new THREE.Mesh(new THREE.ConeGeometry(0.45, 0.86, 8), toon(index % 2 ? this.config.accent : this.config.skyProp));
      crown.position.y = 1.2;
      group.add(trunk, crown);
    }
    group.traverse(node => {
      if (node instanceof THREE.Mesh) {
        node.castShadow = true;
        node.receiveShadow = true;
      }
    });
    return group;
  }
}
