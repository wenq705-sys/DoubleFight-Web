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

  it('uses the exact official health-game notice title and copy', () => {
    expect(source).toContain('《健康游戏忠告》');
    for (const line of [
      '抵制不良游戏，拒绝盗版游戏。',
      '注意自我保护，谨防受骗上当。',
      '适度游戏益脑，沉迷游戏伤身。',
      '合理安排时间，享受健康生活。',
    ]) {
      expect(source).toContain(line);
    }
    expect(source).not.toContain('健康游戏提示');
    expect(source).not.toContain('请合理安排游戏时间，享受健康游戏体验');
  });

  it('preloads resources behind an isolated startup layer and only enables entry when ready', () => {
    expect(source).toContain("progress >= 1 ? '进入游戏' : '加载中…'");
    expect(source).toContain('正在加载游戏资源');
    expect(source).toContain('this.startupPreloadTasks.length === 0 && this.hit(x, y, button)');
    expect(source).toContain('this.prepareStartupPreload()');
    expect(source).toContain('this.prewarmThemeGpu(theme)');
    expect(source).toContain('if (this.healthNoticeOpen) {');
    expect(source).toContain('this.drawHealthNotice(ctx, width, height);');
    expect(source).toContain('this.uiTexture.needsUpdate = true;');
    expect(source).toContain('this.healthNoticeButton(info.width, info.height)');
  });
});
