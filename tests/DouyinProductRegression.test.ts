import { afterEach, describe, expect, it, vi } from 'vitest';
import { DouyinCommercial } from '../platform/douyin/src/commercial';
import { DouyinSocial } from '../platform/douyin/src/social';
import type {
  DouyinApi,
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

describe('Douyin commercial frequency regression', () => {
  it('suppresses an interstitial for 60 seconds after a rewarded video closes', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-14T00:00:00Z'));

    let rewardedClose: ((value: { isEnded?: boolean; count?: number }) => void) | undefined;
    const rewarded = {
      load: vi.fn(async () => undefined),
      show: vi.fn(async () => undefined),
      onLoad: vi.fn(),
      offLoad: vi.fn(),
      onError: vi.fn(),
      offError: vi.fn(),
      onClose: vi.fn((listener) => { rewardedClose = listener; }),
      offClose: vi.fn(),
    } as DouyinRewardedVideoAd;

    const interstitial = {
      load: vi.fn(async () => undefined),
      show: vi.fn(async () => undefined),
      destroy: vi.fn(),
      onLoad: vi.fn(),
      onError: vi.fn(),
      onClose: vi.fn(),
    } as DouyinInterstitialAd;
    const createInterstitialAd = vi.fn(() => interstitial);

    const commercial = new DouyinCommercial(minimalApi({
      createRewardedVideoAd: () => rewarded,
      createInterstitialAd,
    }));

    const pending = commercial.showRewarded();
    await Promise.resolve();
    rewardedClose?.({ isEnded: true, count: 1 });
    await expect(pending).resolves.toBe('rewarded');

    vi.advanceTimersByTime(59_999);
    await expect(commercial.maybeShowInterstitial()).resolves.toBe(false);
    expect(createInterstitialAd).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    await expect(commercial.maybeShowInterstitial()).resolves.toBe(true);
    expect(createInterstitialAd).toHaveBeenCalledOnce();
  });
});

describe('Douyin warm-start room invite regression', () => {
  it('emits a private-room invite when the running mini-game is resumed from a share', () => {
    let showListener: ((options?: DouyinShowOptions) => void) | undefined;
    const api = minimalApi({
      getLaunchOptionsSync: () => ({ query: {} }),
      onShow: vi.fn((listener) => { showListener = listener; }),
    });
    const social = new DouyinSocial(api);
    const invite = vi.fn();
    social.subscribeRoomInvite(invite);

    showListener?.({ query: { room: '654321' } });
    expect(invite).toHaveBeenCalledExactlyOnceWith('654321');
    expect(social.launchRoomCode()).toBe('654321');
  });

  it('ignores malformed room parameters on warm resume', () => {
    let showListener: ((options?: DouyinShowOptions) => void) | undefined;
    const api = minimalApi({
      getLaunchOptionsSync: () => ({}),
      onShow: vi.fn((listener) => { showListener = listener; }),
    });
    const social = new DouyinSocial(api);
    const invite = vi.fn();
    social.subscribeRoomInvite(invite);

    showListener?.({ query: { room: '12-ab' } });
    expect(invite).not.toHaveBeenCalled();
    expect(social.launchRoomCode()).toBeNull();
  });
});
