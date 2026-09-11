export const TIER_VALUES = [2, 4, 8, 16, 32, 64, 128, 256, 512, 1024, 2048] as const;

export function tierIndex(value: number): number {
  const exact = TIER_VALUES.indexOf(value as (typeof TIER_VALUES)[number]);
  if (exact >= 0) return exact;
  const log = Math.round(Math.log2(Math.max(2, value))) - 1;
  return Math.max(0, Math.min(TIER_VALUES.length - 1, log));
}

/**
 * Universal visual-growth rule for every theme.
 * Higher 2048 tiers must be physically larger; theme factories choose only
 * their safe min/max envelope.
 */
export function tierScale(value: number, min: number, max: number): number {
  const t = tierIndex(value) / (TIER_VALUES.length - 1);
  return min + (max - min) * t;
}
