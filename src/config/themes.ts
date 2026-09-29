import { ART_THEMES, ART_THEME_BY_ID } from './artThemes.generated';
import type { ArtThemeId } from './artThemes.generated';
export type ThemeId = 'kingdom' | 'palace' | ArtThemeId;

export interface ThemeMeta {
  id: ThemeId;
  label: string;
  subtitle: string;
  highestLabel: string;
}

export const THEMES = {
  kingdom: {
    id: 'kingdom',
    label: '微缩王国',
    subtitle: 'MINIATURE KINGDOM · 2048',
    highestLabel: '王国地标',
  },
  palace: {
    id: 'palace',
    label: '后宫晋升',
    subtitle: '后宫晋升 · 2048',
    highestLabel: '宫廷位分',
  },
  ...Object.fromEntries(ART_THEMES.map(art=>[art.id,{
    id:art.id,label:art.label,subtitle:art.subtitle,highestLabel:art.highestLabel,
  }])),
} as Record<ThemeId,ThemeMeta>;

export const PIECE_VALUES = [2, 4, 8, 16, 32, 64, 128, 256, 512, 1024, 2048] as const;
export type PieceValue = typeof PIECE_VALUES[number];
export const MAX_PIECE_VALUE: PieceValue = 2048;

// Keep these tables number-indexable because existing render factories receive
// numeric BoardTile values. Product helpers below normalize into known tiers.
export const PALACE_RANKS: Record<number, string> = {
  2: '宫女',
  4: '答应',
  8: '常在',
  16: '贵人',
  32: '嫔',
  64: '妃',
  128: '贵妃',
  256: '皇贵妃',
  512: '皇后',
  1024: '凤仪之主',
  2048: '母仪天下',
};

export const KINGDOM_RANKS: Record<number, string> = {
  2: '边境营地',
  4: '强化营地',
  8: '瞭望塔',
  16: '石堡',
  32: '王家箭塔',
  64: '黄金塔',
  128: '晶能塔',
  256: '秘法堡垒',
  512: '王城',
  1024: '王家圣殿',
  2048: '王国奇观',
};

export const NIGHTMARKET_RANKS: Record<number,string> =
  ART_THEME_BY_ID.nightmarket?.ranks ?? {};

export interface PieceMeta {
  theme: ThemeId;
  value: PieceValue;
  tier: number;
  name: string;
  isFinal: boolean;
}

const rankTable = (theme: ThemeId): Record<number, string> =>
  theme === 'palace' ? PALACE_RANKS : theme === 'kingdom' ? KINGDOM_RANKS :
  (ART_THEME_BY_ID[theme]?.ranks ?? KINGDOM_RANKS);

export function normalizePieceValue(value: number): PieceValue {
  if (!Number.isFinite(value) || value <= 2) return 2;
  let nearest: PieceValue = 2;
  for (const candidate of PIECE_VALUES) {
    if (candidate > value) break;
    nearest = candidate;
  }
  return nearest;
}

export function pieceTier(value: number): number {
  return PIECE_VALUES.indexOf(normalizePieceValue(value)) + 1;
}

export function pieceName(theme: ThemeId, value: number): string {
  const normalized = normalizePieceValue(value);
  return rankTable(theme)[normalized] ?? String(normalized);
}

export function maxPieceName(theme: ThemeId): string {
  return pieceName(theme, MAX_PIECE_VALUE);
}

export function pieceMeta(theme: ThemeId, value: number): PieceMeta {
  const normalized = normalizePieceValue(value);
  return {
    theme,
    value: normalized,
    tier: pieceTier(normalized),
    name: pieceName(theme, normalized),
    isFinal: normalized === MAX_PIECE_VALUE,
  };
}

export function pieceCatalogue(theme: ThemeId): PieceMeta[] {
  return PIECE_VALUES.map(value => pieceMeta(theme, value));
}
