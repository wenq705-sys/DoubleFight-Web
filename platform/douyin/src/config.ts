declare const __DOUYIN_RELEASE__: boolean;
export const DOUYIN_RELEASE = typeof __DOUYIN_RELEASE__ !== 'undefined' && __DOUYIN_RELEASE__;

export const DOUYIN_PRODUCT_CONFIG = {
  appId: 'tta405d2b83b08e6f207',
  socketUrl: 'wss://game.whvwayfare.online/ws',
  apiUrl: 'https://game.whvwayfare.online',
  ads: {
    banner: 'c4mdhkf94nebkcc1dk',
    rewarded: 'kah48dcjfih55jh1ga',
    interstitial: '4dkwv7i3rr7q6dq71n',
  },
  share: {
    templateId: '',
  },
  ranking: {
    soloZone: 'solo',
    pvpZone: 'pvp',
    ascensionZones: {
      kingdom: 'ascension-kingdom',
      palace: 'ascension-palace',
    },
  },
  retention: {
    // Configure up to three approved Douyin subscription template IDs before
    // enabling the reminder card in the daily center.
    subscriptionTemplates: [] as string[],
  },
} as const;
