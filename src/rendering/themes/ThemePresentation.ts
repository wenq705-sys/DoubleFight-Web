import type * as THREE from 'three';
import { ART } from '../../config/artDirection';
import type { ThemeId } from '../../config/themes';
import { KingdomEnvironment } from '../environment/KingdomEnvironment';
import { PalaceEnvironment } from '../environment/PalaceEnvironment';
import { CollectibleThemeEnvironment } from '../environment/CollectibleThemeEnvironment';
import { TileFactory, type TileVisual } from '../tiles/TileFactory';
import { PalaceTileFactory } from '../tiles/PalaceTileFactory';
import { CandyTileFactory, DreamhouseTileFactory, ZodiacTileFactory } from '../tiles/LaunchThemeFactories';
import {
  CANDY_SIZING,
  DREAMHOUSE_SIZING,
  KINGDOM_SIZING,
  PALACE_SIZING,
  ZODIAC_SIZING,
  type TileVisualSizingProfile,
} from '../tiles/TileSizingPolicy';

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

export interface ThemeEnvironment {
  root: THREE.Group;
  update(time: number, delta: number): void;
  impact(value: number, position: THREE.Vector3): void;
  setGesture(dx: number, dy: number, magnitude: number): void;
  clearGesture(): void;
  pulseDirection(direction: import('../../../shared/game/types').Direction): void;
}

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

const genericReaction = (environment: ThemeEnvironment, positions: THREE.Vector3[]) =>
  positions.forEach(position => environment.impact(512, position));

/** Theme dependencies live here; controllers/Board2048 stay completely theme-independent. */
export const THEME_PRESENTATIONS: Record<ThemeId, ThemePresentation> = {
  kingdom: {
    sizing: KINGDOM_SIZING,
    factory: new TileFactory(),
    environment: detail => new KingdomEnvironment(detail),
    skillReaction: genericReaction,
    surfaceY: 0.57,
    sky: ART.colors.sky,
    fog: ART.colors.skyFog,
    exposure: 1.03,
    effects: {
      primary: value => value >= 1024 ? 0xffd34f : value >= 512 ? ART.colors.gold : value >= 128 ? ART.colors.crystalBlue : value >= 32 ? ART.colors.coralLight : 0xffe5a0,
      secondary: ART.colors.royalBlueLight,
      spawn: 0xffffff,
      skill: 0x8de7ff,
      skillSecondary: 0xffb064,
      skillLight: 5.4,
      confetti: [ART.colors.gold, ART.colors.royalBlueLight, ART.colors.coralLight, ART.colors.flowerPink, ART.colors.teal],
    },
    feedback: { move: 8, merge: [11, 6, 14], skill: [22, 18, 38, 20, 62] },
  },
  palace: {
    sizing: PALACE_SIZING,
    factory: new PalaceTileFactory(),
    environment: detail => new PalaceEnvironment(detail),
    skillReaction: environment => (environment as PalaceEnvironment).skillPulse(),
    surfaceY: 0.695,
    sky: 0xd89069,
    fog: 0xe6bb93,
    exposure: 1.0,
    effects: {
      primary: value => value >= 256 ? 0xffcf55 : value >= 64 ? 0xf2a63d : 0xff8c72,
      secondary: 0xef7d9b,
      spawn: 0xffd26a,
      skill: 0xffc94d,
      skillSecondary: 0xef6f91,
      skillLight: 6.3,
      confetti: [0xffcf55, 0xef6f91, 0xe85c4b, 0x6bb7a0, 0xffffff],
    },
    feedback: { move: 8, merge: [11, 6, 14], skill: [22, 18, 38, 20, 62] },
  },
  zodiac: {
    sizing: ZODIAC_SIZING,
    factory: new ZodiacTileFactory(),
    environment: detail => new CollectibleThemeEnvironment(detail, {
      ground: 0x8c4935,
      groundAlt: 0xc8744f,
      rim: 0xe0ad47,
      accent: 0xd6523d,
      glow: 0xffcf61,
      skyProp: 0x69aa8e,
      motif: 'zodiac',
    }),
    skillReaction: genericReaction,
    surfaceY: 0.60,
    sky: 0xc65f47,
    fog: 0xe3aa7e,
    exposure: 1.03,
    effects: {
      primary: value => value >= 1024 ? 0xffd04f : value >= 256 ? 0xdf9f3e : 0xd85d45,
      secondary: 0x72b89b,
      spawn: 0xffe7a0,
      skill: 0xffc44f,
      skillSecondary: 0xc64c3c,
      skillLight: 6.5,
      confetti: [0xffc84d, 0xd95642, 0x71b69a, 0xffe4a3, 0xffffff],
    },
    feedback: { move: 8, merge: [11, 7, 15], skill: [24, 18, 40, 22, 66] },
  },
  candy: {
    sizing: CANDY_SIZING,
    factory: new CandyTileFactory(),
    environment: detail => new CollectibleThemeEnvironment(detail, {
      ground: 0xe7a0c8,
      groundAlt: 0xffd7e9,
      rim: 0x9a75d2,
      accent: 0xff7ead,
      glow: 0xffa7d8,
      skyProp: 0x65d5c7,
      motif: 'candy',
    }),
    skillReaction: genericReaction,
    surfaceY: 0.60,
    sky: 0xe9a8d8,
    fog: 0xf5d3e7,
    exposure: 1.06,
    effects: {
      primary: value => value >= 1024 ? 0xffd45a : value >= 256 ? 0xa778db : 0xff79ad,
      secondary: 0x63d8ce,
      spawn: 0xffffff,
      skill: 0xff9ed2,
      skillSecondary: 0x77ded2,
      skillLight: 5.8,
      confetti: [0xff80b5, 0x72ddd1, 0xffd26b, 0xb69cff, 0xffffff],
    },
    feedback: { move: 7, merge: [10, 6, 14], skill: [20, 16, 34, 18, 58] },
  },
  dreamhouse: {
    sizing: DREAMHOUSE_SIZING,
    factory: new DreamhouseTileFactory(),
    environment: detail => new CollectibleThemeEnvironment(detail, {
      ground: 0x76a66d,
      groundAlt: 0xa7cc8d,
      rim: 0xe0b05b,
      accent: 0x5a9471,
      glow: 0xffc56b,
      skyProp: 0x77bdd5,
      motif: 'dreamhouse',
    }),
    skillReaction: genericReaction,
    surfaceY: 0.60,
    sky: 0x83b98c,
    fog: 0xd8e7c8,
    exposure: 1.02,
    effects: {
      primary: value => value >= 1024 ? 0xf4c455 : value >= 256 ? 0x77b8d0 : 0x76aa74,
      secondary: 0xe5a65a,
      spawn: 0xfff3ce,
      skill: 0xffc86d,
      skillSecondary: 0x6fb7c9,
      skillLight: 5.8,
      confetti: [0x87c793, 0xf2c26b, 0x7dbbd8, 0xf3a57f, 0xffffff],
    },
    feedback: { move: 8, merge: [11, 6, 14], skill: [22, 18, 38, 20, 62] },
  },
};
