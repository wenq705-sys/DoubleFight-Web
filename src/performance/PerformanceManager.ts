import type * as THREE from 'three';

export type QualityLevel = 'high' | 'medium' | 'low';

export interface PerformanceSnapshot {
  fps: number;
  frameMs: number;
  dpr: number;
  quality: QualityLevel;
  calls: number;
  triangles: number;
  geometries: number;
  textures: number;
}

export class PerformanceManager {
  private sampleTime = 0;
  private sampleFrames = 0;
  private goodWindows = 0;
  private currentDpr: number;
  private quality: QualityLevel;
  private snapshot: PerformanceSnapshot;

  constructor(
    private readonly renderer: THREE.WebGLRenderer,
    private readonly applyDpr: (dpr: number) => void,
    private readonly onQualityChange?: (quality: QualityLevel) => void,
    private readonly debugElement?: HTMLElement,
  ) {
    const device = Math.max(1, window.devicePixelRatio || 1);
    const mobile = this.isMobileLike();
    this.quality = mobile ? 'medium' : 'high';
    this.currentDpr = Math.min(device, mobile ? 1.75 : 1.9);
    this.snapshot = {
      fps: 60,
      frameMs: 16.7,
      dpr: this.currentDpr,
      quality: this.quality,
      calls: 0,
      triangles: 0,
      geometries: 0,
      textures: 0,
    };
    this.applyDpr(this.currentDpr);
    this.onQualityChange?.(this.quality);
  }

  frame(delta: number): void {
    if (!Number.isFinite(delta) || delta <= 0) return;
    this.sampleTime += delta;
    this.sampleFrames += 1;
    if (this.sampleTime < 2) return;

    const fps = this.sampleFrames / this.sampleTime;
    const frameMs = (this.sampleTime / this.sampleFrames) * 1000;
    this.sampleFrames = 0;
    this.sampleTime = 0;

    const info = this.renderer.info;
    this.snapshot = {
      fps,
      frameMs,
      dpr: this.currentDpr,
      quality: this.quality,
      calls: info.render.calls,
      triangles: info.render.triangles,
      geometries: info.memory.geometries,
      textures: info.memory.textures,
    };

    this.adapt(fps);
    this.renderDebug();
  }

  getSnapshot(): PerformanceSnapshot {
    return { ...this.snapshot };
  }

  private adapt(fps: number): void {
    const device = Math.max(1, window.devicePixelRatio || 1);
    const mobile = this.isMobileLike();
    const maxDpr = Math.min(device, mobile ? 2 : 1.9);
    const mediumDpr = Math.min(device, mobile ? 1.75 : 1.65);
    const lowDpr = Math.min(device, mobile ? 1.4 : 1.35);

    if (fps < 44) {
      this.goodWindows = 0;
      this.setDpr(lowDpr);
      this.setQuality('low');
      return;
    }

    if (fps < 54) {
      this.goodWindows = 0;
      this.setDpr(Math.min(this.currentDpr, mediumDpr));
      this.setQuality('medium');
      return;
    }

    if (fps >= 58) {
      this.goodWindows += 1;
      // Promotion is deliberately slow so resizing the render target cannot
      // become its own source of stutter on mobile devices.
      if (this.goodWindows >= 3 && this.quality === 'low') {
        this.setDpr(mediumDpr);
        this.setQuality('medium');
        this.goodWindows = 0;
        return;
      }
      if (this.goodWindows >= 4 && this.quality === 'medium') {
        this.setDpr(maxDpr);
        this.setQuality('high');
        this.goodWindows = 0;
      }
    } else {
      this.goodWindows = Math.max(0, this.goodWindows - 1);
    }
  }

  private setDpr(next: number): void {
    const rounded = Math.round(next * 100) / 100;
    if (Math.abs(rounded - this.currentDpr) < 0.02) return;
    this.currentDpr = rounded;
    this.applyDpr(this.currentDpr);
  }

  private setQuality(next: QualityLevel): void {
    if (next === this.quality) return;
    this.quality = next;
    this.onQualityChange?.(next);
  }

  private renderDebug(): void {
    if (!this.debugElement) return;
    const s = this.snapshot;
    this.debugElement.textContent =
      `FPS ${s.fps.toFixed(0)}  ·  ${s.frameMs.toFixed(1)}ms\n` +
      `DPR ${s.dpr.toFixed(2)}  ·  ${s.quality.toUpperCase()}\n` +
      `CALLS ${s.calls}  ·  TRIS ${Math.round(s.triangles / 1000)}k\n` +
      `GEO ${s.geometries}  ·  TEX ${s.textures}`;
  }

  private isMobileLike(): boolean {
    return window.innerWidth < 760 || window.matchMedia('(pointer: coarse)').matches;
  }
}
