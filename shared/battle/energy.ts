import type { MergeEvent } from '../game/types';

export const MAX_BATTLE_ENERGY = 100;

export const FUTURE_SKILL_ENERGY_COSTS = {
  random_clear: 35,
  shield: 45,
  petrify: 50,
} as const;

export interface EnergyGainBreakdown {
  mergeEnergy: number;
  comboBonus: number;
  total: number;
}

const ENERGY_BY_VALUE: Record<number, number> = {
  4: 2,
  8: 3,
  16: 4,
  32: 6,
  64: 8,
  128: 11,
  256: 15,
  512: 20,
  1024: 26,
  2048: 34,
};

/**
 * Energy rewards scale super-linearly with meaningful merges so stronger 2048 play
 * creates more combat opportunities. This is server-authoritative competitive tuning.
 */
export function energyForMergeValue(value: number): number {
  const normalized = Math.max(4, value);
  const known = ENERGY_BY_VALUE[normalized];
  if (known !== undefined) return known;

  if (normalized < 4) return 0;
  const extraTiers = Math.max(0, Math.round(Math.log2(normalized)) - 11);
  return Math.min(60, 34 + extraTiers * 8);
}

/**
 * Multiple merges in one swipe receive a small combo reward.
 * This rewards board planning without depending on client clocks/network latency.
 */
export function comboBonusForMergeCount(mergeCount: number): number {
  if (mergeCount <= 1) return 0;
  if (mergeCount === 2) return 2;
  if (mergeCount === 3) return 5;
  return Math.min(18, 9 + (mergeCount - 4) * 3);
}

export function energyForMerges(merges: readonly MergeEvent[]): EnergyGainBreakdown {
  const mergeEnergy = merges.reduce((sum, merge) => sum + energyForMergeValue(merge.value), 0);
  const comboBonus = comboBonusForMergeCount(merges.length);
  return {
    mergeEnergy,
    comboBonus,
    total: mergeEnergy + comboBonus,
  };
}

export function clampBattleEnergy(value: number): number {
  return Math.max(0, Math.min(MAX_BATTLE_ENERGY, Math.floor(value)));
}
