/**
 * Double Fight ad-only soft-currency economy.
 *
 * S Coin never changes PvP power. These constants define product intent and
 * are shared so the authoritative server milestone does not duplicate magic numbers.
 */
export const S_COIN = {
  dailyLogin: 15,
  dailyRewardedBonus: 30,
  sidebarReturn: 10,
  dailyTask: 5,
  firstPieceDiscovery: 5,
  sevenDayActivity: 30,
  themePermanentUnlock: 500,
} as const;

export const PVP_SEASON_DURATION_MS = 14 * 24 * 60 * 60 * 1000;
export const SOLO_WEEK_DURATION_MS = 7 * 24 * 60 * 60 * 1000;

export type SRewardReason =
  | 'daily_login'
  | 'daily_rewarded_bonus'
  | 'sidebar_return'
  | 'daily_task'
  | 'first_piece_discovery'
  | 'first_ascension'
  | 'activity_streak'
  | 'pvp_season';

export const MONETIZATION_MODEL = 'ads_only' as const;
