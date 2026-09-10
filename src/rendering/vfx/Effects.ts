import * as THREE from 'three';
import { ART } from '../../config/artDirection';

interface Particle {
  mesh: THREE.Mesh;
  velocity: THREE.Vector3;
  spin: THREE.Vector3;
  life: number;
  maxLife: number;
  startScale: number;
}

interface RingEffect {
  mesh: THREE.Mesh;
  life: number;
  maxLife: number;
  growth: number;
}

interface LightEffect {
  light: THREE.PointLight;
  life: number;
  maxLife: number;
  peak: number;
}

function disposeMaterial(material: THREE.Material | THREE.Material[]): void {
  if (Array.isArray(material)) material.forEach((entry) => entry.dispose());
  else material.dispose();
}

function starGeometry(outer = 0.12, inner = 0.055, points = 5): THREE.ShapeGeometry {
  const shape = new THREE.Shape();
  for (let i = 0; i < points * 2; i += 1) {
    const angle = -Math.PI / 2 + (i / (points * 2)) * Math.PI * 2;
    const radius = i % 2 === 0 ? outer : inner;
    const x = Math.cos(angle) * radius;
    const y = Math.sin(angle) * radius;
    if (i === 0) shape.moveTo(x, y);
    else shape.lineTo(x, y);
  }
  shape.closePath();
  return new THREE.ShapeGeometry(shape);
}

export class Effects {
  private readonly particles: Particle[] = [];
  private readonly rings: RingEffect[] = [];
  private readonly lights: LightEffect[] = [];

  constructor(private readonly parent: THREE.Object3D) {}

  merge(position: THREE.Vector3, value: number): void {
    const tier = Math.min(10, Math.max(1, Math.log2(value) - 1));
    const count = Math.min(30, 6 + tier * 2);
    const primary = value >= 512 ? ART.colors.gold : value >= 128 ? ART.colors.crystalBlue : 0xffe9a7;
    const palette = [primary, ART.colors.gold, ART.colors.coralLight, 0xffffff];
    const origin = position.clone().add(new THREE.Vector3(0, 0.74, 0));

    for (let i = 0; i < count; i += 1) {
      const color = palette[i % palette.length];
      const geometry = i % 4 === 0
        ? starGeometry(0.095 + tier * 0.005, 0.042, 5)
        : i % 4 === 1
          ? new THREE.BoxGeometry(0.07, 0.07, 0.07)
          : new THREE.SphereGeometry(0.046, 7, 6);
      const material = new THREE.MeshStandardMaterial({
        color,
        roughness: 0.34,
        emissive: color,
        emissiveIntensity: value >= 128 ? 0.18 : 0.05,
        transparent: true,
      });
      const particle = new THREE.Mesh(geometry, material);
      particle.position.copy(origin);
      particle.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
      this.parent.add(particle);

      const angle = Math.random() * Math.PI * 2;
      const radial = 0.65 + Math.random() * (0.72 + tier * 0.1);
      const life = 0.42 + Math.random() * 0.26;
      const startScale = 0.82 + Math.random() * 0.75;
      particle.scale.setScalar(startScale);
      this.particles.push({
        mesh: particle,
        velocity: new THREE.Vector3(
          Math.cos(angle) * radial,
          0.82 + Math.random() * (0.78 + tier * 0.08),
          Math.sin(angle) * radial,
        ),
        spin: new THREE.Vector3(
          (Math.random() - 0.5) * 7,
          (Math.random() - 0.5) * 7,
          (Math.random() - 0.5) * 7,
        ),
        life,
        maxLife: life,
        startScale,
      });
    }

    this.addRing(position, primary, 0.3, 0.38, value >= 512 ? 3.2 : 2.45);
    this.addRing(position.clone().add(new THREE.Vector3(0, 0.025, 0)), 0xffffff, 0.18, 0.24, 1.65);

    const light = new THREE.PointLight(primary, 0, value >= 512 ? 6.2 : 4.2, 2.2);
    light.position.copy(origin).add(new THREE.Vector3(0, 0.35, 0));
    this.parent.add(light);
    const lightLife = value >= 512 ? 0.42 : 0.26;
    this.lights.push({ light, life: lightLife, maxLife: lightLife, peak: value >= 512 ? 3.4 : value >= 128 ? 2.2 : 1.25 });

    if (value >= 512) this.confetti(origin, value >= 2048 ? 16 : 8);
  }

  spawn(position: THREE.Vector3): void {
    this.addRing(position, 0xffffff, 0.24, 0.23, 1.35);
    const origin = position.clone().add(new THREE.Vector3(0, 0.3, 0));
    for (let i = 0; i < 5; i += 1) {
      const particle = new THREE.Mesh(
        new THREE.SphereGeometry(0.035, 6, 5),
        new THREE.MeshBasicMaterial({ color: 0xfff7d3, transparent: true, opacity: 0.75 }),
      );
      particle.position.copy(origin);
      this.parent.add(particle);
      const angle = (i / 5) * Math.PI * 2;
      const life = 0.3;
      this.particles.push({
        mesh: particle,
        velocity: new THREE.Vector3(Math.cos(angle) * 0.38, 0.42, Math.sin(angle) * 0.38),
        spin: new THREE.Vector3(0, 0, 0),
        life,
        maxLife: life,
        startScale: 1,
      });
    }
  }

  update(delta: number): void {
    for (let i = this.particles.length - 1; i >= 0; i -= 1) {
      const particle = this.particles[i];
      particle.life -= delta;
      particle.velocity.y -= 3.25 * delta;
      particle.mesh.position.addScaledVector(particle.velocity, delta);
      particle.mesh.rotation.x += particle.spin.x * delta;
      particle.mesh.rotation.y += particle.spin.y * delta;
      particle.mesh.rotation.z += particle.spin.z * delta;
      const normalized = Math.max(0, particle.life / particle.maxLife);
      const scale = particle.startScale * Math.max(0.01, Math.sin(normalized * Math.PI * 0.5));
      particle.mesh.scale.setScalar(scale);
      const material = particle.mesh.material;
      if (material instanceof THREE.MeshStandardMaterial || material instanceof THREE.MeshBasicMaterial) {
        material.opacity = Math.min(1, normalized * 1.4);
      }
      if (particle.life <= 0) {
        particle.mesh.removeFromParent();
        disposeMaterial(material);
        particle.mesh.geometry.dispose();
        this.particles.splice(i, 1);
      }
    }

    for (let i = this.rings.length - 1; i >= 0; i -= 1) {
      const ring = this.rings[i];
      ring.life -= delta;
      const progress = 1 - Math.max(0, ring.life / ring.maxLife);
      ring.mesh.scale.setScalar(1 + progress * ring.growth);
      if (ring.mesh.material instanceof THREE.MeshBasicMaterial) ring.mesh.material.opacity = (1 - progress) * 0.54;
      if (ring.life <= 0) {
        ring.mesh.removeFromParent();
        disposeMaterial(ring.mesh.material);
        ring.mesh.geometry.dispose();
        this.rings.splice(i, 1);
      }
    }

    for (let i = this.lights.length - 1; i >= 0; i -= 1) {
      const pulse = this.lights[i];
      pulse.life -= delta;
      const progress = 1 - Math.max(0, pulse.life / pulse.maxLife);
      pulse.light.intensity = Math.sin(progress * Math.PI) * pulse.peak;
      if (pulse.life <= 0) {
        pulse.light.removeFromParent();
        this.lights.splice(i, 1);
      }
    }
  }

  private addRing(position: THREE.Vector3, color: number, inner: number, outer: number, growth: number): void {
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(inner, outer, 48),
      new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0.54,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    );
    ring.position.copy(position).add(new THREE.Vector3(0, 0.31, 0));
    ring.rotation.x = -Math.PI / 2;
    this.parent.add(ring);
    this.rings.push({ mesh: ring, life: 0.34, maxLife: 0.34, growth });
  }

  private confetti(origin: THREE.Vector3, count: number): void {
    const colors = [ART.colors.gold, ART.colors.royalBlueLight, ART.colors.coralLight, ART.colors.flowerPink];
    for (let i = 0; i < count; i += 1) {
      const material = new THREE.MeshStandardMaterial({ color: colors[i % colors.length], roughness: 0.46, transparent: true });
      const particle = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.11, 0.025), material);
      particle.position.copy(origin);
      this.parent.add(particle);
      const angle = Math.random() * Math.PI * 2;
      const life = 0.7 + Math.random() * 0.25;
      this.particles.push({
        mesh: particle,
        velocity: new THREE.Vector3(Math.cos(angle) * (1.2 + Math.random()), 1.8 + Math.random() * 1.2, Math.sin(angle) * (1.2 + Math.random())),
        spin: new THREE.Vector3(5 + Math.random() * 5, 4 + Math.random() * 4, 5 + Math.random() * 5),
        life,
        maxLife: life,
        startScale: 1,
      });
    }
  }
}
