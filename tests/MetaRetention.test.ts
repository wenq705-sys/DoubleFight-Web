import { describe, expect, it } from 'vitest';
import { MAX_PIECE_VALUE, maxPieceName, pieceCatalogue, pieceName, pieceTier } from '../src/config/themes';
import { currentWeekKey, formatDuration, loadThemeMastery, loadWeeklySolo, recordAscension, recordDiscovery, recordWeeklySolo } from '../platform/douyin/src/metaProgress';
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

  it('migrates the pre-M2.12 highest-piece cache into the collection', () => {
    const storage = storageFixture();
    storage.setItem('doublefight-highest-kingdom', '512');
    expect(loadThemeMastery(storage, 'kingdom').highestDiscoveredTier).toBe(9);
    storage.setItem('doublefight-highest-kingdom', '128');
    expect(loadThemeMastery(storage, 'kingdom').highestDiscoveredTier).toBe(9);
  });

  it('tracks one best score per UTC week for platform weekly rank writes', () => {
    const storage = storageFixture();
    const monday = Date.UTC(2026, 8, 14, 12);
    expect(currentWeekKey(monday)).toBe('2026-09-14');
    expect(recordWeeklySolo(storage, 120, monday).improved).toBe(true);
    expect(recordWeeklySolo(storage, 90, monday + 86_400_000).progress.best).toBe(120);
    expect(recordWeeklySolo(storage, 180, monday + 2 * 86_400_000).progress.best).toBe(180);
    expect(loadWeeklySolo(storage, monday + 3 * 86_400_000).best).toBe(180);

    const nextMonday = monday + 7 * 86_400_000;
    const reset = recordWeeklySolo(storage, 75, nextMonday);
    expect(reset.improved).toBe(true);
    expect(reset.progress.best).toBe(75);
    expect(reset.progress.weekKey).toBe('2026-09-21');
    expect(loadWeeklySolo(storage, nextMonday).best).toBe(75);
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
