export { Board2048 } from './game/Board2048';
export { SeededRandom, randomUint32 } from './game/SeededRandom';
export { predictMoveTiles } from './game/predictMove';
export type { PredictedMotion, PredictedMove } from './game/predictMove';
export type { RandomSource } from './game/SeededRandom';
export type {
  BoardPublicState,
  BoardTile,
  CellPosition,
  ClearResult,
  Direction,
  MergeEvent,
  MoveResult,
  TileMotion,
} from './game/types';
export {
  PROTOCOL_VERSION,
  isDirection,
  isNetworkThemeId,
  parseClientMessage,
} from './protocol/messages';
export type {
  ClientMessage,
  MatchEndReason,
  MatchPlayerState,
  MatchResult,
  MatchResultPlayer,
  MatchSnapshot,
  NetworkThemeId,
  RoomPhase,
  RoomPlayerState,
  RoomState,
  ServerMessage,
  SkillEvent,
  SkillOutcome,
} from './protocol/messages';

export {
  MAX_BATTLE_ENERGY,
  FUTURE_SKILL_ENERGY_COSTS,
  clampBattleEnergy,
  comboBonusForMergeCount,
  energyForMergeValue,
  energyForMerges,
} from './battle/energy';
export type { EnergyGainBreakdown } from './battle/energy';

export {
  PETRIFY_DURATION_MS,
  SKILL_DEFINITIONS,
  emptySkillCooldowns,
  isSkillId,
} from './battle/skills';
export type {
  SkillCooldowns,
  SkillDefinition,
  SkillId,
  SkillTarget,
} from './battle/skills';

export {
  MATCH_DURATION_MS,
  resolveTimeLimitStandings,
} from './battle/match';
export type {
  MatchStanding,
  TimeLimitResolution,
  TimeLimitTieBreaker,
} from './battle/match';
