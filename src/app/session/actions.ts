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

export const Skirmora = {
  pickRace: (raceId: RaceId): GameAction => ({ type: 'skirmora.pickRace', payload: { raceId } }),
  setTeam: (playerId: string, team: 0 | 1): GameAction => ({ type: 'skirmora.setTeam', payload: { playerId, team } }),
  submitArmy: (army: Army): GameAction => ({ type: 'skirmora.submitArmy', payload: army }),
  unready: (): GameAction => ({ type: 'skirmora.unready', payload: {} }),
  submitDeploy: (placements: Placement[]): GameAction => ({ type: 'skirmora.submitDeploy', payload: { placements } }),
  act: (act: ActPayload): GameAction => ({ type: 'skirmora.act', payload: act }),
  heroAbility: (target: HeroTarget): GameAction => ({ type: 'skirmora.heroAbility', payload: target }),
  claimTimeout: (): GameAction => ({ type: 'skirmora.claimTimeout', payload: {} }),
  surrender: (): GameAction => ({ type: 'skirmora.surrender', payload: {} }),
  rematch: (): GameAction => ({ type: 'skirmora.rematch', payload: {} }),
} as const;

export const GAME_PREFIX = 'skirmora.';
