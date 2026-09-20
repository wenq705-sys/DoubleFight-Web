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
  launch: {
    // M2.17 ships as a Solo-first release. Keep the server/PvP implementation
    // intact behind one policy switch so it can return in a later product pass
    // without leaking unfinished competitive surfaces into the first release.
    onlineEnabled: false,
    sharedRoomInvitesEnabled: false,
    pvpRankingsEnabled: false,
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
      zodiac: 'ascension-zodiac',
      candy: 'ascension-candy',
      dreamhouse: 'ascension-dreamhouse',
    },
  },
  retention: {
    // Configure up to three approved Douyin subscription template IDs before
    // enabling the reminder card in the daily center.
    subscriptionTemplates: [] as string[],
  },
} as const;
