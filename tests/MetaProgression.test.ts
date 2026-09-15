import { describe, expect, it } from 'vitest';
import { FINAL_PIECE_VALUE, PIECE_VALUES, formatDuration, isFinalPiece, pieceName, pieceTier, ratingRank } from '../src/meta/progression';
import { MONETIZATION_MODEL, PVP_SEASON_DURATION_MS, S_COIN } from '../shared/index';

describe('named meta progression', () => {
  it('maps hidden board values to theme-specific player-facing names', () => {
    expect(pieceName('kingdom', 64)).toBe('黄金塔');
    expect(pieceName('palace', 64)).toBe('妃');
    expect(pieceName('kingdom', FINAL_PIECE_VALUE)).toBe('王国奇观');
    expect(pieceName('palace', FINAL_PIECE_VALUE)).toBe('母仪天下');
  });

  it('keeps a common hidden tier across themes', () => {
    expect(pieceTier(2)).toBe(1);
    expect(pieceTier(64)).toBe(6);
    expect(pieceTier(2048)).toBe(11);
    expect(pieceTier(12)).toBe(0);
    expect(isFinalPiece(1024)).toBe(false);
    expect(isFinalPiece(2048)).toBe(true);
  });

  it('keeps the ad-only economy balanced around one soft currency', () => {
    expect(MONETIZATION_MODEL).toBe('ads_only');
    expect(S_COIN.dailyLogin).toBe(15);
    expect(S_COIN.dailyRewardedBonus).toBe(30);
    expect(S_COIN.themePermanentUnlock).toBe(500);
    expect(PIECE_VALUES).toHaveLength(11);
    expect(PVP_SEASON_DURATION_MS).toBe(14 * 24 * 60 * 60 * 1000);
  });

  it('formats ascension duration and PvP rank labels', () => {
    expect(formatDuration(462_310)).toBe('07:42');
    expect(formatDuration(null)).toBe('--:--');
    expect(ratingRank(1000).label).toBe('白银 I');
    expect(ratingRank(1080).label).toBe('黄金 II');
    expect(ratingRank(1810).label).toBe('王者');
  });
});
