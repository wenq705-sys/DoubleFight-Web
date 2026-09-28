export const MATCH_DURATION_MS = 180_000;
export const MATCH_FORMAT_LABEL = '标准对决 · 3分钟 · 实时一对一';

export type TimeLimitTieBreaker = 'score' | 'highest' | 'usable_space' | 'draw';
export type MatchTimerPhase = 'normal' | 'last_minute' | 'decisive' | 'final_countdown' | 'finished';

export interface MatchStanding {
  playerId: string;
  score: number;
  highest: number;
  usableEmptyCells: number;
}

export interface TimeLimitResolution {
  winnerId: string | null;
  tieBreaker: TimeLimitTieBreaker;
}

export function matchTimerPhase(remainingMs: number): MatchTimerPhase {
  const remaining = Math.max(0, remainingMs);
  if (remaining <= 0) return 'finished';
  if (remaining <= 10_000) return 'final_countdown';
  if (remaining <= 30_000) return 'decisive';
  if (remaining <= 60_000) return 'last_minute';
  return 'normal';
}

export function formatMatchClock(remainingMs: number): string {
  const seconds = Math.max(0, Math.ceil(remainingMs / 1000));
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}

export function resolveTimeLimitStandings(
  first: MatchStanding,
  second: MatchStanding,
): TimeLimitResolution {
  if (first.score !== second.score) {
    return {
      winnerId: first.score > second.score ? first.playerId : second.playerId,
      tieBreaker: 'score',
    };
  }

  if (first.highest !== second.highest) {
    return {
      winnerId: first.highest > second.highest ? first.playerId : second.playerId,
      tieBreaker: 'highest',
    };
  }

  if (first.usableEmptyCells !== second.usableEmptyCells) {
    return {
      winnerId:
        first.usableEmptyCells > second.usableEmptyCells
          ? first.playerId
          : second.playerId,
      tieBreaker: 'usable_space',
    };
  }

  return { winnerId: null, tieBreaker: 'draw' };
}
