import type * as THREE from 'three';
import { ART } from '../../config/artDirection';
import type { ThemeId } from '../../config/themes';
import { KingdomEnvironment } from '../environment/KingdomEnvironment';
import { PalaceEnvironment } from '../environment/PalaceEnvironment';
import { NightMarketEnvironment } from '../environment/NightMarketEnvironment';
import { ArtPackEnvironment } from '../environment/ArtPackEnvironment';
import { ART_THEMES } from '../../config/artThemes.generated';
import type { ArtThemeId } from '../../config/artThemes.generated';
import { TileFactory, type TileVisual } from '../tiles/TileFactory';
import { PalaceTileFactory } from '../tiles/PalaceTileFactory';
import { NightMarketTileFactory } from '../tiles/NightMarketTileFactory';
import { ArtPackTileFactory } from '../tiles/ArtPackTileFactory';
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
export type ThemeEnvironment = Pick<KingdomEnvironment, 'root' | 'update' | 'impact' | 'setGesture' | 'clearGesture' | 'pulseDirection'> & {
  resetMood?: (tiles: readonly import('../../game/board/types').BoardTile[]) => void;
  onBoardMove?: (result: import('../../game/board/types').MoveResult) => void;
  readonly moodStage?: number;
  readonly moodName?: string;
  readonly reachedValue?: number;
};
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
const nightmarketFactory = new NightMarketTileFactory();
const NIGHTMARKET_SIZING: TileVisualSizingProfile = {
  horizontalLimit: () => 1.56,
  minimumHeight: () => 2.42,
};

const rgb=(color:string)=>Number.parseInt(color.slice(1),16);
function importedArtPresentation(art:(typeof ART_THEMES)[number]):ThemePresentation{
  return {
    sizing: {
      horizontalLimit:()=>1.56,
      minimumHeight:()=>2.42,
    },
    factory:new ArtPackTileFactory(art),
    environment:detail=>new ArtPackEnvironment(art,detail),
    skillReaction:(environment,positions)=>positions.forEach(position=>environment.impact(256,position)),
    surfaceY:art.placement.gameSurfaceY,
    sky:rgb(art.render.sky),fog:rgb(art.render.fog),exposure:art.render.exposure,
    effects:{
      primary:()=>rgb(art.render.accent),
      secondary:rgb(art.render.secondary),spawn:rgb(art.render.spawn),
      skill:rgb(art.render.skill),skillSecondary:rgb(art.render.secondary),
      skillLight:5.2,confetti:art.render.confetti.map(rgb),
    },
    feedback:{move:8,merge:[11,6,14],skill:[22,18,38,20,62]},
  };
}
const EXTRA_ART_PRESENTATIONS = Object.fromEntries(
  ART_THEMES.filter(art => art.id !== 'nightmarket')
    .map(art => [art.id, importedArtPresentation(art)]),
) as Record<Exclude<ArtThemeId, 'nightmarket'>, ThemePresentation>;

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
  ...EXTRA_ART_PRESENTATIONS,
  nightmarket: {
    sizing: NIGHTMARKET_SIZING,
    factory: nightmarketFactory,
    environment: detail => new NightMarketEnvironment(detail),
    skillReaction: (environment, positions) => positions.forEach(p => environment.impact(256, p)),
    surfaceY: 0.695, sky: 0x232732, fog: 0x272b37, exposure: 0.89,
    effects: {
      primary: value => value >= 1024 ? 0xffd38b : value >= 256 ? 0xffb66e : value >= 64 ? 0xffd4a2 : 0x9be3cc,
      secondary: 0xffb87d, spawn: 0xffe0ac, skill: 0xe5b77b,
      skillSecondary: 0x80dfd0, skillLight: 5.2,
      confetti: [0xffcf83, 0xe884a9, 0x83d6c6, 0xffe6be, 0xee986a],
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
