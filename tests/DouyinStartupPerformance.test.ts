import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const scene = readFileSync(new URL('../platform/douyin/src/soloScene.ts', import.meta.url), 'utf8');
const productPass = readFileSync(new URL('../platform/douyin/src/m212ProductPass.ts', import.meta.url), 'utf8');
const browserScene = readFileSync(new URL('../src/rendering/GameScene.ts', import.meta.url), 'utf8');
const themePreview = readFileSync(new URL('../src/rendering/themes/ThemePreview.ts', import.meta.url), 'utf8');

describe('mobile release performance rescue', () => {
  it('keeps readable gameplay DPR while rendering the static health notice at device resolution', () => {
    expect(scene).toContain('private currentDpr = 1.75');
    expect(scene).toContain('? Math.min(3, this.devicePixelRatio)');
    expect(scene).toContain(': Math.min(this.currentDpr, this.devicePixelRatio)');
    expect(scene).toContain('this.applyDpr(1.4)');
    expect(scene).toContain('this.applyDpr(1.75)');
    expect(scene).toContain('this.applyDpr(2)');
    expect(scene).toContain("this.applyQuality('high')");
    expect(productPass).not.toContain('scene.samplePerformance =');
    expect(productPass).not.toContain('scene.applyQuality =');
  });

  it('prepares every Home theme before entry without restoring the old full-game preload', () => {
    expect(scene).toContain('this.online = DOUYIN_PRODUCT_CONFIG.launch.onlineEnabled');
    const start = scene.indexOf('private prepareStartupPreload(): void');
    const end = scene.indexOf('\n  private stepStartupPreload', start);
    const body = scene.slice(start, end);
    expect(body).toContain('const ordered: ThemeId[] = [this.currentTheme]');
    expect(body).toContain('for (const value of [32, 64, 128, 256, 512, 1024])');
    expect(body).toContain('this.homePreparedThemes.add(theme)');
    expect(body).not.toContain('this.audio.preloadTheme(theme)');
    expect(body).not.toContain('[2048]');
    expect(scene).not.toContain('private prepareHomeThemeWarmup(): void');
    expect(scene).not.toContain('private stepHomeThemeWarmup(): void');
    expect(scene).toContain("text: '主题资源仍在准备，请稍候'");
    const gpuStart = scene.indexOf('private prewarmThemeGpu(theme: ThemeId): void');
    const gpuEnd = scene.indexOf('\n  private startupPreloadProgress', gpuStart);
    expect(scene.slice(gpuStart, gpuEnd)).toContain('this.boardView.reset(HOME_TILES)');
  });

  it('pauses browser WebGL on Home and defers generated theme previews', () => {
    expect(browserScene).toContain('if (enabled) {');
    expect(browserScene).toContain('cancelAnimationFrame(this.raf)');
    expect(browserScene).toContain('this.startLoop()');
    expect(themePreview).toContain('requestIdleCallback');
    expect(themePreview).toContain('return () => {');
    expect(themePreview).toContain('cancelIdleCallback');
    expect(themePreview).not.toContain('export function themePreviews()');
  });
});
