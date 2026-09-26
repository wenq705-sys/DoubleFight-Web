import type {
  DouyinApi,
  DouyinAdError,
  DouyinBannerAd,
  DouyinInterstitialAd,
  DouyinRewardedVideoAd,
} from './api';
import { DOUYIN_PRODUCT_CONFIG } from './config';

export type RewardedResult = 'rewarded' | 'skipped' | 'unavailable';

export class DouyinCommercial {
  private rewarded: DouyinRewardedVideoAd | null = null;
  private rewardedBusy = false;
  private banner: DouyinBannerAd | null = null;
  private bannerVisible = false;
  private readonly startedAt = Date.now();
  private lastInterstitialAt = 0;
  private lastRewardedAt = 0;
  private rewardedTriggerTimes: number[] = [];
  private interstitialBusy = false;
  private lastAdError: DouyinAdError | null = null;

  constructor(private readonly api: DouyinApi) {}

  lastFailureHint(): string {
    const error = this.lastAdError;
    if (!error) return '';
    const code = error.errNo ?? error.errCode;
    return code !== undefined ? `（广告错误 ${code}）` : '（广告服务暂不可用）';
  }

  private rememberError(error: unknown): void {
    if (error && typeof error === 'object') {
      const value = error as DouyinAdError;
      this.lastAdError = { errCode: value.errCode, errNo: value.errNo, errMsg: value.errMsg };
      return;
    }
    this.lastAdError = { errMsg: String(error ?? 'unknown') };
  }

  async showRewarded(): Promise<RewardedResult> {
    this.lastAdError = null;
    // Douyin traffic-master rules require the rewarded ad request to be
    // created only after the user's explicit tap. Never pre-create it.
    if (this.rewardedBusy) return 'unavailable';
    const now = Date.now();
    this.rewardedTriggerTimes = this.rewardedTriggerTimes.filter(timestamp => now - timestamp < 60_000);
    if (this.rewardedTriggerTimes.length >= 5) return 'unavailable';
    const ad = this.prepareRewarded();
    if (!ad) return 'unavailable';
    this.rewardedTriggerTimes.push(now);
    this.rewardedBusy = true;

    return new Promise<RewardedResult>(async (resolve) => {
      let settled = false;
      const finish = (value: RewardedResult) => {
        if (settled) return;
        settled = true;
        ad.offClose?.(onClose);
        ad.offError?.(onError);
        this.rewardedBusy = false;
        resolve(value);
      };
      const onClose = (result: { isEnded?: boolean; count?: number }) => {
        this.lastRewardedAt = Date.now();
        finish(result.isEnded ? 'rewarded' : 'skipped');
      };
      const onError = (error: DouyinAdError) => {
        this.rememberError(error);
        finish('unavailable');
      };

      ad.onClose(onClose);
      ad.onError(onError);

      try {
        await ad.load();
        await ad.show();
      } catch (error) {
        this.rememberError(error);
        finish('unavailable');
      }
    });
  }

  async maybeShowInterstitial(force = false): Promise<boolean> {
    this.lastAdError = null;
    if (!this.api.createInterstitialAd || this.interstitialBusy) return false;
    const now = Date.now();
    if (!force) {
      if (now - this.startedAt < 30_000) return false;
      if (this.lastInterstitialAt > 0 && now - this.lastInterstitialAt < 60_000) return false;
      if (this.lastRewardedAt > 0 && now - this.lastRewardedAt < 60_000) return false;
    }

    this.interstitialBusy = true;
    let ad: DouyinInterstitialAd | null = null;
    let shown = false;
    try {
      ad = this.api.createInterstitialAd({ adUnitId: DOUYIN_PRODUCT_CONFIG.ads.interstitial });
      const instance = ad;
      instance.onClose(() => {
        try { instance.destroy(); } catch { /* native instance may already be invalid */ }
      });
      instance.onError((error) => {
        this.rememberError(error);
        try { instance.destroy(); } catch { /* native instance may already be invalid */ }
      });
      await instance.load();
      await instance.show();
      shown = true;
      this.lastInterstitialAt = Date.now();
      return true;
    } catch (error) {
      this.rememberError(error);
      return false;
    } finally {
      this.interstitialBusy = false;
      if (!shown) {
        try { ad?.destroy(); } catch { /* ignore invalid native instance */ }
      }
    }
  }

  showBanner(): void {
    if (this.bannerVisible) return;
    if (this.banner) {
      try {
        void this.banner.show().then(() => { this.bannerVisible = true; }).catch((error) => {
          this.rememberError(error);
          this.bannerVisible = false;
        });
      } catch {
        this.bannerVisible = false;
      }
      return;
    }
    if (!this.api.createBannerAd) return;

    const info = this.api.getSystemInfoSync();
    const windowWidth = Math.max(1, info.windowWidth ?? info.screenWidth);
    const windowHeight = Math.max(1, info.windowHeight ?? info.screenHeight);
    const targetWidth = Math.min(windowWidth, Math.max(300, Math.floor(windowWidth * 0.86)));

    try {
      const banner = this.api.createBannerAd({
        adUnitId: DOUYIN_PRODUCT_CONFIG.ads.banner,
        style: {
          width: targetWidth,
          left: Math.max(0, (windowWidth - targetWidth) / 2),
          top: Math.max(0, windowHeight - 90),
        },
      });
      banner.onResize((size) => {
        banner.style.left = Math.max(0, (windowWidth - size.width) / 2);
        banner.style.top = Math.max(0, windowHeight - size.height);
      });
      banner.onError((error) => {
        this.rememberError(error);
        if (this.banner === banner) {
          this.bannerVisible = false;
          this.banner = null;
        }
        try { banner.destroy(); } catch { /* ignore */ }
      });
      banner.onLoad(() => {
        if (this.banner !== banner) return;
        void banner.show().then(() => { this.bannerVisible = true; }).catch((error) => {
          this.rememberError(error);
          this.bannerVisible = false;
        });
      });
      this.banner = banner;
    } catch (error) {
      this.rememberError(error);
      this.banner = null;
      this.bannerVisible = false;
    }
  }

  hideBanner(): void {
    this.bannerVisible = false;
    try { void this.banner?.hide(); } catch { /* unsupported host */ }
  }

  destroyBanner(): void {
    this.bannerVisible = false;
    try { this.banner?.destroy(); } catch { /* ignore */ }
    this.banner = null;
  }

  dispose(): void {
    this.destroyBanner();
    this.rewardedBusy = false;
    try { this.rewarded?.destroy?.(); } catch { /* optional native cleanup */ }
    this.rewarded = null;
  }

  private prepareRewarded(): DouyinRewardedVideoAd | null {
    if (this.rewarded) return this.rewarded;
    if (!this.api.createRewardedVideoAd) {
      this.rememberError({ errMsg: 'createRewardedVideoAd unavailable' });
      return null;
    }
    try {
      this.rewarded = this.api.createRewardedVideoAd({
        adUnitId: DOUYIN_PRODUCT_CONFIG.ads.rewarded,
      });
      return this.rewarded;
    } catch (error) {
      this.rememberError(error);
      this.rewarded = null;
      return null;
    }
  }
}
