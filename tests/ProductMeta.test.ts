import { describe, expect, it } from 'vitest';
import { LEADERBOARDS, PVP_SEASON_DAYS, S_COIN, THEME_ACCESS, competitiveRankLabel, competitiveRankProgress } from '../src/meta/productMeta';

describe('S Coin product economy', () => {
  it('keeps the V1 economy ad-funded and theme-focused', () => {
    expect(S_COIN.dailyLogin).toBe(15);
    expect(S_COIN.dailyRewardedBonus).toBe(30);
    expect(S_COIN.themeUnlock).toBe(100);
    expect(S_COIN.dailyRewardedBonus).toBe(S_COIN.dailyLogin * 2);
    expect(THEME_ACCESS.kingdom).toMatchObject({ free: true, permanentPrice: 0, rewardedUnlockViews: 0 });
    expect(THEME_ACCESS.palace).toMatchObject({ free: false, permanentPrice: 100, rewardedUnlockViews: 2 });
    expect(THEME_ACCESS.zodiac).toMatchObject({ free: false, permanentPrice: 180, rewardedUnlockViews: 3 });
    expect(THEME_ACCESS.candy).toMatchObject({ free: false, permanentPrice: 280, rewardedUnlockViews: 4 });
    expect(THEME_ACCESS.dreamhouse).toMatchObject({ free: false, permanentPrice: 400, rewardedUnlockViews: 5 });
  });
});

describe('competitive presentation', () => {
  it('maps rating into a compact six-rank ladder', () => {
    expect(competitiveRankLabel(1000)).toBe('青铜 一段');
    expect(competitiveRankLabel(1250)).toBe('黄金 三段');
    expect(competitiveRankLabel(1900)).toBe('王者');
    expect(competitiveRankProgress(1900)).toBe(1);
  });

  it('defines three non-overlapping leaderboard goals', () => {
    expect(PVP_SEASON_DAYS).toBe(14);
    expect(LEADERBOARDS.map(value => value.id)).toEqual(['ascension', 'solo_weekly', 'pvp_season']);
    expect(new Set(LEADERBOARDS.map(value => value.authority)).size).toBe(3);
  });
});
