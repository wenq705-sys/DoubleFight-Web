export const THEME_IDS = ['kingdom', 'palace', 'zodiac', 'candy', 'dreamhouse'] as const;
export type ThemeId = typeof THEME_IDS[number];

export interface ThemeUiPalette {
  background: string;
  accent: string;
  secondary: string;
  stageTint: number;
  finalTint: number;
  glow: number;
  ambient: readonly number[];
}

export interface ThemeMeta {
  id: ThemeId;
  label: string;
  subtitle: string;
  highestLabel: string;
  ui: ThemeUiPalette;
}

export const THEMES: Record<ThemeId, ThemeMeta> = {
  kingdom: {
    id: 'kingdom',
    label: '微缩王国',
    subtitle: 'MINIATURE KINGDOM · 2048',
    highestLabel: '王国地标',
    ui: {
      background: '#72BEDA', accent: '#236B83', secondary: '#E1B45D',
      stageTint: 0x8fb6c8, finalTint: 0x657f9c, glow: 0x78d7ff,
      ambient: [0x7adff2, 0xf3c969, 0x91d46d, 0xffdda0],
    },
  },
  palace: {
    id: 'palace',
    label: '后宫晋升',
    subtitle: '后宫晋升 · 2048',
    highestLabel: '宫廷位分',
    ui: {
      background: '#D88F6E', accent: '#A94D55', secondary: '#F0B384',
      stageTint: 0xe8a29d, finalTint: 0xc96977, glow: 0xffc16c,
      ambient: [0xf2a3ae, 0xffd089, 0x86cfc2, 0xf6b6cb],
    },
  },
  zodiac: {
    id: 'zodiac',
    label: '生肖战神',
    subtitle: 'ZODIAC ASCENSION · 2048',
    highestLabel: '东方神龙',
    ui: {
      background: '#C95F47', accent: '#8D3028', secondary: '#E5B94E',
      stageTint: 0xd17753, finalTint: 0xe4b948, glow: 0xffc95a,
      ambient: [0xf5c451, 0xd95b43, 0x71b69a, 0xffe1a0],
    },
  },
  candy: {
    id: 'candy',
    label: '甜蜜星球',
    subtitle: 'CANDY PLANET · 2048',
    highestLabel: '糖果奇迹',
    ui: {
      background: '#E9A8D8', accent: '#A54D91', secondary: '#60C7C0',
      stageTint: 0xf0b7dc, finalTint: 0xa36ac4, glow: 0xff9fd3,
      ambient: [0xff9ecf, 0x76ddd1, 0xffd26b, 0xb69cff],
    },
  },
  dreamhouse: {
    id: 'dreamhouse',
    label: '梦想家园',
    subtitle: 'DREAM HOME · 2048',
    highestLabel: '梦想城堡',
    ui: {
      background: '#83B98C', accent: '#3C7459', secondary: '#E5A85C',
      stageTint: 0x9ac18f, finalTint: 0xd19b58, glow: 0xffc66e,
      ambient: [0x8bd1a0, 0xf2c26b, 0x7dbbd8, 0xf3a57f],
    },
  },
};

export const PIECE_VALUES = [2, 4, 8, 16, 32, 64, 128, 256, 512, 1024, 2048] as const;
export type PieceValue = typeof PIECE_VALUES[number];
export const MAX_PIECE_VALUE: PieceValue = 2048;

export const KINGDOM_RANKS: Record<number, string> = {
  2: '边境营地', 4: '强化营地', 8: '瞭望塔', 16: '石堡', 32: '王家箭塔',
  64: '黄金塔', 128: '晶能塔', 256: '秘法堡垒', 512: '王城', 1024: '王家圣殿', 2048: '王国奇观',
};

export const PALACE_RANKS: Record<number, string> = {
  2: '宫女', 4: '答应', 8: '常在', 16: '贵人', 32: '嫔',
  64: '妃', 128: '贵妃', 256: '皇贵妃', 512: '皇后', 1024: '凤仪之主', 2048: '母仪天下',
};

/**
 * Zodiac progression follows visible combat power rather than calendar order.
 * Rabbit remains the world mascot/guide so the main 2048 chain keeps the global 11/11 contract.
 */
export const ZODIAC_RANKS: Record<number, string> = {
  2: '灵鼠', 4: '斗鸡', 8: '岩羊', 16: '灵猴', 32: '战犬',
  64: '山猪', 128: '玄蛇', 256: '烈马', 512: '神牛', 1024: '白虎', 2048: '东方神龙',
};

export const CANDY_RANKS: Record<number, string> = {
  2: '方糖', 4: '水果糖', 8: '软糖熊', 16: '棒棒糖', 32: '甜甜圈',
  64: '马卡龙', 128: '冰淇淋', 256: '纸杯蛋糕', 512: '庆典蛋糕', 1024: '甜品城堡', 2048: '糖果奇迹',
};

export const DREAMHOUSE_RANKS: Record<number, string> = {
  2: '纸箱小窝', 4: '露营帐篷', 8: '温馨单间', 16: '阳光公寓', 32: '精装套房',
  64: '联排小屋', 128: '独栋之家', 256: '花园别墅', 512: '湖畔豪宅', 1024: '空中庄园', 2048: '梦想城堡',
};

const THEME_RANKS: Record<ThemeId, Record<number, string>> = {
  kingdom: KINGDOM_RANKS,
  palace: PALACE_RANKS,
  zodiac: ZODIAC_RANKS,
  candy: CANDY_RANKS,
  dreamhouse: DREAMHOUSE_RANKS,
};

export interface PieceMeta {
  theme: ThemeId;
  value: PieceValue;
  tier: number;
  name: string;
  isFinal: boolean;
}

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
  return THEME_RANKS[theme][normalized] ?? String(normalized);
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

export function adjacentTheme(theme: ThemeId, step: number): ThemeId {
  const count = THEME_IDS.length;
  if (count <= 1) return THEME_IDS[0] ?? theme;
  const index = themeIndex(theme);
  const offset = ((Math.trunc(step) % count) + count) % count;
  return THEME_IDS[(index + offset) % count] ?? theme;
}
