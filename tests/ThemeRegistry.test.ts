import { describe, expect, it } from 'vitest';
import { THEME_IDS, adjacentTheme, isThemeId, themeIndex } from '../src/config/themes';

describe('theme registry navigation', () => {
  it('recognizes only registered themes', () => {
    expect(isThemeId('kingdom')).toBe(true);
    expect(isThemeId('palace')).toBe(true);
    expect(isThemeId('unknown')).toBe(false);
    expect(isThemeId(null)).toBe(false);
  });

  it('wraps adjacent world navigation without binary theme assumptions', () => {
    for (const theme of THEME_IDS) {
      expect(themeIndex(theme)).toBeGreaterThanOrEqual(0);
      expect(THEME_IDS).toContain(adjacentTheme(theme, 1));
      expect(THEME_IDS).toContain(adjacentTheme(theme, -1));
    }
    expect(adjacentTheme(THEME_IDS[THEME_IDS.length - 1], 1)).toBe(THEME_IDS[0]);
    expect(adjacentTheme(THEME_IDS[0], -1)).toBe(THEME_IDS[THEME_IDS.length - 1]);
  });
});
