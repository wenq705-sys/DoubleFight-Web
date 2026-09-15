import { KINGDOM_RANKS, PALACE_RANKS, type ThemeId } from '../config/themes';

export const PIECE_VALUES = [2, 4, 8, 16, 32, 64, 128, 256, 512, 1024, 2048] as const;
export const FINAL_PIECE_VALUE = 2048;

const RANKS: Record<ThemeId, Record<number, string>> = {
  kingdom: KINGDOM_RANKS,
  palace: PALACE_RANKS,
};

export function pieceName(theme: ThemeId, value: number): string {
  return RANKS[theme][value] ?? `未知棋子`;
}

export function pieceTier(value: number): number {
  if (!Number.isFinite(value) || value < 2) return 0;
  const exponent = Math.log2(value);
  return Number.isInteger(exponent) ? exponent : 0;
}

export function isFinalPiece(value: number): boolean {
  return value >= FINAL_PIECE_VALUE;
}

export function ratingRank(rating: number): { label: string; short: string } {
  const safe = Number.isFinite(rating) ? Math.max(0, Math.floor(rating)) : 1000;
  if (safe >= 1800) return { label: '王者', short: '王者' };
  if (safe >= 1600) return { label: '钻石 I', short: '钻石 I' };
  if (safe >= 1500) return { label: '钻石 II', short: '钻石 II' };
  if (safe >= 1400) return { label: '钻石 III', short: '钻石 III' };
  if (safe >= 1325) return { label: '铂金 I', short: '铂金 I' };
  if (safe >= 1250) return { label: '铂金 II', short: '铂金 II' };
  if (safe >= 1175) return { label: '铂金 III', short: '铂金 III' };
  if (safe >= 1125) return { label: '黄金 I', short: '黄金 I' };
  if (safe >= 1075) return { label: '黄金 II', short: '黄金 II' };
  if (safe >= 1025) return { label: '黄金 III', short: '黄金 III' };
  if (safe >= 950) return { label: '白银 I', short: '白银 I' };
  if (safe >= 875) return { label: '白银 II', short: '白银 II' };
  if (safe >= 800) return { label: '白银 III', short: '白银 III' };
  return { label: '青铜', short: '青铜' };
}

export function formatDuration(ms: number | null | undefined): string {
  if (!Number.isFinite(ms) || !ms || ms <= 0) return '--:--';
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}
