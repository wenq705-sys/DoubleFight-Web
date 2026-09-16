import { describe, expect, it } from 'vitest';
import { ensureTouchRect, hitTarget, skillUiIcon, uiMetrics } from '../platform/douyin/src/uiSystem';

describe('M2.13 adaptive mobile UI metrics', () => {
  it.each([
    ['iPhone SE', 375, 667, { top: 20, bottom: 0 }, 0],
    ['iPhone 15 Pro', 393, 852, { top: 59, bottom: 34 }, 0],
    ['iPhone Pro Max', 430, 932, { top: 59, bottom: 34 }, 0],
    ['Android 20:9', 360, 800, { top: 28, bottom: 24 }, 0],
    ['Android large', 412, 915, { top: 32, bottom: 24 }, 0],
    ['Douyin host chrome', 390, 844, { top: 47, bottom: 34 }, 92],
  ])('keeps safe layout and touch size on %s', (_name, width, height, safe, menuBottom) => {
    const metrics = uiMetrics(width, height, safe, menuBottom);
    expect(metrics.minTouch).toBeGreaterThanOrEqual(44);
    expect(metrics.edge).toBeGreaterThanOrEqual(12);
    expect(metrics.top).toBeGreaterThanOrEqual(Math.max(12, safe.top + 8, menuBottom + 8));
    expect(metrics.bottom).toBeGreaterThanOrEqual(Math.max(16, safe.bottom + 12));
    expect(metrics.contentWidth).toBeGreaterThan(250);
    expect(metrics.scale).toBeGreaterThanOrEqual(.88);
    expect(metrics.scale).toBeLessThanOrEqual(1.12);
  });

  it('classifies short and tall mobile canvases without relying on one reference phone', () => {
    expect(uiMetrics(320, 568).compact).toBe(true);
    expect(uiMetrics(390, 844).compact).toBe(false);
    expect(uiMetrics(430, 932).tall).toBe(true);
  });

  it('expands visually small controls to a reliable touch target without changing their visual rect', () => {
    const visual = { x: 100, y: 200, width: 28, height: 28 };
    const touch = ensureTouchRect(visual, 48);
    expect(touch).toEqual({ x: 90, y: 190, width: 48, height: 48 });
    expect(hitTarget(91, 191, visual, 48)).toBe(true);
    expect(hitTarget(89, 189, visual, 48)).toBe(false);
  });

  it('maps every PvP skill to dedicated non-emoji vector art', () => {
    expect(new Set(['random_clear', 'shield', 'petrify', 'shuffle', 'purify'].map(skillUiIcon))).toEqual(new Set([
      'skill-clear', 'skill-shield', 'skill-petrify', 'skill-shuffle', 'skill-purify',
    ]));
  });
});
