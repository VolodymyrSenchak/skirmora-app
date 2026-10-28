import type { RaceId } from '../models';

/** Seat colours, the same as `--p1…--p4` and the gallery's maps-render PLAYER. */
export const SEAT_COLORS = ['#d9534a', '#3f7fd8', '#e0b43c', '#46a86a'] as const;

export function seatColor(seat: number | null | undefined): string {
  return seat === null || seat === undefined ? '#a7adbb' : SEAT_COLORS[seat % SEAT_COLORS.length];
}

/** Race colours, the same as `--race-*` (design/data/gamedata.js `colors.main`). */
export const RACE_COLORS: Record<RaceId, string> = {
  knights: '#2f5fb3',
  vampires: '#8e1b2e',
  barbarians: '#a3542a',
  elves: '#2f8a4a',
  dwarves: '#b0652a',
  demons: '#c0392b',
};
