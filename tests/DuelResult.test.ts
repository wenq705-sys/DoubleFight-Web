import { describe, expect, it } from 'vitest';
import type { MatchSnapshot } from '../shared/index';
import { resultRuleText } from '../src/ui/DuelScreen';

function finished(reason: MatchSnapshot['endReason'], winnerId: string | null, tieBreaker: NonNullable<MatchSnapshot['result']>['tieBreaker'] = null): MatchSnapshot {
  return {
    matchId: 'result', roomCode: '123456', phase: 'finished', serverTime: 180000,
    roundStartedAt: 0, roundEndsAt: 180000, durationMs: 180000, winnerId, endReason: reason,
    players: [], result: { winnerId, reason: reason!, tieBreaker, finishedAt: 180000, players: [] },
  };
}

describe('Duel result copy follows authoritative reason and player perspective', () => {
  it.each([
    ['board_locked', 'local', '胜利原因 · 对手棋盘锁死'],
    ['board_locked', 'remote', '失败原因 · 棋盘锁死'],
    ['petrified_lock', 'local', '胜利原因 · 石化封锁'],
    ['petrified_lock', 'remote', '失败原因 · 石化封锁'],
    ['opponent_left', 'local', '胜利原因 · 对手退出'],
    ['opponent_left', 'remote', '失败原因 · 已退出对局'],
  ] as const)('%s / %s', (reason, winner, expected) => {
    expect(resultRuleText(finished(reason, winner), 'local')).toBe(expected);
  });

  it.each([
    ['score', 'local', '时间结束 · 分数领先'],
    ['score', 'remote', '时间结束 · 对手分数领先'],
    ['highest', 'local', '分数相同 · 最高棋子领先'],
    ['highest', 'remote', '分数相同 · 对手最高棋子领先'],
    ['usable_space', 'local', '最高棋子相同 · 可用空间领先'],
    ['usable_space', 'remote', '最高棋子相同 · 对手可用空间领先'],
    ['draw', null, '判定完全相同 · 平局'],
  ] as const)('time limit / %s / %s', (tieBreaker, winner, expected) => {
    expect(resultRuleText(finished('time_limit', winner, tieBreaker), 'local')).toBe(expected);
  });
});
