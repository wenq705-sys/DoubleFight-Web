import * as THREE from 'three';
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

const toon = (color: number) => new THREE.MeshToonMaterial({ color });
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
