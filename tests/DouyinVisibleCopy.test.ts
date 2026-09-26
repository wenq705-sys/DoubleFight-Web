import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = (file: string) => readFileSync(resolve(file), 'utf8');

describe('Douyin review-facing copy', () => {
  it('removes the exact review-risk labels found during the v1.0.5 audit', () => {
    const copy = [
      'platform/douyin/src/soloScene.ts',
      'platform/douyin/src/m212ProductPass.ts',
      'platform/douyin/src/m212RetentionHub.ts',
      'platform/douyin/src/social.ts',
      'src/config/themes.ts',
      'src/meta/productMeta.ts',
      'shared/battle/match.ts',
    ].map(source).join('\n');
    for (const term of ['S币', 'Solo 周榜', ' RP', ' VS ', '1v1', 'MINIATURE KINGDOM', 'ZODIAC ASCENSION', 'CANDY PLANET', 'DREAM HOME']) {
      expect(copy, `review-facing copy still contains: ${term}`).not.toContain(term);
    }
  });

  it('uses a letter-free currency icon and numeric-only generated guest names', () => {
    const ui = source('platform/douyin/src/uiSystem.ts');
    const accounts = source('server/auth/AccountRepository.ts');
    expect(ui).not.toContain("ctx.fillText('S'");
    expect(accounts).toContain('const guestDisplayName=');
    expect(accounts).toContain("padStart(4,'0')");
    expect(accounts).not.toContain("slice(0,4).toUpperCase()");
  });
});
