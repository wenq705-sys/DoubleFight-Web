export const THEME_IDS = ['kingdom', 'palace'] as const;
export type ThemeId = typeof THEME_IDS[number];

export interface ThemeMeta {
  id: ThemeId;
  label: string;
  subtitle: string;
  highestLabel: string;
}

export const THEMES: Record<ThemeId, ThemeMeta> = {
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
};

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

export interface PieceMeta {
  theme: ThemeId;
  value: PieceValue;
  tier: number;
  name: string;
  isFinal: boolean;
}

const rankTable = (theme: ThemeId): Record<number, string> => theme === 'palace' ? PALACE_RANKS : KINGDOM_RANKS;

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


export function isThemeId(value: unknown): value is ThemeId {
  return typeof value === 'string' && (THEME_IDS as readonly string[]).includes(value);
}

export function themeIndex(theme: ThemeId): number {
  return Math.max(0, THEME_IDS.indexOf(theme));
}

/** Returns an adjacent registered world. Positive step moves forward, negative backward. */
export function adjacentTheme(theme: ThemeId, step: number): ThemeId {
  const count = THEME_IDS.length;
  if (count <= 1) return THEME_IDS[0] ?? theme;
  const index = themeIndex(theme);
  const offset = ((Math.trunc(step) % count) + count) % count;
  return THEME_IDS[(index + offset) % count] ?? theme;
}
