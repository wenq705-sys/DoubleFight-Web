import { describe, expect, it } from 'vitest';
import { DOUYIN_PRODUCT_CONFIG } from '../platform/douyin/src/config';

describe('Douyin Solo launch policy', () => {
  it('keeps unfinished competitive surfaces disabled for the first release', () => {
    expect(DOUYIN_PRODUCT_CONFIG.launch.onlineEnabled).toBe(false);
    expect(DOUYIN_PRODUCT_CONFIG.launch.sharedRoomInvitesEnabled).toBe(false);
    expect(DOUYIN_PRODUCT_CONFIG.launch.pvpRankingsEnabled).toBe(false);
  });
});
