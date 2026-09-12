import * as THREE from 'three';
import { ART } from '../../config/artDirection';
import type { EffectPalette } from '../themes/ThemePresentation';
import type { QualityLevel } from '../../performance/PerformanceManager';

type PoolKind = 'spark' | 'confetti' | 'ring' | 'flash' | 'beam' | 'ray';

interface FxItem {
  mesh: THREE.Mesh;
  kind: PoolKind;
  active: boolean;
  life: number;
  maxLife: number;
  velocity: THREE.Vector3;
  spin: THREE.Vector3;
  startScale: THREE.Vector3;
  endScale: THREE.Vector3;
}

interface LightItem {
  light: THREE.PointLight;
  active: boolean;
  life: number;
  maxLife: number;
  peak: number;
}

const SHARED = {
  spark: new THREE.OctahedronGeometry(0.06, 0),
  confetti: new THREE.BoxGeometry(0.055, 0.15, 0.025),
  ring: new THREE.RingGeometry(0.82, 1, 40),
  flash: new THREE.SphereGeometry(0.32, 10, 8),
  beam: new THREE.CylinderGeometry(0.06, 0.32, 1, 12, 1, true),
  ray: new THREE.BoxGeometry(0.045, 0.022, 1),
};

export class Effects {
  private readonly items: FxItem[] = [];
  private readonly lights: LightItem[] = [];
  private readonly maxByQuality: Record<QualityLevel, number>;
  private quality: QualityLevel = 'high';

  constructor(
    private readonly parent: THREE.Object3D,
    private readonly mobile = false,
  ) {
    this.maxByQuality = {
      high: mobile ? 92 : 132,
      medium: mobile ? 68 : 104,
      low: mobile ? 48 : 82,
    };
    this.prewarm();
  }

  setQuality(quality: QualityLevel): void {
    this.quality = quality;
  }

  merge(position: THREE.Vector3, value: number, theme: EffectPalette): void {
    const tier = Math.min(10, Math.max(1, Math.log2(value) - 1));
    const primary = theme.primary(value);
    const secondary = theme.secondary;
    const particleBudget =
      this.quality === 'high' ? 7 + tier * 2 :
      this.quality === 'medium' ? 5 + tier :
      4 + Math.floor(tier * 0.7);

    const count = Math.min(this.mobile ? 20 : 30, particleBudget);
    const origin = position.clone().add(new THREE.Vector3(0, 0.72, 0));

    for (let i = 0; i < count; i += 1) {
      const item = this.acquire(i % 4 === 0 ? 'confetti' : 'spark');
      if (!item) break;
      const color = [primary, secondary, ART.colors.gold, 0xffffff][i % 4];
      const angle = Math.random() * Math.PI * 2;
      const radial = 0.8 + Math.random() * (0.85 + tier * 0.1);
      const life = 0.38 + Math.random() * 0.26;
      this.activate(item, origin, color, life);
      item.velocity.set(
        Math.cos(angle) * radial,
        1.1 + Math.random() * (0.8 + tier * 0.08),
        Math.sin(angle) * radial,
      );
      item.spin.set(
        (Math.random() - 0.5) * 8,
        (Math.random() - 0.5) * 8,
        (Math.random() - 0.5) * 8,
      );
      const base = item.kind === 'confetti' ? 0.85 : 1;
      item.startScale.setScalar(base);
      item.endScale.setScalar(0.05);
    }

    this.ring(position, primary, 0.4, value >= 512 ? 3.8 : 3.0);
    this.ring(position.clone().add(new THREE.Vector3(0, 0.03, 0)), 0xffffff, 0.25, 2.0);
    if (value >= 64) this.ring(position.clone().add(new THREE.Vector3(0, 0.06, 0)), secondary, 0.45, 2.5);

    this.flash(origin, primary, value >= 512 ? 2.8 : 2.1);
    this.rays(position, primary, Math.min(this.quality === 'high' ? 12 : 8, 5 + tier));
    if (value >= 64 && this.quality !== 'low') this.beam(position, primary, value >= 512 ? 3.6 : 2.5);
    if (value >= 256) this.confetti(origin, this.quality === 'high' ? 10 : 6, theme);
    this.light(origin, primary, value >= 1024 ? 5.2 : value >= 512 ? 4 : 2.4);
  }

  spawn(position: THREE.Vector3, theme: EffectPalette): void {
    const primary = theme.spawn;
    this.ring(position, primary, 0.23, 1.35);
    const origin = position.clone().add(new THREE.Vector3(0, 0.28, 0));
    const count = this.quality === 'low' ? 3 : 5;
    for (let i = 0; i < count; i += 1) {
      const item = this.acquire('spark');
      if (!item) break;
      const angle = (i / count) * Math.PI * 2;
      this.activate(item, origin, i % 2 ? ART.colors.gold : primary, 0.28);
      item.velocity.set(Math.cos(angle) * 0.42, 0.45, Math.sin(angle) * 0.42);
      item.startScale.setScalar(0.7);
      item.endScale.setScalar(0.03);
    }
  }

  skillClear(positions: THREE.Vector3[], theme: EffectPalette): void {
    const center = new THREE.Vector3(0, 0.62, ART.board.centerZ);
    const primary = theme.skill;
    const secondary = theme.skillSecondary;

    this.ring(center, primary, 0.72, 9);
    this.ring(center.clone().add(new THREE.Vector3(0, 0.035, 0)), secondary, 0.66, 6.4);
    this.ring(center.clone().add(new THREE.Vector3(0, 0.07, 0)), 0xffffff, 0.48, 11);

    if (this.quality !== 'low') {
      this.beam(center, primary, 6.8);
      this.beam(center.clone().add(new THREE.Vector3(0.75, 0, 0)), secondary, 5.2);
    }

    positions.forEach((position, index) => {
      const origin = position.clone().add(new THREE.Vector3(0, 0.7, 0));
      this.flash(origin, index % 2 ? secondary : primary, 3.4);
      this.ring(position, index % 2 ? secondary : primary, 0.4, 4.2);
      this.confetti(origin, this.quality === 'high' ? 10 : 6, theme);
    });

    this.confetti(center.clone().add(new THREE.Vector3(0, 2.1, 0)), this.quality === 'high' ? 20 : 12, theme);
    this.light(center.clone().add(new THREE.Vector3(0, 2.8, 0)), primary, theme.skillLight, 0.86);
  }

  dispose(): void {
    this.clearTransient();
    for (const item of this.items) { (item.mesh.material as THREE.Material).dispose(); item.mesh.removeFromParent(); }
    for (const item of this.lights) item.light.removeFromParent();
  }

  clearTransient(): void {
    this.items.forEach((item) => this.release(item));
    this.lights.forEach((item) => {
      item.active = false;
      item.life = 0;
      item.light.intensity = 0;
      item.light.visible = false;
    });
  }

  update(delta: number): void {
    for (const item of this.items) {
      if (!item.active) continue;
      item.life -= delta;
      const t = 1 - Math.max(0, item.life / Math.max(0.001, item.maxLife));

      if (item.kind === 'spark' || item.kind === 'confetti') {
        item.velocity.y -= 3.1 * delta;
        item.mesh.position.addScaledVector(item.velocity, delta);
        item.mesh.rotation.x += item.spin.x * delta;
        item.mesh.rotation.y += item.spin.y * delta;
        item.mesh.rotation.z += item.spin.z * delta;
        const s = THREE.MathUtils.lerp(item.startScale.x, item.endScale.x, t);
        item.mesh.scale.setScalar(Math.max(0.01, s));
      } else {
        item.mesh.scale.lerpVectors(item.startScale, item.endScale, this.easeOutCubic(t));
        item.mesh.rotation.y += item.spin.y * delta;
      }

      const material = item.mesh.material;
      if (material instanceof THREE.MeshBasicMaterial) {
        material.opacity = Math.max(0, (1 - t) * (t < 0.08 ? t / 0.08 : 1));
      }

      if (item.life <= 0) this.release(item);
    }

    for (const item of this.lights) {
      if (!item.active) continue;
      item.life -= delta;
      const t = 1 - Math.max(0, item.life / item.maxLife);
      item.light.intensity = Math.sin(t * Math.PI) * item.peak;
      if (item.life <= 0) {
        item.active = false;
        item.light.intensity = 0;
        item.light.visible = false;
      }
    }
  }

  private prewarm(): void {
    const counts: Record<PoolKind, number> = {
      spark: this.mobile ? 46 : 64,
      confetti: this.mobile ? 24 : 34,
      ring: this.mobile ? 14 : 18,
      flash: this.mobile ? 8 : 12,
      beam: this.mobile ? 5 : 7,
      ray: this.mobile ? 18 : 28,
    };

    (Object.keys(counts) as PoolKind[]).forEach((kind) => {
      for (let i = 0; i < counts[kind]; i += 1) this.items.push(this.makeItem(kind));
    });

    const lightCount = this.mobile ? 4 : 6;
    for (let i = 0; i < lightCount; i += 1) {
      const light = new THREE.PointLight(0xffffff, 0, 8, 2);
      light.visible = false;
      this.parent.add(light);
      this.lights.push({ light, active: false, life: 0, maxLife: 1, peak: 1 });
    }
  }

  private makeItem(kind: PoolKind): FxItem {
    const material = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: kind === 'ring' || kind === 'beam' ? THREE.DoubleSide : THREE.FrontSide,
    });
    const mesh = new THREE.Mesh(SHARED[kind], material);
    mesh.visible = false;
    mesh.castShadow = false;
    mesh.frustumCulled = false;
    this.parent.add(mesh);
    return {
      mesh,
      kind,
      active: false,
      life: 0,
      maxLife: 1,
      velocity: new THREE.Vector3(),
      spin: new THREE.Vector3(),
      startScale: new THREE.Vector3(1, 1, 1),
      endScale: new THREE.Vector3(1, 1, 1),
    };
  }

  private acquire(kind: PoolKind): FxItem | null {
    const activeCount = this.items.reduce((sum, item) => sum + (item.active ? 1 : 0), 0);
    if (activeCount >= this.maxByQuality[this.quality]) return null;
    return this.items.find((item) => !item.active && item.kind === kind) ?? null;
  }

  private activate(item: FxItem, position: THREE.Vector3, color: number, life: number): void {
    item.active = true;
    item.life = life;
    item.maxLife = life;
    item.mesh.visible = true;
    item.mesh.position.copy(position);
    item.mesh.rotation.set(0, 0, 0);
    item.mesh.scale.setScalar(1);
    item.velocity.set(0, 0, 0);
    item.spin.set(0, 0, 0);
    item.startScale.set(1, 1, 1);
    item.endScale.set(1, 1, 1);
    if (item.mesh.material instanceof THREE.MeshBasicMaterial) {
      item.mesh.material.color.setHex(color);
      item.mesh.material.opacity = 0.82;
    }
  }

  private release(item: FxItem): void {
    item.active = false;
    item.life = 0;
    item.mesh.visible = false;
    item.mesh.position.set(0, -999, 0);
  }

  private ring(position: THREE.Vector3, color: number, life: number, growth: number): void {
    const item = this.acquire('ring');
    if (!item) return;
    this.activate(item, position.clone().add(new THREE.Vector3(0, 0.33, 0)), color, life);
    item.mesh.rotation.x = -Math.PI / 2;
    item.startScale.set(0.16, 0.16, 0.16);
    item.endScale.set(growth, growth, growth);
  }

  private flash(position: THREE.Vector3, color: number, growth: number): void {
    const item = this.acquire('flash');
    if (!item) return;
    this.activate(item, position, color, 0.26);
    item.startScale.set(0.08, 0.08, 0.08);
    item.endScale.set(growth, growth * 0.72, growth);
  }

  private beam(position: THREE.Vector3, color: number, height: number): void {
    const item = this.acquire('beam');
    if (!item) return;
    this.activate(item, position.clone().add(new THREE.Vector3(0, height * 0.5 + 0.35, 0)), color, 0.5);
    item.startScale.set(0.18, 0.05, 0.18);
    item.endScale.set(1.2, height, 1.2);
  }

  private rays(position: THREE.Vector3, color: number, count: number): void {
    for (let i = 0; i < count; i += 1) {
      const item = this.acquire('ray');
      if (!item) break;
      const angle = (i / count) * Math.PI * 2;
      this.activate(item, position.clone().add(new THREE.Vector3(0, 0.37, 0)), i % 3 ? color : 0xffffff, 0.24);
      item.mesh.rotation.y = angle;
      item.startScale.set(0.08, 1, 0.08);
      item.endScale.set(0.9, 1, 1.5);
      item.mesh.position.x += Math.sin(angle) * 0.35;
      item.mesh.position.z += Math.cos(angle) * 0.35;
    }
  }

  private confetti(origin: THREE.Vector3, count: number, theme: EffectPalette): void {
    const palette = theme.confetti;

    for (let i = 0; i < count; i += 1) {
      const item = this.acquire('confetti');
      if (!item) break;
      const angle = Math.random() * Math.PI * 2;
      this.activate(item, origin, palette[i % palette.length], 0.74 + Math.random() * 0.22);
      item.velocity.set(
        Math.cos(angle) * (1.2 + Math.random()),
        1.9 + Math.random() * 1.1,
        Math.sin(angle) * (1.2 + Math.random()),
      );
      item.spin.set(5 + Math.random() * 5, 4 + Math.random() * 5, 5 + Math.random() * 5);
      item.startScale.setScalar(1);
      item.endScale.setScalar(0.05);
    }
  }

  private light(position: THREE.Vector3, color: number, peak: number, life = 0.42): void {
    const item = this.lights.find((entry) => !entry.active);
    if (!item) return;
    item.active = true;
    item.life = life;
    item.maxLife = life;
    item.peak = peak;
    item.light.color.setHex(color);
    item.light.position.copy(position);
    item.light.visible = true;
  }

  private easeOutCubic(t: number): number {
    return 1 - Math.pow(1 - t, 3);
  }
}
