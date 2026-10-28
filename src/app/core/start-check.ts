import { MAPS } from '../engine/engine/data/maps';
import { DATA_VERSION } from '../engine/engine/version';
import { startProblem } from '../engine/game/skirmora.state';
import type { GameMode, MapId } from '../models';

/**
 * The engine's own player-count check (what `lobby.start` runs), worded for the screen:
 * river and pass FFA are for 2, 2 vs 2 needs exactly 4 on a map that has it. Null = can start.
 */
export function startProblemText(settings: { mapId: MapId; mode: GameMode; budget: number; turnSeconds: number }, players: number): string | null {
  const problem = startProblem(
    { mapId: settings.mapId, mode: settings.mode, budget: settings.budget as 1000, turnSeconds: settings.turnSeconds, dataVersion: DATA_VERSION },
    players,
  );
  if (!problem) return null;
  const map = MAPS.find((candidate) => candidate.id === settings.mapId)!;
  if (settings.mode === 'teams') return map.teams ? '2 на 2 — рівно 4 гравці.' : 'На цій карті немає режиму 2 на 2.';
  const [min, max] = map.ffaPlayers;
  return `Ця карта для ${min === max ? min : `${min}–${max}`} гравців.`;
}
