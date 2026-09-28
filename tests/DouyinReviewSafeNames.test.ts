import { describe, expect, it } from 'vitest';
import { reviewSafeDisplayName } from '../platform/douyin/src/auth';

describe('Douyin review-safe player names', () => {
  it('keeps simple Chinese and numeric names', () => {
    expect(reviewSafeDisplayName('玩家1234', 'seed')).toBe('玩家1234');
    expect(reviewSafeDisplayName('文强', 'seed')).toBe('文强');
    expect(reviewSafeDisplayName('小王·2', 'seed')).toBe('小王·2');
  });

  it('replaces Latin, emoji and other scripts with deterministic Chinese numeric names', () => {
    for (const value of ['玩家41F4', 'Alice', '小A', 'Player123', '🙂', 'テスト', '테스트']) {
      const safe = reviewSafeDisplayName(value, 'account-123');
      expect(safe).toMatch(/^玩家\d{4}$/);
      expect(safe).not.toMatch(/[A-Za-z]/);
    }
  });

  it('is deterministic for the same account seed', () => {
    expect(reviewSafeDisplayName('Alice', 'account-123'))
      .toBe(reviewSafeDisplayName('Other Latin', 'account-123'));
  });
});
