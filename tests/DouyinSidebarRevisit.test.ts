import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { DouyinSocial } from '../platform/douyin/src/social';

describe('Douyin sidebar revisit review closure', () => {
  it('uses latest onShow state and notifies the product UI after a real sidebar return', () => {
    let onShow: ((options: any) => void) | undefined;
    const api: any = {
      getLaunchOptionsSync: () => ({}),
      onShow: (listener: (options: any) => void) => { onShow = listener; },
    };
    const social = new DouyinSocial(api);
    let returns = 0;
    social.subscribeSidebarReturn(() => { returns += 1; });

    onShow?.({
      scene: '021036',
      launch_from: 'homepage',
      location: 'sidebar_card',
      query: {},
    });

    expect(social.cameFromSidebar()).toBe(true);
    expect(returns).toBe(1);
  });

  it('calls the required navigateToScene sidebar API', async () => {
    const scenes: string[] = [];
    const api: any = {
      getLaunchOptionsSync: () => ({}),
      onShow: () => undefined,
      checkScene: ({ success }: any) => success({ isExist: true }),
      navigateToScene: ({ scene, success }: any) => {
        scenes.push(scene);
        success();
      },
    };
    const social = new DouyinSocial(api);
    await expect(social.navigateSidebar()).resolves.toBe(true);
    expect(scenes).toEqual(['sidebar']);
  });

  it('ships a complete, closable three-step sidebar task guide with both button states', () => {
    const source = readFileSync(new URL('../platform/douyin/src/m212RetentionHub.ts', import.meta.url), 'utf8');
    for (const copy of [
      '首页侧边栏入口奖励',
      '1. 点击下方「去首页侧边栏」',
      '2. 在侧边栏点击「双数对决」',
      '3. 返回游戏，点击「立即领奖」',
      '去首页侧边栏',
      '立即领奖',
      '今日已领取',
      '只有从首页侧边栏返回游戏后，才会完成本任务',
      '入口有奖',
    ]) {
      expect(source).toContain(copy);
    }
    expect(source).toContain("if (hit(x, y, layout.close))");
    expect(source).toContain("state.screen = null");
    expect(source).toContain("state.screen = 'sidebar'");
  });
});
