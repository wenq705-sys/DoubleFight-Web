import type { DouyinApi, DouyinLaunchOptions, DouyinShowOptions } from './api';
import { DOUYIN_PRODUCT_CONFIG } from './config';

export class DouyinSocial {
  private latestShow: DouyinShowOptions;
  private sidebarSupported: boolean | null = null;

  constructor(private readonly api: DouyinApi) {
    this.latestShow = this.safeLaunchOptions();
    try {
      api.onShow((options) => {
        if (options) this.latestShow = options;
      });
    } catch { /* optional host signal */ }
  }

  launchRoomCode(): string | null {
    const launch = this.safeLaunchOptions();
    const value = launch.query?.room ?? launch.query?.roomCode;
    const code = String(value ?? '').replace(/\D/g, '').slice(0, 6);
    return code.length === 6 ? code : null;
  }

  async shareRoom(roomCode: string): Promise<boolean> {
    if (!this.api.shareAppMessage) return false;
    const code = roomCode.replace(/\D/g, '').slice(0, 6);
    if (code.length !== 6) return false;
    return new Promise(resolve => {
      try {
        this.api.shareAppMessage?.({
          channel: 'invite',
          templateId: DOUYIN_PRODUCT_CONFIG.share.templateId || undefined,
          title: '来一局双数对决',
          desc: '2048 不只拼分数，带技能和好友实时对战。',
          query: `room=${code}`,
          success: () => resolve(true),
          fail: () => resolve(false),
        });
      } catch {
        resolve(false);
      }
    });
  }

  async shareResult(score: number, won: boolean): Promise<boolean> {
    if (!this.api.shareAppMessage) return false;
    return new Promise(resolve => {
      try {
        this.api.shareAppMessage?.({
          title: won ? '我刚赢下一局双数对决' : '这局差一点，来挑战我',
          desc: `本局 ${Math.max(0, Math.floor(score))} 分，看看你能不能超过我。`,
          query: 'from=result',
          success: () => resolve(true),
          fail: () => resolve(false),
        });
      } catch {
        resolve(false);
      }
    });
  }

  async supportsSidebar(): Promise<boolean> {
    if (this.sidebarSupported !== null) return this.sidebarSupported;
    if (!this.api.checkScene) {
      this.sidebarSupported = false;
      return false;
    }
    this.sidebarSupported = await new Promise<boolean>(resolve => {
      try {
        this.api.checkScene?.({
          scene: 'sidebar',
          success: result => resolve(Boolean(result.isExist)),
          fail: () => resolve(false),
        });
      } catch {
        resolve(false);
      }
    });
    return this.sidebarSupported;
  }

  async navigateSidebar(): Promise<boolean> {
    if (!this.api.navigateToScene || !(await this.supportsSidebar())) return false;
    return new Promise(resolve => {
      try {
        this.api.navigateToScene?.({
          scene: 'sidebar',
          success: () => resolve(true),
          fail: () => resolve(false),
        });
      } catch {
        resolve(false);
      }
    });
  }

  cameFromSidebar(): boolean {
    return this.latestShow.launch_from === 'homepage'
      && this.latestShow.location === 'sidebar_card';
  }

  async setSoloRank(score: number): Promise<boolean> {
    if (!this.api.setImRankData || score < 0) return false;
    return new Promise(resolve => {
      try {
        this.api.setImRankData?.({
          dataType: 0,
          value: String(Math.max(0, Math.floor(score))),
          priority: 0,
          zoneId: DOUYIN_PRODUCT_CONFIG.ranking.soloZone,
          success: () => resolve(true),
          fail: () => resolve(false),
        });
      } catch {
        resolve(false);
      }
    });
  }

  async openSoloRank(): Promise<boolean> {
    if (!this.api.getImRankList) return false;
    return new Promise(resolve => {
      try {
        this.api.getImRankList?.({
          relationType: 'default',
          dataType: 0,
          rankType: 'all',
          suffix: '分',
          rankTitle: '双数对决 · 最高分',
          zoneId: DOUYIN_PRODUCT_CONFIG.ranking.soloZone,
          success: () => resolve(true),
          fail: () => resolve(false),
        });
      } catch {
        resolve(false);
      }
    });
  }

  private safeLaunchOptions(): DouyinLaunchOptions {
    try { return this.api.getLaunchOptionsSync?.() ?? {}; }
    catch { return {}; }
  }
}
