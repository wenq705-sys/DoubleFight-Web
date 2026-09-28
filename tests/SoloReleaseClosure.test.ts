import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { Board2048 } from '../src/game/board/Board2048';
import { currentWeekKey } from '../platform/douyin/src/metaProgress';

const deterministicRandom = () => 0;

describe('Solo 1.0 release closure', () => {
  it('lets clear-skill rescue a fully locked board without spawning a replacement', () => {
    const board = new Board2048(deterministicRandom);
    board.load([
      [2, 4, 8, 16],
      [4, 8, 16, 32],
      [8, 16, 32, 64],
      [16, 32, 64, 128],
    ]);
    expect(board.canMove()).toBe(false);

    const before = board.tiles().length;
    const result = board.clearLowest(2, true);

    expect(result.removed.map(tile => tile.value)).toEqual([2, 4]);
    expect(board.tiles()).toHaveLength(before - 2);
    expect(board.tiles().some(tile => tile.value === 128)).toBe(true);
    expect(result.gameOver).toBe(false);
    expect(board.canMove()).toBe(true);
  });

  it('keeps the Solo terminal order explicit: 2048 success wins over a simultaneous lock', () => {
    const source = readFileSync(new URL('../platform/douyin/src/soloScene.ts', import.meta.url), 'utf8');
    const successBranch = source.indexOf('if (cleared) {');
    const successFinish = source.indexOf("this.finishSolo('cleared');", successBranch);
    const stuck = source.indexOf('if (result.gameOver) this.resolveStuckBoard()', successFinish);
    expect(successBranch).toBeGreaterThan(-1);
    expect(successFinish).toBeGreaterThan(successBranch);
    expect(stuck).toBeGreaterThan(successFinish);
  });

  it('offers remaining paid/rewarded clear rescue before declaring a stuck loss', () => {
    const source = readFileSync(new URL('../platform/douyin/src/soloScene.ts', import.meta.url), 'utf8');
    expect(source).toContain('const canRewardRescue = this.rewardedSkillClaims < 1');
    expect(source).toContain('if (this.skillCharges > 0 || canRewardRescue)');
    expect(source).toContain('const shouldAutoRescue = !this.controller.board.canMove()');
    expect(source).toContain('const rescued = await this.useRandomClear()');
    expect(source).toContain('最多清除 2 枚最低阶');
  });

  it('does not upload native Solo rank on every score tick', () => {
    const scene = readFileSync(new URL('../platform/douyin/src/soloScene.ts', import.meta.url), 'utf8');
    const retention = readFileSync(new URL('../platform/douyin/src/m212RetentionHub.ts', import.meta.url), 'utf8');
    expect(scene).not.toContain('void this.social.setSoloRank(this.score)');
    expect(retention).toContain('if (forceSync && weekly.progress.best > 0)');
    expect(retention).toContain('await social.setSoloRank(weekly.best)');
    expect(retention).toContain('await social.setAscensionRank(game.theme, mastery.bestAscensionMs)');
  });

  it('rolls the weekly Solo cache at Monday 00:00 China Standard Time', () => {
    const sunday2359Cst = Date.parse('2026-09-20T15:59:59Z');
    const monday0000Cst = Date.parse('2026-09-20T16:00:00Z');
    expect(currentWeekKey(sunday2359Cst)).toBe('2026-09-14');
    expect(currentWeekKey(monday0000Cst)).toBe('2026-09-21');
  });
});
