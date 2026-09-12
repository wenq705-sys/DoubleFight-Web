import { FUTURE_SKILL_ENERGY_COSTS } from './energy';

export type SkillId = 'random_clear' | 'shield' | 'petrify' | 'shuffle' | 'purify';
export type SkillTarget = 'self' | 'opponent';
export type SkillLoadout = [SkillId, SkillId, SkillId];

export interface SkillDefinition {
  id: SkillId;
  label: string;
  shortLabel: string;
  icon: string;
  description: string;
  cost: number;
  cooldownMs: number;
  target: SkillTarget;
  petrifyDurationMs?: number;
}

export const PETRIFY_DURATION_MS = 6_000;
export const DEFAULT_SKILL_LOADOUT: SkillLoadout = ['random_clear', 'shield', 'petrify'];

export const SKILL_DEFINITIONS: Record<SkillId, SkillDefinition> = {
  random_clear: {
    id: 'random_clear',
    label: '随机清块',
    shortLabel: '清块',
    icon: '✦',
    description: '随机清除自己棋盘两枚棋子，快速腾出空间。',
    cost: FUTURE_SKILL_ENERGY_COSTS.random_clear,
    cooldownMs: 6_000,
    target: 'self',
  },
  shield: {
    id: 'shield',
    label: '护盾',
    shortLabel: '护盾',
    icon: '◆',
    description: '抵消下一次敌方石化，直到触发前持续生效。',
    cost: FUTURE_SKILL_ENERGY_COSTS.shield,
    cooldownMs: 10_000,
    target: 'self',
  },
  petrify: {
    id: 'petrify',
    label: '石化',
    shortLabel: '石化',
    icon: '❄',
    description: '冻结对手一枚棋子 6 秒；冻结期间不能移动或合成。',
    cost: FUTURE_SKILL_ENERGY_COSTS.petrify,
    cooldownMs: 8_000,
    target: 'opponent',
    petrifyDurationMs: PETRIFY_DURATION_MS,
  },
  shuffle: {
    id: 'shuffle',
    label: '乾坤挪移',
    shortLabel: '洗牌',
    icon: '↻',
    description: '重新排列自己全部可移动棋子，保留数值与空格数量。',
    cost: FUTURE_SKILL_ENERGY_COSTS.shuffle,
    cooldownMs: 9_000,
    target: 'self',
  },
  purify: {
    id: 'purify',
    label: '净化',
    shortLabel: '净化',
    icon: '✧',
    description: '立即解除自己棋盘上的石化状态。',
    cost: FUTURE_SKILL_ENERGY_COSTS.purify,
    cooldownMs: 7_000,
    target: 'self',
  },
};

export type SkillCooldowns = Record<SkillId, number>;

export function emptySkillCooldowns(): SkillCooldowns {
  return {
    random_clear: 0,
    shield: 0,
    petrify: 0,
    shuffle: 0,
    purify: 0,
  };
}

export function isSkillId(value: unknown): value is SkillId {
  return value === 'random_clear'
    || value === 'shield'
    || value === 'petrify'
    || value === 'shuffle'
    || value === 'purify';
}

export function isSkillLoadout(value: unknown): value is SkillLoadout {
  if (!Array.isArray(value) || value.length !== 3) return false;
  if (!value.every(isSkillId)) return false;
  return new Set(value).size === value.length;
}

export function normalizeSkillLoadout(value: unknown): SkillLoadout {
  return isSkillLoadout(value) ? [...value] as SkillLoadout : [...DEFAULT_SKILL_LOADOUT];
}
