/** Stable asset contract. New 3D themes are installed by theme.json + GLBs, not code edits. */
export const REQUIRED_ART_TILES = [2,4,8,16,32,64,128,256,512,1024,2048] as const;
export type ArtThemePreset = 'generic' | 'nightmarket';

export interface ArtThemeDefinition {
  schemaVersion: 1;
  id: string;
  label: string;
  title: string;
  kicker: string;
  subtitle: string;
  highestLabel: string;
  icon: string;
  online: false;
  ranks: Readonly<Record<string, string>>;
  assets: {
    hero: string;
    board: string;
    environmentMobile: string;
    environmentFull?: string;
    tiles: Readonly<Record<string, string>>;
    /** Optional additive, separate GLB layers activated at the indicated mood stage (1–4). */
    overlays?: readonly { stage: number; file: string }[];
  };
  placement: {
    rows: 4;
    columns: 4;
    gridGap: number;
    artFloorY: number;
    gameSurfaceY: number;
    centerZ: number;
  };
  /** Optional mobile composition preset. Keeps authored worlds out of scene code. */
  camera?: {
    home?: { targetY: number; targetZOffset: number; distanceScale: number; eyeY: number; eyeZ: number };
    solo?: { targetY: number; targetZOffset: number; distanceScale: number; eyeY: number; eyeZ: number };
  };
  render: {
    sky: string;
    fog: string;
    exposure: number;
    accent: string;
    secondary: string;
    spawn: string;
    skill: string;
    /** Optional reusable presentation language for merges/skills. */
    vfx?: 'default' | 'ink';
    confetti: readonly string[];
  };
  mood: {
    preset: ArtThemePreset;
    thresholds: readonly [number, number, number, number, number];
    labels: readonly [string, string, string, string, string];
    /** Case-insensitive substrings of imported GLB material names. */
    glowMaterialKeys?: Readonly<Record<string, readonly string[]>>;
  };
}
