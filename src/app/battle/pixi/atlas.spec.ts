import { describe, expect, it } from 'vitest';
import { RACE_IDS, RACES, UNITS } from '../../engine/engine/data/races';
import index from '../../../../public/art/atlas/index.json';
import knights from '../../../../public/art/atlas/knights.json';
import vampires from '../../../../public/art/atlas/vampires.json';
import barbarians from '../../../../public/art/atlas/barbarians.json';
import elves from '../../../../public/art/atlas/elves.json';
import dwarves from '../../../../public/art/atlas/dwarves.json';
import demons from '../../../../public/art/atlas/demons.json';
import projectiles from '../../../../public/art/atlas/projectiles.json';
import type { RaceArtMeta } from './atlas-loader';

// Plan §13: a broken art drop is caught here, before it reaches a phone.

interface AtlasJson {
  frames: Record<string, unknown>;
  animations: Record<string, string[]>;
  meta: { skirmora?: RaceArtMeta };
}

const ATLASES: Record<string, AtlasJson> = { knights, vampires, barbarians, elves, dwarves, demons };

describe('race atlases', () => {
  it('index.json lists every race of the synced data', () => {
    expect(Object.keys(index.races).sort()).toEqual([...RACE_IDS].sort());
    expect(index.anchor).toEqual({ x: 0.5, y: 0.777 });
  });

  for (const raceId of RACE_IDS) {
    const atlas = ATLASES[raceId];

    it(`${raceId}: every unit has its animations and every frame exists`, () => {
      for (const unitId of RACES[raceId].units) {
        const unit = UNITS[unitId];
        const needed = ['idle', 'walk', 'attack', 'hit', 'death', ...(unit.ranged ? ['shoot'] : [])];
        for (const anim of needed) {
          const frames = atlas.animations[`${unitId}/${anim}`];
          expect(frames?.length, `${unitId}/${anim}`).toBeGreaterThan(0);
          for (const frame of frames) expect(atlas.frames[frame], frame).toBeDefined();
          expect(atlas.meta.skirmora?.units[unitId]?.anims[anim as 'idle'], `${unitId}/${anim} meta`).toBeDefined();
        }
      }
    });

    it(`${raceId}: the hero has idle and attack`, () => {
      expect(atlas.animations['hero/idle']?.length).toBeGreaterThan(0);
      expect(atlas.animations['hero/attack']?.length).toBeGreaterThan(0);
    });

    it(`${raceId}: every projectile named in the meta exists`, () => {
      for (const unit of Object.values(atlas.meta.skirmora!.units)) {
        const id = unit.anims.shoot?.projectile;
        if (id) expect((projectiles.animations as Record<string, string[]>)[`${id}/fly`], id).toBeDefined();
      }
    });
  }
});
