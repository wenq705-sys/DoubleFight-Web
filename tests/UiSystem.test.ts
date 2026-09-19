import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { drawDouyinAvatar, ensureTouchRect, hitTarget, skillUiIcon, uiMetrics } from '../platform/douyin/src/uiSystem';

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

  it('keeps core Douyin product surfaces free of placeholder emoji UI art', () => {
    const banned = /[🎁🏆🌍⚔⚙📖🔔▶✦🎮✨🔥💎🎯🛡🗿🔀💧⚡]/u;
    const files = ['m212ProductPass.ts', 'm212RetentionHub.ts', 'soloScene.ts'];
    for (const file of files) {
      const source = readFileSync(new URL(`../platform/douyin/src/${file}`, import.meta.url), 'utf8');
      expect(source, `${file} contains placeholder emoji UI art`).not.toMatch(banned);
    }
  });
});

describe('Douyin avatar rendering', () => {
  it('loads one native image per avatar URL, caches it, and draws it after load', () => {
    const listeners: Partial<Record<'load' | 'error', (event: unknown) => void>> = {};
    const image = {
      src: '', width: 80, height: 64,
      addEventListener: (type: 'load' | 'error', listener: (event: unknown) => void) => { listeners[type] = listener; },
    };
    const platform = { createImage: vi.fn(() => image) } as any;
    const ctx = {
      save: vi.fn(), beginPath: vi.fn(), arc: vi.fn(), clip: vi.fn(), fillRect: vi.fn(),
      restore: vi.fn(), stroke: vi.fn(), drawImage: vi.fn(), fillText: vi.fn(),
      fillStyle: '', strokeStyle: '', lineWidth: 0, textAlign: 'left', textBaseline: 'alphabetic', font: '',
    } as any;
    const url = 'https://example.com/avatar-m216.png';
    drawDouyinAvatar(ctx, platform, url, 20, 20, 30, '强');
    drawDouyinAvatar(ctx, platform, url, 20, 20, 30, '强');
    expect(platform.createImage).toHaveBeenCalledOnce();
    expect(ctx.drawImage).not.toHaveBeenCalled();
    listeners.load?.({ type: 'load' });
    drawDouyinAvatar(ctx, platform, url, 20, 20, 30, '强');
    expect(ctx.drawImage).toHaveBeenCalledOnce();
  });
});