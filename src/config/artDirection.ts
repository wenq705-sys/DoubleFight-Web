export const ART = {
  board: { gap: 2.34, centerZ: 0.45, tileSize: 1.92 },
  colors: {
    sky: 0x8bd3f4, skyFog: 0xd9f3ff, grass: 0x8bc45a, grassLight: 0xb3dc7f, grassDark: 0x6ca545,
    stone: 0xf1ead2, stoneShade: 0xcfc5a7, stoneDark: 0xb1a58a, wood: 0xa96837, woodDark: 0x70411f,
    royalBlue: 0x4b8bd9, royalBlueLight: 0x8fc5ff, coral: 0xed765b, coralLight: 0xffa47f,
    gold: 0xf5c552, goldDeep: 0xc88627, purple: 0x8d68cf, crystalBlue: 0x72ddff,
    water: 0x61c8e6, cream: 0xfff1c8, ink: 0x5b3a22,
  },
  motion: { moveMs: 138, spawnMs: 260, mergeMs: 280 },
} as const;

export const TILE_STAGE: Record<number, string> = {
  2: '木制营地', 4: '加固营地', 8: '蓝顶哨塔', 16: '石砌城楼', 32: '皇家箭塔', 64: '黄金守望塔',
  128: '水晶法师塔', 256: '紫晶堡垒', 512: '王国城堡', 1024: '皇家圣殿', 2048: '王冠奇观',
};
