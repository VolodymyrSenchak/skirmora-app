/**
 * The game's view types, re-exported from the synced engine (plan §4). No hand-written copies:
 * when the API changes a field, `npm run sync:engine` changes it here too.
 */
export type {
  BattleView,
  MyArmyView,
  PocketLegionsView,
  SeatView,
  StackView,
} from '../engine/game/pocketLegions.projection';
export type { HeroHints, Hints, StackHints } from '../engine/game/pocketLegions.hints';
export type { GameEvent, GameEventType, Status, StatusId } from '../engine/engine/state';
export type {
  AbilityId,
  Army,
  Cell,
  GameMode,
  HeroAbilityId,
  ItemId,
  MapId,
  RaceId,
  SingleSlot,
  Slot,
  UnitId,
} from '../engine/engine/types';
export type { Placement } from '../engine/engine/army';
export type { GameResult, PocketLegionsSettings } from '../engine/game/pocketLegions.state';
export type { Preview, ShotPenalty } from '../engine/engine/damage';

/** The `act` and `heroAbility` payloads (contract §2). */
export type { ActAction as ActPayload, ActKind } from '../engine/engine/battle';
export type { HeroPayload as HeroTarget } from '../engine/engine/heroes';
