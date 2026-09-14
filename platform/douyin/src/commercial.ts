import type {
  DouyinApi,
  DouyinBannerAd,
  DouyinInterstitialAd,
  DouyinRewardedVideoAd,
} from './api';
import { DOUYIN_PRODUCT_CONFIG } from './config';

export type RewardedResult = 'rewarded' | 'skipped' | 'unavailable';

export class DouyinCommercial {
  private rewarded: DouyinRewardedVideoAd | null = null;
  private banner: DouyinBannerAd | null = null;
  private bannerVisible = false;
  private readonly startedAt = Date.now();
  private lastInterstitialAt = 0;
  private interstitialBusy = false;

  constructor(private readonly api: DouyinApi) {
    this.prepareRewarded();
  }

  async showRewarded(): Promise<RewardedResult> {
    const ad = this.rewarded ?? this.prepareRewarded();
    if (!ad) return 'unavailable';

    return new Promise<RewardedResult>(async (resolve) => {
      let settled = false;
      const finish = (value: RewardedResult) => {
        if (settled) return;
        settled = true;
        ad.offClose?.(onClose);
        ad.offError?.(onError);
        resolve(value);
      };
      const onClose = (result: { isEnded?: boolean; count?: number }) => {
        finish(result.isEnded ? 'rewarded' : 'skipped');
      };
      const onError = () => finish('unavailable');

      ad.onClose(onClose);
      ad.onError(onError);

      try {
        await ad.load();
        await ad.show();
      } catch {
        finish('unavailable');
      }
    });
  }

  async maybeShowInterstitial(force = false): Promise<boolean> {
    if (!this.api.createInterstitialAd || this.interstitialBusy) return false;
    const now = Date.now();
    if (!force) {
      if (now - this.startedAt < 30_000) return false;
      if (this.lastInterstitialAt > 0 && now - this.lastInterstitialAt < 60_000) return false;
    }

    this.interstitialBusy = true;
    let ad: DouyinInterstitialAd | null = null;
    try {
      ad = this.api.createInterstitialAd({ adUnitId: DOUYIN_PRODUCT_CONFIG.ads.interstitial });
      await ad.load();
      await ad.show();
      this.lastInterstitialAt = Date.now();
      return true;
    } catch {
      return false;
    } finally {
      this.interstitialBusy = false;
      try { ad?.destroy(); } catch { /* native instance may already be invalid */ }
    }
  }

  showBanner(): void {
    if (!this.api.createBannerAd || this.bannerVisible) return;
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
      banner.onError(() => {
        if (this.banner === banner) {
          this.bannerVisible = false;
          this.banner = null;
        }
        try { banner.destroy(); } catch { /* ignore */ }
      });
      banner.onLoad(() => {
        if (this.banner !== banner) return;
        void banner.show().then(() => { this.bannerVisible = true; }).catch(() => {
          this.bannerVisible = false;
        });
      });
      this.banner = banner;
    } catch {
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
    this.rewarded = null;
  }

  private prepareRewarded(): DouyinRewardedVideoAd | null {
    if (!this.api.createRewardedVideoAd) return null;
    try {
      this.rewarded = this.api.createRewardedVideoAd({
        adUnitId: DOUYIN_PRODUCT_CONFIG.ads.rewarded,
      });
      return this.rewarded;
    } catch {
      this.rewarded = null;
      return null;
    }
  }
}
