import type * as THREE from 'three';
import { ART } from '../../config/artDirection';
import type { ThemeId } from '../../config/themes';
import { KingdomEnvironment } from '../environment/KingdomEnvironment';
import { PalaceEnvironment } from '../environment/PalaceEnvironment';
import { TileFactory, type TileVisual } from '../tiles/TileFactory';
import { PalaceTileFactory } from '../tiles/PalaceTileFactory';
import { KINGDOM_SIZING, PALACE_SIZING, type TileVisualSizingProfile } from '../tiles/TileSizingPolicy';

export interface EffectPalette {
  primary(value: number): number;
  secondary: number;
  spawn: number;
  skill: number;
  skillSecondary: number;
  skillLight: number;
  confetti: readonly number[];
}
export type EnvironmentDetail = 'full' | 'duel' | 'board';
export type ThemeEnvironment = Pick<KingdomEnvironment, 'root' | 'update' | 'impact' | 'setGesture' | 'clearGesture' | 'pulseDirection'>;
export interface ThemePresentation {
  sizing: TileVisualSizingProfile;
  factory: { create(value: number): TileVisual; warmup(values: number[]): void };
  environment(detail: EnvironmentDetail): ThemeEnvironment;
  skillReaction(environment: ThemeEnvironment, positions: THREE.Vector3[]): void;
  surfaceY: number;
  sky: number;
  fog: number;
  exposure: number;
  effects: EffectPalette;
  feedback: { move: number; merge: number[]; skill: number[] };
}

/** Theme dependencies live here; online controllers and board motion have no theme branches. */
export const THEME_PRESENTATIONS: Record<ThemeId, ThemePresentation> = {
  kingdom: {
    sizing: KINGDOM_SIZING,
    factory: new TileFactory(), environment: detail => new KingdomEnvironment(detail),
    skillReaction: (environment, positions) => positions.forEach(position => environment.impact(512, position)),
    surfaceY: 0.57, sky: ART.colors.sky, fog: ART.colors.skyFog, exposure: 1.03,
    effects: {
      primary: value => value >= 1024 ? 0xffd34f : value >= 512 ? ART.colors.gold : value >= 128 ? ART.colors.crystalBlue : value >= 32 ? ART.colors.coralLight : 0xffe5a0,
      secondary: ART.colors.royalBlueLight, spawn: 0xffffff, skill: 0x8de7ff,
      skillSecondary: 0xffb064, skillLight: 5.4,
      confetti: [ART.colors.gold, ART.colors.royalBlueLight, ART.colors.coralLight, ART.colors.flowerPink, ART.colors.teal],
    },
    feedback: { move: 8, merge: [11, 6, 14], skill: [22, 18, 38, 20, 62] },
  },
  palace: {
    sizing: PALACE_SIZING,
    factory: new PalaceTileFactory(), environment: detail => new PalaceEnvironment(detail),
    skillReaction: environment => (environment as PalaceEnvironment).skillPulse(),
    surfaceY: 0.695, sky: 0xd89069, fog: 0xe6bb93, exposure: 1.0,
    effects: {
      primary: value => value >= 256 ? 0xffcf55 : value >= 64 ? 0xf2a63d : 0xff8c72,
      secondary: 0xef7d9b, spawn: 0xffd26a, skill: 0xffc94d,
      skillSecondary: 0xef6f91, skillLight: 6.3,
      confetti: [0xffcf55, 0xef6f91, 0xe85c4b, 0x6bb7a0, 0xffffff],
    },
    feedback: { move: 8, merge: [11, 6, 14], skill: [22, 18, 38, 20, 62] },
  },
};
