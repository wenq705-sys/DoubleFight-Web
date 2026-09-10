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

interface BurstEffect {
  mesh: THREE.Mesh;
  life: number;
  maxLife: number;
  startScale: THREE.Vector3;
  endScale: THREE.Vector3;
  spin: number;
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
  private readonly bursts: BurstEffect[] = [];

  constructor(private readonly parent: THREE.Object3D) {}

  merge(position: THREE.Vector3, value: number): void {
    const tier = Math.min(10, Math.max(1, Math.log2(value) - 1));
    const count = Math.min(36, 8 + tier * 3);
    const primary =
      value >= 1024 ? 0xffd34f :
      value >= 512 ? ART.colors.gold :
      value >= 128 ? ART.colors.crystalBlue :
      value >= 32 ? ART.colors.coralLight :
      0xffe5a0;
    const palette = [primary, ART.colors.gold, ART.colors.coralLight, ART.colors.royalBlueLight, 0xffffff];
    const origin = position.clone().add(new THREE.Vector3(0, 0.72, 0));

    for (let i = 0; i < count; i += 1) {
      const color = palette[i % palette.length];
      const geometry =
        i % 5 === 0
          ? starGeometry(0.1 + tier * 0.006, 0.042, 5)
          : i % 5 === 1
            ? new THREE.BoxGeometry(0.065, 0.065, 0.18 + tier * 0.008)
            : i % 5 === 2
              ? new THREE.TetrahedronGeometry(0.065, 0)
              : new THREE.SphereGeometry(0.046, 7, 6);

      const material = new THREE.MeshStandardMaterial({
        color,
        roughness: i % 5 === 1 ? 0.58 : 0.3,
        emissive: color,
        emissiveIntensity: value >= 128 ? 0.28 : 0.09,
        transparent: true,
      });
      const particle = new THREE.Mesh(geometry, material);
      particle.position.copy(origin);
      particle.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
      this.parent.add(particle);

      const angle = Math.random() * Math.PI * 2;
      const radial = 0.75 + Math.random() * (0.8 + tier * 0.12);
      const life = 0.4 + Math.random() * (0.24 + tier * 0.018);
      const startScale = 0.78 + Math.random() * 0.8;
      particle.scale.setScalar(startScale);
      this.particles.push({
        mesh: particle,
        velocity: new THREE.Vector3(
          Math.cos(angle) * radial,
          1.05 + Math.random() * (0.9 + tier * 0.08),
          Math.sin(angle) * radial,
        ),
        spin: new THREE.Vector3(
          (Math.random() - 0.5) * 9,
          (Math.random() - 0.5) * 9,
          (Math.random() - 0.5) * 9,
        ),
        life,
        maxLife: life,
        startScale,
      });
    }

    this.addRing(position, primary, 0.25, 0.34, value >= 512 ? 4.2 : 3.1, 0.38);
    this.addRing(position.clone().add(new THREE.Vector3(0, 0.025, 0)), 0xffffff, 0.12, 0.18, 2.15, 0.25);
    if (value >= 64) {
      this.addRing(position.clone().add(new THREE.Vector3(0, 0.05, 0)), ART.colors.royalBlueLight, 0.45, 0.5, 2.6, 0.46);
    }

    this.radialBurst(position, primary, tier);
    this.flash(origin, primary, value);

    if (value >= 64) this.energyColumn(position, primary, value);
    if (value >= 256) this.crownBurst(origin, value);
    if (value >= 512) this.confetti(origin, value >= 2048 ? 26 : 12);

    const light = new THREE.PointLight(primary, 0, value >= 512 ? 7.5 : 5.4, 2.2);
    light.position.copy(origin).add(new THREE.Vector3(0, 0.35, 0));
    this.parent.add(light);
    const lightLife = value >= 512 ? 0.48 : 0.31;
    this.lights.push({
      light,
      life: lightLife,
      maxLife: lightLife,
      peak: value >= 1024 ? 5.2 : value >= 512 ? 3.9 : value >= 128 ? 2.7 : 1.5,
    });
  }

  spawn(position: THREE.Vector3): void {
    this.addRing(position, 0xffffff, 0.2, 0.27, 1.5, 0.24);
    const origin = position.clone().add(new THREE.Vector3(0, 0.3, 0));
    for (let i = 0; i < 6; i += 1) {
      const particle = new THREE.Mesh(
        new THREE.SphereGeometry(0.034, 6, 5),
        new THREE.MeshBasicMaterial({
          color: i % 2 ? ART.colors.gold : 0xfff4cf,
          transparent: true,
          opacity: 0.78,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        }),
      );
      particle.position.copy(origin);
      this.parent.add(particle);
      const angle = (i / 6) * Math.PI * 2;
      const life = 0.32;
      this.particles.push({
        mesh: particle,
        velocity: new THREE.Vector3(Math.cos(angle) * 0.42, 0.46, Math.sin(angle) * 0.42),
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
      particle.velocity.y -= 3.35 * delta;
      particle.mesh.position.addScaledVector(particle.velocity, delta);
      particle.mesh.rotation.x += particle.spin.x * delta;
      particle.mesh.rotation.y += particle.spin.y * delta;
      particle.mesh.rotation.z += particle.spin.z * delta;
      const normalized = Math.max(0, particle.life / particle.maxLife);
      const scale = particle.startScale * Math.max(0.01, Math.sin(normalized * Math.PI * 0.5));
      particle.mesh.scale.setScalar(scale);
      const material = particle.mesh.material;
      if (material instanceof THREE.MeshStandardMaterial || material instanceof THREE.MeshBasicMaterial) {
        material.opacity = Math.min(1, normalized * 1.45);
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
      if (ring.mesh.material instanceof THREE.MeshBasicMaterial) {
        ring.mesh.material.opacity = (1 - progress) * 0.62;
      }
      if (ring.life <= 0) {
        ring.mesh.removeFromParent();
        disposeMaterial(ring.mesh.material);
        ring.mesh.geometry.dispose();
        this.rings.splice(i, 1);
      }
    }

    for (let i = this.bursts.length - 1; i >= 0; i -= 1) {
      const burst = this.bursts[i];
      burst.life -= delta;
      const progress = 1 - Math.max(0, burst.life / burst.maxLife);
      burst.mesh.scale.lerpVectors(burst.startScale, burst.endScale, this.easeOutCubic(progress));
      burst.mesh.rotation.y += burst.spin * delta;
      const material = burst.mesh.material;
      if (material instanceof THREE.MeshBasicMaterial || material instanceof THREE.MeshStandardMaterial) {
        material.opacity = Math.max(0, (1 - progress) * (progress < 0.12 ? progress / 0.12 : 1));
      }
      if (burst.life <= 0) {
        burst.mesh.removeFromParent();
        disposeMaterial(material);
        burst.mesh.geometry.dispose();
        this.bursts.splice(i, 1);
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

  private addRing(
    position: THREE.Vector3,
    color: number,
    inner: number,
    outer: number,
    growth: number,
    life: number,
  ): void {
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(inner, outer, 56),
      new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0.62,
        side: THREE.DoubleSide,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    ring.position.copy(position).add(new THREE.Vector3(0, 0.32, 0));
    ring.rotation.x = -Math.PI / 2;
    this.parent.add(ring);
    this.rings.push({ mesh: ring, life, maxLife: life, growth });
  }

  private radialBurst(position: THREE.Vector3, color: number, tier: number): void {
    const rayCount = 8 + Math.min(10, tier);
    for (let i = 0; i < rayCount; i += 1) {
      const angle = (i / rayCount) * Math.PI * 2 + Math.random() * 0.12;
      const length = 0.5 + Math.random() * (0.42 + tier * 0.055);
      const material = new THREE.MeshBasicMaterial({
        color: i % 3 === 0 ? 0xffffff : color,
        transparent: true,
        opacity: 0.72,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const ray = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.018, length), material);
      ray.position.copy(position);
      ray.position.x += Math.sin(angle) * length * 0.34;
      ray.position.z += Math.cos(angle) * length * 0.34;
      ray.position.y += 0.35;
      ray.rotation.y = angle;
      this.parent.add(ray);
      this.bursts.push({
        mesh: ray,
        life: 0.24 + tier * 0.012,
        maxLife: 0.24 + tier * 0.012,
        startScale: new THREE.Vector3(0.12, 1, 0.12),
        endScale: new THREE.Vector3(1, 1, 1.75),
        spin: 0,
      });
    }
  }

  private flash(origin: THREE.Vector3, color: number, value: number): void {
    const material = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: value >= 512 ? 0.56 : 0.38,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const flash = new THREE.Mesh(new THREE.SphereGeometry(value >= 512 ? 0.44 : 0.3, 14, 10), material);
    flash.position.copy(origin);
    this.parent.add(flash);
    const life = value >= 512 ? 0.28 : 0.2;
    this.bursts.push({
      mesh: flash,
      life,
      maxLife: life,
      startScale: new THREE.Vector3(0.08, 0.08, 0.08),
      endScale: new THREE.Vector3(3.2, 2.1, 3.2),
      spin: 0,
    });
  }

  private energyColumn(position: THREE.Vector3, color: number, value: number): void {
    const height = value >= 512 ? 3.8 : value >= 128 ? 2.8 : 2.1;
    const material = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: value >= 512 ? 0.32 : 0.19,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.34, height, 16, 1, true), material);
    beam.position.copy(position).add(new THREE.Vector3(0, 0.36 + height / 2, 0));
    this.parent.add(beam);
    const life = value >= 512 ? 0.46 : 0.3;
    this.bursts.push({
      mesh: beam,
      life,
      maxLife: life,
      startScale: new THREE.Vector3(0.2, 0.05, 0.2),
      endScale: new THREE.Vector3(1.15, 1, 1.15),
      spin: 0.8,
    });
  }

  private crownBurst(origin: THREE.Vector3, value: number): void {
    const count = value >= 1024 ? 10 : 6;
    for (let i = 0; i < count; i += 1) {
      const angle = (i / count) * Math.PI * 2;
      const star = new THREE.Mesh(
        starGeometry(value >= 1024 ? 0.14 : 0.11, 0.045, 5),
        new THREE.MeshBasicMaterial({
          color: i % 2 ? ART.colors.gold : 0xffffff,
          transparent: true,
          opacity: 0.9,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        }),
      );
      star.position.copy(origin).add(new THREE.Vector3(Math.cos(angle) * 0.44, 0.38, Math.sin(angle) * 0.44));
      star.rotation.x = -Math.PI / 2;
      this.parent.add(star);
      this.bursts.push({
        mesh: star,
        life: 0.46,
        maxLife: 0.46,
        startScale: new THREE.Vector3(0.25, 0.25, 0.25),
        endScale: new THREE.Vector3(1.7, 1.7, 1.7),
        spin: i % 2 ? 2.2 : -2.2,
      });
    }
  }

  private confetti(origin: THREE.Vector3, count: number): void {
    const colors = [
      ART.colors.gold,
      ART.colors.royalBlueLight,
      ART.colors.coralLight,
      ART.colors.flowerPink,
      ART.colors.teal,
    ];
    for (let i = 0; i < count; i += 1) {
      const material = new THREE.MeshStandardMaterial({
        color: colors[i % colors.length],
        roughness: 0.44,
        transparent: true,
      });
      const particle = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.12, 0.025), material);
      particle.position.copy(origin);
      this.parent.add(particle);
      const angle = Math.random() * Math.PI * 2;
      const life = 0.75 + Math.random() * 0.3;
      this.particles.push({
        mesh: particle,
        velocity: new THREE.Vector3(
          Math.cos(angle) * (1.25 + Math.random() * 1.1),
          1.9 + Math.random() * 1.35,
          Math.sin(angle) * (1.25 + Math.random() * 1.1),
        ),
        spin: new THREE.Vector3(5 + Math.random() * 6, 4 + Math.random() * 5, 5 + Math.random() * 6),
        life,
        maxLife: life,
        startScale: 1,
      });
    }
  }

  private easeOutCubic(t: number): number {
    return 1 - Math.pow(1 - t, 3);
  }
}
