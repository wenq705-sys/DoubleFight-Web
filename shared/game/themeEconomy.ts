export const RELEASE_THEME_IDS = ['kingdom', 'palace', 'zodiac', 'candy', 'dreamhouse'] as const;
export type ReleaseThemeId = typeof RELEASE_THEME_IDS[number];

export interface ThemeUnlockEconomy {
  free: boolean;
  coinCost: number;
  adViewsRequired: number;
}

/**
 * v1.0 progression target:
 * - Kingdom is the free onboarding world.
 * - A highly engaged day-one player can earn ~110 S币 and unlock Palace.
 * - Coin-only progression lands around a 10-14 day full collection.
 * - Rewarded-ad unlock is a slower permanent alternative with a global 2/day cap.
 */
export const THEME_UNLOCK_ECONOMY: Readonly<Record<ReleaseThemeId, ThemeUnlockEconomy>> = {
  kingdom: { free: true, coinCost: 0, adViewsRequired: 0 },
  palace: { free: false, coinCost: 100, adViewsRequired: 2 },
  zodiac: { free: false, coinCost: 180, adViewsRequired: 3 },
  candy: { free: false, coinCost: 280, adViewsRequired: 4 },
  dreamhouse: { free: false, coinCost: 400, adViewsRequired: 5 },
};

export const THEME_UNLOCK_AD_DAILY_CAP = 2;

/** Server-authoritative S币 sources. Keep sinks above normal daily faucet size. */
export const S_COIN_ECONOMY = {
  dailyLogin: 15,
  sidebarReturn: 10,
  dailyRewardedAd: 30,
  dailyTask: 5,
  sevenDayChest: 30,
  discoveryPerTier: 5,
} as const;

export function themeUnlockEconomy(theme: string): ThemeUnlockEconomy | null {
  return (THEME_UNLOCK_ECONOMY as Record<string, ThemeUnlockEconomy>)[theme] ?? null;
}
