import { describe, expect, it, vi } from 'vitest';
import { LabRound, MAX_BALLS, PvpPrototypeLab, ROUND_MS, mergeRack, preferredSupply, type Ball } from '../platform/douyin/src/pvpPrototypeLab';

describe('isolated local PvP lab rules', () => {
  it('merges equal pairs recursively without changing the input', () => {
    const input = [2, 2, 4, 8, 16, 32];
    expect(mergeRack(input)).toEqual([64]);
    expect(input).toEqual([2, 2, 4, 8, 16, 32]);
  });

  it('shares five replenished offers and AI prefers a matching number', () => {
    const round = new LabRound('steal', 0, () => 0);
    round.supply = [8, 4, 2, 8, 8];
    round.racks.ai = [4];
    expect(preferredSupply(round.supply, round.racks.ai)).toBe(1);
    round.update(1100);
    expect(round.racks.ai).toEqual([8]);
    expect(round.supply).toEqual([8, 2, 2, 8, 8]);
    expect(round.take('you', 1)).toBe(true);
    expect(round.racks.you).toEqual([2]);
    expect(round.supply).toHaveLength(5);
  });

  it('accepts a merging offer at capacity and ends immediately at 64', () => {
    const round = new LabRound('steal', 0, () => 0);
    round.racks.you = [2, 4, 8, 16, 32];
    round.supply[0] = 2;
    expect(round.take('you', 0)).toBe(true);
    expect(round.racks.you).toEqual([64]);
    expect(round.result?.winner).toBe('you');
    expect(round.take('ai', 0)).toBe(false);
  });

  it('rejects overflowing grabs without consuming the shared offer', () => {
    const round = new LabRound('steal', 0);
    round.racks.you = [2, 4, 8, 16, 32];
    round.supply[0] = 64;
    expect(round.take('you', 0)).toBe(false);
    expect(round.supply[0]).toBe(64);
    expect(round.racks.you).toHaveLength(5);
  });

  it.each(['steal', 'arena', 'locks'] as const)('%s lasts exactly 45 seconds and freezes at timeout', mode => {
    const round = new LabRound(mode, 100);
    expect(round.endsAt).toBe(100 + ROUND_MS);
    round.update(round.endsAt);
    expect(round.result?.winner).toBe('draw');
    const frozen = JSON.stringify(round);
    round.update(round.endsAt + 5000);
    round.take('you', 0);
    round.mergeCards('you', 0, 1);
    round.claim('you', 4, 0);
    round.refreshCard('you');
    round.shoot('you', 160, 100, round.endsAt + 5000);
    expect(JSON.stringify(round)).toBe(frozen);
  });

  it('compares highest number at timeout', () => {
    const round = new LabRound('steal', 0);
    round.racks.you = [16]; round.racks.ai = [8, 4, 2];
    round.update(ROUND_MS);
    expect(round.result?.winner).toBe('you');
  });

  it('requires exact unclaimed locks, refills hands, and wins at two locks', () => {
    const round = new LabRound('locks', 0, () => 0);
    expect(round.claim('you', 0, 0)).toBe(false);
    expect(round.mergeCards('you', 0, 0)).toBe(false);
    expect(round.mergeCards('you', 0, 1)).toBe(true);
    expect(round.hands.you).toEqual([4, 2, 4, 4, 2, 4]);
    expect(round.mergeCards('you', 0, 2)).toBe(true);
    expect(round.hands.you[0]).toBe(8);
    expect(round.claim('you', 0, 0)).toBe(true);
    expect(round.claim('ai', 0, 0)).toBe(false);
    round.hands.you[0] = 16;
    expect(round.claim('you', 0, 1)).toBe(true);
    expect(round.hands.you).toHaveLength(6);
    expect(round.result?.winner).toBe('you');
  });

  it('AI claims an exact key before merging, then merges before refreshing', () => {
    const round = new LabRound('locks', 0, () => 0);
    round.hands.ai = [8, 2, 4, 4, 2, 4];
    round.update(1100);
    expect(round.locks[0].owner).toBe('ai');
    round.hands.ai = [2, 2, 4, 8, 32, 64];
    round.locks[2].owner = 'you'; round.locks[3].owner = 'you';
    round.update(2400);
    expect(round.hands.ai).toEqual([4, 2, 4, 8, 32, 64]);
    round.hands.ai = [2, 4, 8, 16, 32, 64];
    round.locks[1].owner = 'you';
    round.update(3700);
    expect(round.hands.ai).toHaveLength(6);
  });

  const ball = (id: number, value: number, owner: 'you' | 'ai', x = 150): Ball => ({ id, value, owner, x, y: 180, vx: 0, vy: 0 });
  it.each([false, true])('merges into newer incoming ownership regardless of array order (%s)', reverse => {
    const round = new LabRound('arena', 0);
    round.balls = [ball(1, 32, 'you'), ball(2, 32, 'ai', 170)];
    if (reverse) round.balls.reverse();
    round.physics(.01);
    expect(round.balls).toHaveLength(1);
    expect(round.balls[0]).toMatchObject({ id: 2, value: 64, owner: 'ai' });
    expect(round.result?.winner).toBe('ai');
  });

  it('bounces unequal balls, damps motion, and reflects at walls', () => {
    const round = new LabRound('arena', 0);
    round.balls = [ball(1, 2, 'you', 130), ball(2, 4, 'ai', 170)];
    round.balls[0].vx = 100; round.balls[1].vx = -100;
    round.physics(.01);
    expect(round.balls).toHaveLength(2);
    expect(round.balls[0].vx).toBeLessThan(0);
    expect(round.balls[1].vx).toBeGreaterThan(0);
    round.balls = [{ ...ball(3, 2, 'you', 23), vx: -100 }];
    round.physics(.05);
    expect(round.balls[0].vx).toBeGreaterThan(0);
    expect(round.balls[0].vx).toBeLessThan(100);
    expect(round.balls[0].x).toBeGreaterThanOrEqual(22);
  });

  it('caps balls, throttles shots, and permits firing from an occupied launcher', () => {
    const round = new LabRound('arena', 0, () => 0);
    round.balls = [];
    for (let i = 0; i < 40; i++) expect(round.shoot('you', 160, 100, i * 500)).toBe(true);
    expect(round.balls).toHaveLength(MAX_BALLS);
    expect(round.shoot('you', 160, 100, 19_501)).toBe(false);
    expect(round.balls.every(b => b.vy < 0)).toBe(true);
  });

  it('AI shoots from the top toward an equal target', () => {
    const round = new LabRound('arena', 0);
    round.next.ai = 8;
    round.balls = [ball(1, 8, 'you', 80), ball(2, 4, 'you', 260)];
    round.update(1100);
    const shot = round.balls.at(-1)!;
    expect(shot.owner).toBe('ai');
    expect(shot.value).toBe(8);
    expect(shot.vx).toBeLessThan(0);
    expect(shot.vy).toBeGreaterThan(0);
  });

  it('restarts into fresh rounds and returns to the menu', () => {
    const lab = new PvpPrototypeLab(vi.fn(), vi.fn(), () => 1000);
    lab.start('steal');
    const old = lab.round;
    lab.start('steal');
    expect(lab.round).not.toBe(old);
    expect(lab.round?.endsAt).toBe(46000);
    lab.open();
    expect(lab.round).toBeNull();
  });
});
