import { describe, expect, it } from 'vitest';
import { MATCH_DURATION_MS, MATCH_FORMAT_LABEL, formatMatchClock, matchTimerPhase } from '../shared/index';

describe('three-minute PvP presentation contract', () => {
  it('keeps one standard three-minute queue', () => {
    expect(MATCH_DURATION_MS).toBe(180_000);
    expect(MATCH_FORMAT_LABEL).toContain('3分钟');
    expect(formatMatchClock(MATCH_DURATION_MS)).toBe('03:00');
  });

  it('escalates timer urgency without changing authoritative match duration', () => {
    expect(matchTimerPhase(61_000)).toBe('normal');
    expect(matchTimerPhase(60_000)).toBe('last_minute');
    expect(matchTimerPhase(30_000)).toBe('decisive');
    expect(matchTimerPhase(10_000)).toBe('final_countdown');
    expect(matchTimerPhase(0)).toBe('finished');
    expect(formatMatchClock(9_001)).toBe('00:10');
    expect(formatMatchClock(-1)).toBe('00:00');
  });
});
