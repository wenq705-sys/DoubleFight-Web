import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const scene = readFileSync(new URL('../platform/douyin/src/soloScene.ts', import.meta.url), 'utf8');
const productPass = readFileSync(new URL('../platform/douyin/src/m212ProductPass.ts', import.meta.url), 'utf8');
const browserScene = readFileSync(new URL('../src/rendering/GameScene.ts', import.meta.url), 'utf8');
const themePreview = readFileSync(new URL('../src/rendering/themes/ThemePreview.ts', import.meta.url), 'utf8');

describe('mobile release performance rescue', () => {
  it('keeps readable gameplay DPR while rendering the static health notice at device resolution', () => {
    expect(scene).toContain('private currentDpr = 1.75');
    expect(scene).toContain('private screenDpr = 1');
    expect(scene).toContain('? Math.min(3, this.devicePixelRatio)');
    expect(scene).toContain(': Math.min(2.25, this.devicePixelRatio)');
    expect(scene).toContain('private readonly worldTarget = new THREE.WebGLRenderTarget');
    expect(scene).toContain('this.renderer.setRenderTarget(this.worldTarget)');
    expect(scene).toContain('this.renderer.render(this.compositeScene, this.compositeCamera)');
    expect(scene).toContain('toneMapped: false');
    expect(scene).toContain('this.applyDpr(1.4)');
    expect(scene).toContain('this.applyDpr(1.75)');
    expect(scene).toContain('this.applyDpr(2)');
    expect(scene).toContain("this.applyQuality('high')");
    expect(productPass).not.toContain('scene.samplePerformance =');
    expect(productPass).not.toContain('scene.applyQuality =');
  });

  it('gates startup only on the current Home theme and warms other themes incrementally', () => {
    expect(scene).toContain('this.online = DOUYIN_PRODUCT_CONFIG.launch.onlineEnabled');
    const start = scene.indexOf('private prepareStartupPreload(): void');
    const end = scene.indexOf('\n  private prepareHomeThemeWarmup', start);
    const body = scene.slice(start, end);
    expect(body).toContain('const theme = this.currentTheme');
    expect(body).toContain('this.boardView.prewarmTheme(theme, [value])');
    expect(body).not.toContain('for (const theme of THEME_IDS)');
    expect(body).not.toContain('this.audio.preloadTheme(theme)');
    expect(scene).toContain('private prepareHomeThemeWarmup(): void');
    expect(scene).toContain('private stepHomeThemeWarmup(): void');
    expect(scene).toContain("text: '正在准备主题资源…'");
    expect(scene).toContain('this.homeWarmupTasks = [...priority, ...rest]');
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
