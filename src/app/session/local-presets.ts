import { validateArmy } from '../engine/engine/army';
import { RACES, UNITS } from '../engine/engine/data/races';
import { cellIndex, getMap } from '../engine/engine/grid';
import type { Army, Cell, MapId, Placement, PocketLegionsView, RaceId } from '../models';

/** Tiers of the ready-made army: one shooter at least in every race, no champion. */
const PRESET_TIERS = [1, 2, 3, 5, 7];

/**
 * A legal army of five stacks for the budget: used by the "quick battle" and by tests.
 * The shop (Phase 2) is the real way to build one.
 */
export function presetArmy(raceId: RaceId, budget: number, mapSize = 12, playerCount = 2): Army {
  const units = RACES[raceId].units.filter((id) => PRESET_TIERS.includes(UNITS[id].tier));
  const share = (budget * 0.95) / units.length;
  const army: Army = {
    stacks: units.map((unitId) => ({ unitId, count: Math.max(1, Math.floor(share / UNITS[unitId].cost)) })),
    items: {},
    rings: [],
  };
  const maxStacks = mapSize <= 10 && playerCount >= 3 ? 5 : 6;
  army.stacks = army.stacks.slice(0, maxStacks);
  const check = validateArmy(army, raceId, { budget, mapSize, playerCount });
  if (!check.ok) throw new Error(`presetArmy ${raceId}: ${check.reason}`);
  return army;
}

/**
 * Places every stack on a free zone cell, the column nearest the map centre first, then rows
 * spread from the middle — so the front line faces the enemy.
 */
export function autoDeploy(mapId: MapId, zone: readonly Cell[], stackCount: number): Placement[] {
  const map = getMap(mapId);
  const centre = (map.size - 1) / 2;
  const free = zone
    .filter((cell) => !map.blocked[cellIndex(map, cell)])
    .sort(
      (a, b) =>
        Math.abs(a.x - centre) - Math.abs(b.x - centre) ||
        Math.abs(a.y - centre) - Math.abs(b.y - centre) ||
        a.y - b.y ||
        a.x - b.x,
    );
  return free.slice(0, stackCount).map((cell, stackIndex) => ({ stackIndex, x: cell.x, y: cell.y }));
}

/** Auto-deploy straight from a deploy-phase view. */
export function autoDeployFor(view: PocketLegionsView): Placement[] {
  const mine = view.mine;
  if (!mine?.zone || !mine.army) return [];
  return autoDeploy(view.mapId, mine.zone, mine.army.stacks.length);
}
