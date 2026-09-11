export type ThemeId = 'kingdom' | 'palace';

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
