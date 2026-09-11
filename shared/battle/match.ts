export const MATCH_DURATION_MS = 180_000;

export type TimeLimitTieBreaker = 'score' | 'highest' | 'usable_space' | 'draw';

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
