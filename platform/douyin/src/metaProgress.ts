import { MAX_PIECE_VALUE, pieceTier, type ThemeId } from '../../../src/config/themes';
import type { StorageAdapter } from '../../../src/platform/types';

export interface ThemeMasteryProgress {
  highestDiscoveredTier: number;
  firstAscensionMs: number | null;
  bestAscensionMs: number | null;
  ascensionCount: number;
}

export interface WeeklySoloProgress {
  weekKey: string;
  best: number;
}

const keyFor = (theme: ThemeId) => `doublefight-meta-${theme}`;
const legacyHighestKey = (theme: ThemeId) => `doublefight-highest-${theme}`;
const WEEKLY_SOLO_KEY = 'doublefight-weekly-solo';

const empty = (): ThemeMasteryProgress => ({
  highestDiscoveredTier: 1,
  firstAscensionMs: null,
  bestAscensionMs: null,
  ascensionCount: 0,
});

export function loadThemeMastery(storage: StorageAdapter, theme: ThemeId): ThemeMasteryProgress {
  let progress = empty();
  try {
    const raw = storage.getItem(keyFor(theme));
    if (raw) {
      const value = JSON.parse(raw) as Partial<ThemeMasteryProgress>;
      const highestDiscoveredTier = Number.isInteger(value.highestDiscoveredTier)
        ? Math.min(11, Math.max(1, Number(value.highestDiscoveredTier))) : 1;
      const firstAscensionMs = validDuration(value.firstAscensionMs) ? Number(value.firstAscensionMs) : null;
      const bestAscensionMs = validDuration(value.bestAscensionMs) ? Number(value.bestAscensionMs) : null;
      const ascensionCount = Number.isInteger(value.ascensionCount)
        ? Math.max(0, Number(value.ascensionCount)) : 0;
      progress = { highestDiscoveredTier, firstAscensionMs, bestAscensionMs, ascensionCount };
    }
  } catch {
    progress = empty();
  }

  // M2.12 shipped after Solo already persisted each world's highest numeric tile.
  // Fold that cache into the named catalogue once so existing players do not
  // appear to have lost discoveries when opening the new collection screen.
  const cachedHighest = Number(storage.getItem(legacyHighestKey(theme)) ?? 2);
  const migratedTier = pieceTier(cachedHighest);
  if (migratedTier > progress.highestDiscoveredTier) {
    progress = { ...progress, highestDiscoveredTier: migratedTier };
    save(storage, theme, progress);
  }
  return progress;
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

export function currentWeekKey(now: number = Date.now()): string {
  const date = new Date(now);
  const mondayOffset = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - mondayOffset);
  return date.toISOString().slice(0, 10);
}

export function loadWeeklySolo(
  storage: StorageAdapter,
  now: number = Date.now(),
): WeeklySoloProgress {
  const weekKey = currentWeekKey(now);
  try {
    const raw = storage.getItem(WEEKLY_SOLO_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<WeeklySoloProgress>;
      if (parsed.weekKey === weekKey && Number.isFinite(parsed.best) && Number(parsed.best) >= 0) {
        return { weekKey, best: Math.floor(Number(parsed.best)) };
      }
    }
  } catch { /* ignore malformed weekly cache */ }
  return { weekKey, best: 0 };
}

export function recordWeeklySolo(
  storage: StorageAdapter,
  score: number,
  now: number = Date.now(),
): { progress: WeeklySoloProgress; improved: boolean } {
  const current = loadWeeklySolo(storage, now);
  const weekKey = current.weekKey;
  const best = current.best;
  const raw = storage.getItem(WEEKLY_SOLO_KEY);
  let currentWeekCached = false;
  if (raw) {
    try {
      currentWeekCached = (JSON.parse(raw) as Partial<WeeklySoloProgress>).weekKey === weekKey;
    } catch { currentWeekCached = false; }
  }

  const safeScore = Math.max(0, Math.floor(Number.isFinite(score) ? score : 0));
  const improved = safeScore > best;
  const progress = { weekKey, best: Math.max(best, safeScore) };
  if (!currentWeekCached || improved) storage.setItem(WEEKLY_SOLO_KEY, JSON.stringify(progress));
  return { progress, improved };
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
