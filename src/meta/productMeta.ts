import type { ThemeId } from '../config/themes';

export const S_COIN = {
  dailyLogin: 15,
  dailyRewardedBonus: 30,
  sidebarReturn: 10,
  dailyTask: 5,
  dailyTaskCount: 3,
  firstDiscovery: 5,
  sevenDayChest: 30,
  themeUnlock: 500,
} as const;

export const PVP_SEASON_DAYS = 14;

export interface CompetitiveRank {
  id: 'bronze' | 'silver' | 'gold' | 'platinum' | 'diamond' | 'king';
  label: string;
  division: 'III' | 'II' | 'I' | null;
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
  const division: 'III' | 'II' | 'I' = within < third ? 'III' : within < third * 2 ? 'II' : 'I';
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
    label: 'Solo 周榜',
    subtitle: '每周最高分 · 棋子名称作为荣耀展示',
    cadence: 'weekly',
    authority: 'platform',
  },
  {
    id: 'pvp_season',
    label: '竞技赛季',
    subtitle: '14天赛季 · 服务器 Rating 排名',
    cadence: '14d',
    authority: 'server',
  },
] as const;

export interface ThemeAccess {
  theme: ThemeId;
  free: boolean;
  permanentPrice: number;
  trial: 'none' | 'rewarded_once_per_day';
}

// All first-release themes remain free. Future paid themes use this same
// contract instead of introducing a second currency or direct-purchase fork.
export const THEME_ACCESS: Record<ThemeId, ThemeAccess> = {
  kingdom: { theme: 'kingdom', free: true, permanentPrice: 0, trial: 'none' },
  palace: { theme: 'palace', free: true, permanentPrice: 0, trial: 'none' },
  zodiac: { theme: 'zodiac', free: true, permanentPrice: 0, trial: 'none' },
  candy: { theme: 'candy', free: true, permanentPrice: 0, trial: 'none' },
  dreamhouse: { theme: 'dreamhouse', free: true, permanentPrice: 0, trial: 'none' },
};
