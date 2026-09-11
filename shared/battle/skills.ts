import { FUTURE_SKILL_ENERGY_COSTS } from './energy';

export type SkillId = 'random_clear' | 'shield' | 'petrify';
export type SkillTarget = 'self' | 'opponent';

export interface SkillDefinition {
  id: SkillId;
  label: string;
  shortLabel: string;
  icon: string;
  cost: number;
  cooldownMs: number;
  target: SkillTarget;
  petrifyDurationMs?: number;
}

export const PETRIFY_DURATION_MS = 6_000;

export const SKILL_DEFINITIONS: Record<SkillId, SkillDefinition> = {
  random_clear: {
    id: 'random_clear',
    label: '随机清块',
    shortLabel: '清块',
    icon: '✦',
    cost: FUTURE_SKILL_ENERGY_COSTS.random_clear,
    cooldownMs: 6_000,
    target: 'self',
  },
  shield: {
    id: 'shield',
    label: '护盾',
    shortLabel: '护盾',
    icon: '◆',
    cost: FUTURE_SKILL_ENERGY_COSTS.shield,
    cooldownMs: 10_000,
    target: 'self',
  },
  petrify: {
    id: 'petrify',
    label: '石化',
    shortLabel: '石化',
    icon: '❄',
    cost: FUTURE_SKILL_ENERGY_COSTS.petrify,
    cooldownMs: 8_000,
    target: 'opponent',
    petrifyDurationMs: PETRIFY_DURATION_MS,
  },
};

export type SkillCooldowns = Record<SkillId, number>;

export function emptySkillCooldowns(): SkillCooldowns {
  return {
    random_clear: 0,
    shield: 0,
    petrify: 0,
  };
}

export function isSkillId(value: unknown): value is SkillId {
  return value === 'random_clear' || value === 'shield' || value === 'petrify';
}
