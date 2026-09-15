import { afterEach, describe, expect, it, vi } from 'vitest';
import { DouyinCommercial } from '../platform/douyin/src/commercial';
import { DouyinSocial } from '../platform/douyin/src/social';
import { DOUYIN_PRODUCT_CONFIG } from '../platform/douyin/src/config';
import type {
  DouyinApi,
  DouyinBannerAd,
  DouyinInterstitialAd,
  DouyinRewardedVideoAd,
  DouyinShowOptions,
} from '../platform/douyin/src/api';

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

function minimalApi(extra: Partial<DouyinApi> = {}): DouyinApi {
  return {
    createCanvas: vi.fn() as unknown as DouyinApi['createCanvas'],
    getSystemInfoSync: () => ({ screenWidth: 390, screenHeight: 844, windowWidth: 390, windowHeight: 844, pixelRatio: 3 }),
    onTouchStart: vi.fn(),
    onTouchMove: vi.fn(),
    onTouchEnd: vi.fn(),
    onTouchCancel: vi.fn(),
    onShow: vi.fn(),
    onHide: vi.fn(),
    connectSocket: vi.fn() as unknown as DouyinApi['connectSocket'],
    ...extra,
  };
}

describe('Douyin commercial services', () => {
  it('grants rewarded result only after native close reports a completed video', async () => {
    let close: ((value: { isEnded?: boolean; count?: number }) => void) | undefined;
    let error: ((value: { errMsg?: string }) => void) | undefined;
    const rewarded = {
      load: vi.fn(async () => undefined),
      show: vi.fn(async () => undefined),
      onLoad: vi.fn(),
      offLoad: vi.fn(),
      onError: vi.fn((listener) => { error = listener; }),
      offError: vi.fn((listener) => { if (error === listener) error = undefined; }),
      onClose: vi.fn((listener) => { close = listener; }),
      offClose: vi.fn((listener) => { if (close === listener) close = undefined; }),
    } as DouyinRewardedVideoAd;
    const api = minimalApi({ createRewardedVideoAd: vi.fn(() => rewarded) });
    const commercial = new DouyinCommercial(api);

    const pending = commercial.showRewarded();
    await Promise.resolve();
    await Promise.resolve();
    close?.({ isEnded: true, count: 1 });

    await expect(pending).resolves.toBe('rewarded');
    expect(rewarded.load).toHaveBeenCalledOnce();
    expect(rewarded.show).toHaveBeenCalledOnce();
    expect(api.createRewardedVideoAd).toHaveBeenCalledWith({
      adUnitId: DOUYIN_PRODUCT_CONFIG.ads.rewarded,
    });
  });

  it('returns skipped when rewarded video is closed early', async () => {
    let close: ((value: { isEnded?: boolean; count?: number }) => void) | undefined;
    const rewarded = {
      load: vi.fn(async () => undefined),
      show: vi.fn(async () => undefined),
      onLoad: vi.fn(),
      onError: vi.fn(),
      offError: vi.fn(),
      onClose: vi.fn((listener) => { close = listener; }),
      offClose: vi.fn(),
    } as DouyinRewardedVideoAd;
    const commercial = new DouyinCommercial(minimalApi({ createRewardedVideoAd: () => rewarded }));

    const pending = commercial.showRewarded();
    await Promise.resolve();
    close?.({ isEnded: false, count: 0 });
    await expect(pending).resolves.toBe('skipped');
  });

  it('keeps an interstitial alive after show until the native close event', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-14T00:00:00Z'));
    let close: (() => void) | undefined;
    const interstitial = {
      load: vi.fn(async () => undefined),
      show: vi.fn(async () => undefined),
      destroy: vi.fn(),
      onLoad: vi.fn(),
      onError: vi.fn(),
      onClose: vi.fn((listener) => { close = listener; }),
    } as DouyinInterstitialAd;
    const commercial = new DouyinCommercial(minimalApi({
      createInterstitialAd: vi.fn(() => interstitial),
    }));

    await expect(commercial.maybeShowInterstitial(true)).resolves.toBe(true);
    expect(interstitial.destroy).not.toHaveBeenCalled();
    close?.();
    expect(interstitial.destroy).toHaveBeenCalledOnce();
  });

  it('positions banner from real native resize and destroys it safely', async () => {
    let load: (() => void) | undefined;
    let resize: ((size: { width: number; height: number }) => void) | undefined;
    const banner = {
      style: {},
      show: vi.fn(async () => undefined),
      hide: vi.fn(async () => undefined),
      destroy: vi.fn(),
      onLoad: vi.fn((listener) => { load = listener; }),
      onError: vi.fn(),
      onResize: vi.fn((listener) => { resize = listener; }),
    } as DouyinBannerAd;
    const createBannerAd = vi.fn(() => banner);
    const commercial = new DouyinCommercial(minimalApi({ createBannerAd }));

    commercial.showBanner();
    load?.();
    await Promise.resolve();
    resize?.({ width: 320, height: 54 });

    expect(createBannerAd).toHaveBeenCalledWith(expect.objectContaining({
      adUnitId: DOUYIN_PRODUCT_CONFIG.ads.banner,
    }));
    expect(banner.style.left).toBe(35);
    expect(banner.style.top).toBe(790);
    commercial.destroyBanner();
    expect(banner.destroy).toHaveBeenCalledOnce();
  });
});

describe('Douyin social retention services', () => {
  it('reads shared room launch query and emits invite share with room deep link', async () => {
    let showListener: ((options?: DouyinShowOptions) => void) | undefined;
    let shareOptions: Parameters<NonNullable<DouyinApi['shareAppMessage']>>[0] | undefined;
    const api = minimalApi({
      getLaunchOptionsSync: () => ({ query: { room: '123456' } }),
      onShow: vi.fn((listener) => { showListener = listener; }),
      shareAppMessage: vi.fn((options) => {
        shareOptions = options;
        options.success?.();
      }),
    });
    const social = new DouyinSocial(api);

    expect(social.launchRoomCode()).toBe('123456');
    await expect(social.shareRoom('123456')).resolves.toBe(true);
    expect(shareOptions?.query).toBe('room=123456');

    showListener?.({ launch_from: 'homepage', location: 'sidebar_card' });
    expect(social.cameFromSidebar()).toBe(true);
  });

  it('checks/navigates sidebar and writes/opens the Solo rank', async () => {
    const setImRankData = vi.fn((options: Parameters<NonNullable<DouyinApi['setImRankData']>>[0]) => options.success?.());
    const getImRankList = vi.fn((options: Parameters<NonNullable<DouyinApi['getImRankList']>>[0]) => options.success?.());
    const navigateToScene = vi.fn((options: Parameters<NonNullable<DouyinApi['navigateToScene']>>[0]) => options.success?.());
    const api = minimalApi({
      checkScene: vi.fn((options) => options.success?.({ isExist: true })),
      navigateToScene,
      setImRankData,
      getImRankList,
    });
    const social = new DouyinSocial(api);

    await expect(social.supportsSidebar()).resolves.toBe(true);
    await expect(social.navigateSidebar()).resolves.toBe(true);
    expect(navigateToScene).toHaveBeenCalledWith(expect.objectContaining({ scene: 'sidebar' }));
    await expect(social.setSoloRank(2048)).resolves.toBe(true);
    await expect(social.openSoloRank()).resolves.toBe(true);

    expect(setImRankData).toHaveBeenCalledWith(expect.objectContaining({
      dataType: 0,
      value: '2048',
      zoneId: DOUYIN_PRODUCT_CONFIG.ranking.soloZone,
    }));
    expect(getImRankList).toHaveBeenCalledWith(expect.objectContaining({
      relationType: 'default',
      rankType: 'week',
      zoneId: DOUYIN_PRODUCT_CONFIG.ranking.soloZone,
    }));
  });
});
