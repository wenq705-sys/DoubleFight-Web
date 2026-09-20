import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('Douyin startup health reminder', () => {
  const source = readFileSync(new URL('../platform/douyin/src/soloScene.ts', import.meta.url), 'utf8');

  it('shows the health reminder before normal gameplay input', () => {
    expect(source).toContain('private healthNoticeOpen = true');
    expect(source).toContain("if (this.healthNoticeOpen || this.onboardingOpen) return");
    expect(source).toContain("this.audio.suspend()");
    expect(source).toContain("this.audio.resume()");
  });

  it.each([
    '抵制不良游戏，拒绝盗版游戏',
    '注意自我保护，谨防受骗上当',
    '适度游戏益脑，沉迷游戏伤身',
    '合理安排时间，享受健康生活',
  ])('contains required health reminder copy: %s', line => {
    expect(source).toContain(line);
  });

  it('requires an explicit enter-game tap instead of silently dismissing', () => {
    expect(source).toContain("ctx.fillText('进入游戏'");
    expect(source).toContain('this.healthNoticeButton(info.width, info.height)');
  });
});
