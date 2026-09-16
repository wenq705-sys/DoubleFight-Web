import { describe, expect, it, vi } from 'vitest';
import { DouyinSocial } from '../platform/douyin/src/social';

describe('Douyin native ranking adapters', () => {
  it('stores ascension time as a visible enum with inverted priority', async () => {
    const setImRankData = vi.fn((options: any) => options.success?.({ errMsg: 'ok' }));
    const social = new DouyinSocial({ setImRankData } as any);

    expect(await social.setAscensionRank('palace', 125_430)).toBe(true);
    expect(setImRankData).toHaveBeenCalledWith(expect.objectContaining({
      dataType: 1,
      value: '02:05.43',
      priority: 1_999_874_570,
      zoneId: 'ascension-palace',
    }));
  });

  it('opens Solo as a weekly native rank and PvP as an all-time season surface', async () => {
    const getImRankList = vi.fn((options: any) => options.success?.({ errMsg: 'ok' }));
    const social = new DouyinSocial({ getImRankList } as any);

    expect(await social.openSoloRank()).toBe(true);
    expect(getImRankList.mock.calls[0]?.[0]).toEqual(expect.objectContaining({
      dataType: 0,
      rankType: 'week',
      zoneId: 'solo',
    }));

    expect(await social.openPvpRank()).toBe(true);
    expect(getImRankList.mock.calls[1]?.[0]).toEqual(expect.objectContaining({
      dataType: 0,
      rankType: 'all',
      zoneId: 'pvp',
    }));
  });
});
