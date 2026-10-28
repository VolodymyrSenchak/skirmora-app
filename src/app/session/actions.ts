import type { ActPayload, Army, CreateSettings, GameAction, HeroTarget, Placement, RaceId } from '../models';

/** Wire types are namespaced strings. Wrapped once so no component ever types one. */
export const Lobby = {
  start: (): GameAction => ({ type: 'lobby.start', payload: {} }),
  kick: (playerId: string): GameAction => ({ type: 'lobby.kick', payload: { playerId } }),
  transferHost: (playerId: string): GameAction => ({ type: 'lobby.transferHost', payload: { playerId } }),
  leave: (): GameAction => ({ type: 'lobby.leave', payload: {} }),
  end: (): GameAction => ({ type: 'lobby.end', payload: {} }),
  updateSettings: (changes: Partial<CreateSettings>): GameAction => ({ type: 'lobby.updateSettings', payload: changes }),
} as const;

export const PocketLegions = {
  pickRace: (raceId: RaceId): GameAction => ({ type: 'pocket-legions.pickRace', payload: { raceId } }),
  setTeam: (playerId: string, team: 0 | 1): GameAction => ({ type: 'pocket-legions.setTeam', payload: { playerId, team } }),
  submitArmy: (army: Army): GameAction => ({ type: 'pocket-legions.submitArmy', payload: army }),
  unready: (): GameAction => ({ type: 'pocket-legions.unready', payload: {} }),
  submitDeploy: (placements: Placement[]): GameAction => ({ type: 'pocket-legions.submitDeploy', payload: { placements } }),
  act: (act: ActPayload): GameAction => ({ type: 'pocket-legions.act', payload: act }),
  heroAbility: (target: HeroTarget): GameAction => ({ type: 'pocket-legions.heroAbility', payload: target }),
  claimTimeout: (): GameAction => ({ type: 'pocket-legions.claimTimeout', payload: {} }),
  surrender: (): GameAction => ({ type: 'pocket-legions.surrender', payload: {} }),
  rematch: (): GameAction => ({ type: 'pocket-legions.rematch', payload: {} }),
} as const;

export const GAME_PREFIX = 'pocket-legions.';
