import * as THREE from 'three';
import { ART } from '../../config/artDirection';
import type { ThemeId } from '../../config/themes';

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

function disposeMesh(mesh: THREE.Mesh): void {
  mesh.removeFromParent();
  disposeMaterial(mesh.material);
  mesh.geometry.dispose();
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
  private readonly maxParticles: number;
  private readonly maxBursts: number;

  constructor(
    private readonly parent: THREE.Object3D,
    private readonly mobile = false,
  ) {
    this.maxParticles = mobile ? 72 : 120;
    this.maxBursts = mobile ? 42 : 72;
  }

  merge(position: THREE.Vector3, value: number, theme: ThemeId): void {
    const tier = Math.min(10, Math.max(1, Math.log2(value) - 1));
    const requested = (this.mobile ? 6 : 9) + tier * (this.mobile ? 2 : 3);
    const count = Math.min(this.mobile ? 22 : 36, requested, Math.max(0, this.maxParticles - this.particles.length));

    const primary = theme === 'palace'
      ? value >= 256 ? 0xffcf55 : value >= 64 ? 0xf2a63d : 0xff8c72
      : value >= 1024 ? 0xffd34f :
        value >= 512 ? ART.colors.gold :
        value >= 128 ? ART.colors.crystalBlue :
        value >= 32 ? ART.colors.coralLight :
        0xffe5a0;

    const secondary = theme === 'palace' ? 0xef7d9b : ART.colors.royalBlueLight;
    const palette = [primary, ART.colors.gold, secondary, ART.colors.coralLight, 0xffffff];
    const origin = position.clone().add(new THREE.Vector3(0, 0.72, 0));

    for (let i = 0; i < count; i += 1) {
      const color = palette[i % palette.length];
      const geometry =
        i % 5 === 0
          ? starGeometry(0.1 + tier * 0.006, 0.042, theme === 'palace' ? 4 : 5)
          : i % 5 === 1
            ? new THREE.BoxGeometry(0.065, 0.065, 0.18 + tier * 0.008)
            : i % 5 === 2
              ? new THREE.TetrahedronGeometry(0.065, 0)
              : new THREE.SphereGeometry(0.046, 7, 6);

      const material = new THREE.MeshStandardMaterial({
        color,
        roughness: i % 5 === 1 ? 0.58 : 0.3,
        emissive: color,
        emissiveIntensity: value >= 128 ? 0.3 : 0.1,
        transparent: true,
      });
      const particle = new THREE.Mesh(geometry, material);
      particle.position.copy(origin);
      particle.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
      this.parent.add(particle);

      const angle = Math.random() * Math.PI * 2;
      const radial = 0.8 + Math.random() * (0.82 + tier * 0.12);
      const life = 0.38 + Math.random() * (0.22 + tier * 0.016);
      const startScale = 0.8 + Math.random() * 0.82;
      particle.scale.setScalar(startScale);
      this.particles.push({
        mesh: particle,
        velocity: new THREE.Vector3(
          Math.cos(angle) * radial,
          1.08 + Math.random() * (0.92 + tier * 0.08),
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

    this.addRing(position, primary, 0.25, 0.34, value >= 512 ? 4.4 : 3.2, 0.38);
    this.addRing(position.clone().add(new THREE.Vector3(0, 0.025, 0)), 0xffffff, 0.12, 0.18, 2.2, 0.24);
    if (value >= 64) this.addRing(position.clone().add(new THREE.Vector3(0, 0.05, 0)), secondary, 0.45, 0.5, 2.8, 0.44);

    this.radialBurst(position, primary, tier);
    this.flash(origin, primary, value);
    if (value >= 32) this.energyColumn(position, primary, value);
    if (value >= 128) this.crownBurst(origin, value, theme);
    if (value >= 512) this.confetti(origin, value >= 2048 ? (this.mobile ? 16 : 26) : (this.mobile ? 8 : 12), theme);

    const light = new THREE.PointLight(primary, 0, value >= 512 ? 7.5 : 5.4, 2.2);
    light.position.copy(origin).add(new THREE.Vector3(0, 0.35, 0));
    this.parent.add(light);
    const lightLife = value >= 512 ? 0.48 : 0.31;
    this.lights.push({
      light,
      life: lightLife,
      maxLife: lightLife,
      peak: value >= 1024 ? 5.5 : value >= 512 ? 4.1 : value >= 128 ? 2.8 : 1.6,
    });
  }

  spawn(position: THREE.Vector3, theme: ThemeId): void {
    const color = theme === 'palace' ? 0xffd26a : 0xffffff;
    this.addRing(position, color, 0.2, 0.27, 1.55, 0.23);
    const origin = position.clone().add(new THREE.Vector3(0, 0.3, 0));
    const count = Math.min(5, Math.max(0, this.maxParticles - this.particles.length));
    for (let i = 0; i < count; i += 1) {
      const particle = new THREE.Mesh(
        new THREE.SphereGeometry(0.034, 6, 5),
        new THREE.MeshBasicMaterial({
          color: i % 2 ? ART.colors.gold : color,
          transparent: true,
          opacity: 0.78,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        }),
      );
      particle.position.copy(origin);
      this.parent.add(particle);
      const angle = (i / Math.max(1, count)) * Math.PI * 2;
      const life = 0.29;
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

  skillClear(positions: THREE.Vector3[], theme: ThemeId): void {
    const center = new THREE.Vector3(0, 0.62, ART.board.centerZ);
    const primary = theme === 'palace' ? 0xffc94d : 0x8de7ff;
    const secondary = theme === 'palace' ? 0xef6f91 : 0xffb064;

    // Board-wide expanding rings.
    this.addRing(center, primary, 0.45, 0.58, 12, 0.72);
    this.addRing(center.clone().add(new THREE.Vector3(0, 0.03, 0)), secondary, 1.1, 1.2, 6.2, 0.65);
    this.addRing(center.clone().add(new THREE.Vector3(0, 0.06, 0)), 0xffffff, 0.2, 0.28, 17, 0.48);

    const beamMaterial = new THREE.MeshBasicMaterial({
      color: primary,
      transparent: true,
      opacity: 0.36,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 2.5, 8.5, 22, 1, true), beamMaterial);
    beam.position.set(0, 4.2, ART.board.centerZ);
    this.parent.add(beam);
    this.pushBurst(beam, 0.82, new THREE.Vector3(0.12, 0.05, 0.12), new THREE.Vector3(1.45, 1, 1.45), 1.4);

    // Cross-screen ceremonial arcs / wings.
    for (const side of [-1, 1]) {
      const arc = new THREE.Mesh(
        new THREE.TorusGeometry(3.1, 0.075, 8, 56, Math.PI * 0.78),
        new THREE.MeshBasicMaterial({
          color: side < 0 ? primary : secondary,
          transparent: true,
          opacity: 0.62,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        }),
      );
      arc.position.set(side * 1.15, 1.15, ART.board.centerZ);
      arc.rotation.x = Math.PI / 2;
      arc.rotation.z = side < 0 ? -0.8 : Math.PI + 0.8;
      this.parent.add(arc);
      this.pushBurst(arc, 0.78, new THREE.Vector3(0.2, 0.2, 0.2), new THREE.Vector3(1.5, 1.5, 1.5), side * 1.2);
    }

    positions.forEach((position, index) => {
      const origin = position.clone().add(new THREE.Vector3(0, 0.65, 0));
      this.flash(origin, index % 2 ? secondary : primary, 1024);
      this.energyColumn(position, index % 2 ? secondary : primary, 1024);
      this.crownBurst(origin, 1024, theme);
    });

    this.confetti(center.clone().add(new THREE.Vector3(0, 2.0, 0)), this.mobile ? 18 : 30, theme);

    const light = new THREE.PointLight(primary, 0, 12, 2);
    light.position.set(0, 4.5, ART.board.centerZ + 1.2);
    this.parent.add(light);
    this.lights.push({ light, life: 0.9, maxLife: 0.9, peak: theme === 'palace' ? 6.5 : 5.5 });
  }

  clearTransient(): void {
    this.particles.splice(0).forEach((entry) => disposeMesh(entry.mesh));
    this.rings.splice(0).forEach((entry) => disposeMesh(entry.mesh));
    this.bursts.splice(0).forEach((entry) => disposeMesh(entry.mesh));
    this.lights.splice(0).forEach((entry) => entry.light.removeFromParent());
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
        disposeMesh(particle.mesh);
        this.particles.splice(i, 1);
      }
    }

    for (let i = this.rings.length - 1; i >= 0; i -= 1) {
      const ring = this.rings[i];
      ring.life -= delta;
      const progress = 1 - Math.max(0, ring.life / ring.maxLife);
      ring.mesh.scale.setScalar(1 + progress * ring.growth);
      if (ring.mesh.material instanceof THREE.MeshBasicMaterial) ring.mesh.material.opacity = (1 - progress) * 0.62;
      if (ring.life <= 0) {
        disposeMesh(ring.mesh);
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
        disposeMesh(burst.mesh);
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
    if (this.rings.length >= (this.mobile ? 12 : 20)) return;
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(inner, outer, this.mobile ? 32 : 48),
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
    const rayCount = Math.min(this.mobile ? 10 : 18, 7 + tier);
    for (let i = 0; i < rayCount && this.bursts.length < this.maxBursts; i += 1) {
      const angle = (i / rayCount) * Math.PI * 2 + Math.random() * 0.12;
      const length = 0.5 + Math.random() * (0.42 + tier * 0.055);
      const ray = new THREE.Mesh(
        new THREE.BoxGeometry(0.035, 0.018, length),
        new THREE.MeshBasicMaterial({
          color: i % 3 === 0 ? 0xffffff : color,
          transparent: true,
          opacity: 0.72,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        }),
      );
      ray.position.copy(position);
      ray.position.x += Math.sin(angle) * length * 0.34;
      ray.position.z += Math.cos(angle) * length * 0.34;
      ray.position.y += 0.35;
      ray.rotation.y = angle;
      this.parent.add(ray);
      this.pushBurst(
        ray,
        0.24 + tier * 0.012,
        new THREE.Vector3(0.12, 1, 0.12),
        new THREE.Vector3(1, 1, 1.75),
        0,
      );
    }
  }

  private flash(origin: THREE.Vector3, color: number, value: number): void {
    if (this.bursts.length >= this.maxBursts) return;
    const flash = new THREE.Mesh(
      new THREE.SphereGeometry(value >= 512 ? 0.44 : 0.3, this.mobile ? 10 : 14, this.mobile ? 8 : 10),
      new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: value >= 512 ? 0.56 : 0.38,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    flash.position.copy(origin);
    this.parent.add(flash);
    this.pushBurst(
      flash,
      value >= 512 ? 0.28 : 0.2,
      new THREE.Vector3(0.08, 0.08, 0.08),
      new THREE.Vector3(3.2, 2.1, 3.2),
      0,
    );
  }

  private energyColumn(position: THREE.Vector3, color: number, value: number): void {
    if (this.bursts.length >= this.maxBursts) return;
    const height = value >= 512 ? 3.8 : value >= 128 ? 2.8 : 2.1;
    const beam = new THREE.Mesh(
      new THREE.CylinderGeometry(0.04, 0.34, height, this.mobile ? 10 : 16, 1, true),
      new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: value >= 512 ? 0.32 : 0.19,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
    );
    beam.position.copy(position).add(new THREE.Vector3(0, 0.36 + height / 2, 0));
    this.parent.add(beam);
    this.pushBurst(
      beam,
      value >= 512 ? 0.46 : 0.3,
      new THREE.Vector3(0.2, 0.05, 0.2),
      new THREE.Vector3(1.15, 1, 1.15),
      0.8,
    );
  }

  private crownBurst(origin: THREE.Vector3, value: number, theme: ThemeId): void {
    const count = Math.min(this.mobile ? 7 : 10, value >= 1024 ? 10 : 6);
    const secondColor = theme === 'palace' ? 0xef7d9b : 0xffffff;
    for (let i = 0; i < count && this.bursts.length < this.maxBursts; i += 1) {
      const angle = (i / count) * Math.PI * 2;
      const star = new THREE.Mesh(
        starGeometry(value >= 1024 ? 0.14 : 0.11, 0.045, theme === 'palace' ? 4 : 5),
        new THREE.MeshBasicMaterial({
          color: i % 2 ? ART.colors.gold : secondColor,
          transparent: true,
          opacity: 0.9,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        }),
      );
      star.position.copy(origin).add(new THREE.Vector3(Math.cos(angle) * 0.44, 0.38, Math.sin(angle) * 0.44));
      star.rotation.x = -Math.PI / 2;
      this.parent.add(star);
      this.pushBurst(
        star,
        0.46,
        new THREE.Vector3(0.25, 0.25, 0.25),
        new THREE.Vector3(1.7, 1.7, 1.7),
        i % 2 ? 2.2 : -2.2,
      );
    }
  }

  private confetti(origin: THREE.Vector3, count: number, theme: ThemeId): void {
    const colors = theme === 'palace'
      ? [0xffcf55, 0xef6f91, 0xe85c4b, 0x6bb7a0, 0xffffff]
      : [ART.colors.gold, ART.colors.royalBlueLight, ART.colors.coralLight, ART.colors.flowerPink, ART.colors.teal];

    const actualCount = Math.min(count, Math.max(0, this.maxParticles - this.particles.length));
    for (let i = 0; i < actualCount; i += 1) {
      const particle = new THREE.Mesh(
        new THREE.BoxGeometry(0.055, theme === 'palace' ? 0.16 : 0.12, 0.025),
        new THREE.MeshStandardMaterial({ color: colors[i % colors.length], roughness: 0.44, transparent: true }),
      );
      particle.position.copy(origin);
      this.parent.add(particle);
      const angle = Math.random() * Math.PI * 2;
      const life = 0.72 + Math.random() * 0.28;
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

  private pushBurst(
    mesh: THREE.Mesh,
    life: number,
    startScale: THREE.Vector3,
    endScale: THREE.Vector3,
    spin: number,
  ): void {
    if (this.bursts.length >= this.maxBursts) {
      disposeMesh(mesh);
      return;
    }
    this.bursts.push({ mesh, life, maxLife: life, startScale, endScale, spin });
  }

  private easeOutCubic(t: number): number {
    return 1 - Math.pow(1 - t, 3);
  }
}
