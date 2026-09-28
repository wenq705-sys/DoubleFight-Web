import { S_COIN_ECONOMY, THEME_UNLOCK_ECONOMY } from '../../shared/index';
import type { ThemeId } from '../config/themes';

export const S_COIN = {
  dailyLogin: S_COIN_ECONOMY.dailyLogin,
  dailyRewardedBonus: S_COIN_ECONOMY.dailyRewardedAd,
  sidebarReturn: S_COIN_ECONOMY.sidebarReturn,
  dailyTask: S_COIN_ECONOMY.dailyTask,
  dailyTaskCount: 3,
  firstDiscovery: S_COIN_ECONOMY.discoveryPerTier,
  sevenDayChest: S_COIN_ECONOMY.sevenDayChest,
  themeUnlock: THEME_UNLOCK_ECONOMY.palace.coinCost,
} as const;

export const PVP_SEASON_DAYS = 14;

export interface CompetitiveRank {
  id: 'bronze' | 'silver' | 'gold' | 'platinum' | 'diamond' | 'king';
  label: string;
  division: '三段' | '二段' | '一段' | null;
  floor: number;
  nextFloor: number | null;
}

const DIVISIONS = [
  { id: 'bronze' as const, label: '青铜', floor: 0 },
  { id: 'silver' as const, label: '白银', floor: 1100 },
  { id: 'gold' as const, label: '黄金', floor: 1250 },
  { id: 'platinum' as const, label: '铂金', floor: 1450 },
  { id: 'diamond' as const, label: '钻石', floor: 1650 },
  { id: 'king' as const, label: '王者', floor: 1900 },
] as const;

export function competitiveRank(rating: number): CompetitiveRank {
  const safe = Math.max(0, Math.floor(Number.isFinite(rating) ? rating : 1000));
  let index = 0;
  for (let i = 0; i < DIVISIONS.length; i += 1) if (safe >= DIVISIONS[i].floor) index = i;
  const base = DIVISIONS[index];
  const next = DIVISIONS[index + 1] ?? null;
  if (base.id === 'king') return { ...base, division: null, nextFloor: null };

  const span = Math.max(1, (next?.floor ?? base.floor + 300) - base.floor);
  const within = Math.max(0, Math.min(span - 1, safe - base.floor));
  const third = span / 3;
  const division: '三段' | '二段' | '一段' = within < third ? '三段' : within < third * 2 ? '二段' : '一段';
  return { ...base, division, nextFloor: next?.floor ?? null };
}

export function competitiveRankLabel(rating: number): string {
  const rank = competitiveRank(rating);
  return `${rank.label}${rank.division ? ` ${rank.division}` : ''}`;
}

export function competitiveRankProgress(rating: number): number {
  const rank = competitiveRank(rating);
  if (rank.nextFloor === null) return 1;
  const safe = Math.max(rank.floor, Math.floor(rating));
  return Math.max(0, Math.min(1, (safe - rank.floor) / Math.max(1, rank.nextFloor - rank.floor)));
}

export interface LeaderboardDefinition {
  id: 'ascension' | 'solo_weekly' | 'pvp_season';
  label: string;
  subtitle: string;
  cadence: 'theme' | 'weekly' | '14d';
  authority: 'local-first' | 'platform' | 'server';
}

export const LEADERBOARDS: readonly LeaderboardDefinition[] = [
  {
    id: 'ascension',
    label: '登顶竞速',
    subtitle: '每个世界独立 · 最快抵达最终棋子',
    cadence: 'theme',
    authority: 'local-first',
  },
  {
    id: 'solo_weekly',
    label: '本周最高分',
    subtitle: '每周最高分 · 棋子名称作为荣耀展示',
    cadence: 'weekly',
    authority: 'platform',
  },
  {
    id: 'pvp_season',
    label: '竞技赛季',
    subtitle: '14天赛季 · 服务器积分排名',
    cadence: '14d',
    authority: 'server',
  },
] as const;

export interface ThemeAccess {
  theme: ThemeId;
  free: boolean;
  permanentPrice: number;
  rewardedUnlockViews: number;
}

// One free onboarding world; the remaining worlds support either permanent
// star-coin purchase or one completed rewarded video for an immediate permanent unlock.
export const THEME_ACCESS: Record<ThemeId, ThemeAccess> = {
  kingdom: { theme: 'kingdom', free: true, permanentPrice: 0, rewardedUnlockViews: 0 },
  palace: { theme: 'palace', free: false, permanentPrice: 100, rewardedUnlockViews: 1 },
  zodiac: { theme: 'zodiac', free: false, permanentPrice: 180, rewardedUnlockViews: 1 },
  candy: { theme: 'candy', free: false, permanentPrice: 280, rewardedUnlockViews: 1 },
  dreamhouse: { theme: 'dreamhouse', free: false, permanentPrice: 400, rewardedUnlockViews: 1 },
};
