import { MAX_PIECE_VALUE, pieceTier, type ThemeId } from '../../../src/config/themes';
import type { StorageAdapter } from '../../../src/platform/types';

export interface ThemeMasteryProgress {
  highestDiscoveredTier: number;
  firstAscensionMs: number | null;
  bestAscensionMs: number | null;
  ascensionCount: number;
}

const keyFor = (theme: ThemeId) => `doublefight-meta-${theme}`;

const empty = (): ThemeMasteryProgress => ({
  highestDiscoveredTier: 1,
  firstAscensionMs: null,
  bestAscensionMs: null,
  ascensionCount: 0,
});

export function loadThemeMastery(storage: StorageAdapter, theme: ThemeId): ThemeMasteryProgress {
  try {
    const raw = storage.getItem(keyFor(theme));
    if (!raw) return empty();
    const value = JSON.parse(raw) as Partial<ThemeMasteryProgress>;
    const highestDiscoveredTier = Number.isInteger(value.highestDiscoveredTier)
      ? Math.min(11, Math.max(1, Number(value.highestDiscoveredTier))) : 1;
    const firstAscensionMs = validDuration(value.firstAscensionMs) ? Number(value.firstAscensionMs) : null;
    const bestAscensionMs = validDuration(value.bestAscensionMs) ? Number(value.bestAscensionMs) : null;
    const ascensionCount = Number.isInteger(value.ascensionCount)
      ? Math.max(0, Number(value.ascensionCount)) : 0;
    return { highestDiscoveredTier, firstAscensionMs, bestAscensionMs, ascensionCount };
  } catch {
    return empty();
  }
}

export function recordDiscovery(
  storage: StorageAdapter,
  theme: ThemeId,
  value: number,
): { progress: ThemeMasteryProgress; discovered: boolean } {
  const progress = loadThemeMastery(storage, theme);
  const nextTier = pieceTier(value);
  const discovered = nextTier > progress.highestDiscoveredTier;
  if (!discovered) return { progress, discovered: false };
  const next = { ...progress, highestDiscoveredTier: nextTier };
  save(storage, theme, next);
  return { progress: next, discovered: true };
}

export function recordAscension(
  storage: StorageAdapter,
  theme: ThemeId,
  elapsedMs: number,
): { progress: ThemeMasteryProgress; first: boolean; personalBest: boolean } {
  const progress = loadThemeMastery(storage, theme);
  const duration = Math.max(1, Math.floor(elapsedMs));
  const first = progress.firstAscensionMs === null;
  const personalBest = progress.bestAscensionMs === null || duration < progress.bestAscensionMs;
  const next: ThemeMasteryProgress = {
    highestDiscoveredTier: pieceTier(MAX_PIECE_VALUE),
    firstAscensionMs: progress.firstAscensionMs ?? duration,
    bestAscensionMs: personalBest ? duration : progress.bestAscensionMs,
    ascensionCount: progress.ascensionCount + 1,
  };
  save(storage, theme, next);
  return { progress: next, first, personalBest };
}

export function formatDuration(milliseconds: number | null): string {
  if (milliseconds === null || !Number.isFinite(milliseconds) || milliseconds <= 0) return '--:--';
  const centiseconds = Math.floor(milliseconds / 10);
  const minutes = Math.floor(centiseconds / 6000);
  const seconds = Math.floor((centiseconds % 6000) / 100);
  const fraction = centiseconds % 100;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(fraction).padStart(2, '0')}`;
}

function save(storage: StorageAdapter, theme: ThemeId, progress: ThemeMasteryProgress): void {
  storage.setItem(keyFor(theme), JSON.stringify(progress));
}

function validDuration(value: unknown): boolean {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 && value < 86_400_000;
}
