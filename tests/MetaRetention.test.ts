import { describe, expect, it } from 'vitest';
import { MAX_PIECE_VALUE, maxPieceName, pieceCatalogue, pieceName, pieceTier } from '../src/config/themes';
import { formatDuration, loadThemeMastery, recordAscension, recordDiscovery } from '../platform/douyin/src/metaProgress';
import type { StorageAdapter } from '../src/platform/types';

function storageFixture(): StorageAdapter {
  const values = new Map<string, string>();
  return {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => { values.set(key, value); },
    removeItem: key => { values.delete(key); },
  };
}

describe('named piece catalogue', () => {
  it('keeps numeric values internal while exposing theme-specific names and tiers', () => {
    expect(pieceTier(2)).toBe(1);
    expect(pieceTier(64)).toBe(6);
    expect(pieceTier(MAX_PIECE_VALUE)).toBe(11);
    expect(pieceName('palace', 64)).toBe('妃');
    expect(pieceName('kingdom', 64)).toBe('黄金塔');
    expect(maxPieceName('palace')).toBe('母仪天下');
    expect(pieceCatalogue('kingdom')).toHaveLength(11);
    expect(pieceCatalogue('kingdom').at(-1)?.isFinal).toBe(true);
  });
});

describe('local-first theme mastery', () => {
  it('records discoveries monotonically', () => {
    const storage = storageFixture();
    expect(recordDiscovery(storage, 'palace', 8).discovered).toBe(true);
    expect(recordDiscovery(storage, 'palace', 4).discovered).toBe(false);
    expect(recordDiscovery(storage, 'palace', 128).progress.highestDiscoveredTier).toBe(7);
    expect(loadThemeMastery(storage, 'palace').highestDiscoveredTier).toBe(7);
  });

  it('keeps first ascension and improves personal best without ending progression', () => {
    const storage = storageFixture();
    const first = recordAscension(storage, 'kingdom', 620_430);
    expect(first.first).toBe(true);
    expect(first.personalBest).toBe(true);
    expect(first.progress.ascensionCount).toBe(1);
    expect(first.progress.firstAscensionMs).toBe(620_430);

    const slower = recordAscension(storage, 'kingdom', 700_000);
    expect(slower.personalBest).toBe(false);
    expect(slower.progress.bestAscensionMs).toBe(620_430);

    const faster = recordAscension(storage, 'kingdom', 515_120);
    expect(faster.personalBest).toBe(true);
    expect(faster.progress.bestAscensionMs).toBe(515_120);
    expect(faster.progress.ascensionCount).toBe(3);
    expect(formatDuration(faster.progress.bestAscensionMs)).toBe('08:35.12');
  });
});
