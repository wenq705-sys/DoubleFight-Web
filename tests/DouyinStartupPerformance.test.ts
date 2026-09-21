import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const scene = readFileSync(new URL('../platform/douyin/src/soloScene.ts', import.meta.url), 'utf8');

describe('Douyin startup and home-swipe performance', () => {
  it('starts conservatively and only promotes to high quality after sustained good frames', () => {
    expect(scene).toContain("private quality: 'high' | 'medium' | 'low' = 'medium'");
    expect(scene).toContain("const dpr = Math.min(1.28, this.devicePixelRatio)");
    expect(scene).toContain("this.boardView.setQuality('medium')");
    expect(scene).toContain('if (this.goodPerfWindows >= 3)');
    expect(scene).toContain("this.applyQuality('high', 1.5)");
  });

  it('does not rebuild and prewarm the Home snapshot twice on each theme swipe', () => {
    const start = scene.indexOf('setTheme(theme: ThemeId): void');
    const end = scene.indexOf('\n  render(): void', start);
    const body = scene.slice(start, end);
    expect(body).not.toContain('this.boardView.prewarmTheme(theme)');
    expect(body).not.toContain("this.mode === 'home'");
    expect(body.match(/this\.boardView\.setTheme\(theme\)/g)?.length).toBe(1);
  });
});
