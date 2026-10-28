import { Assets, Spritesheet, Texture } from 'pixi.js';
import type { RaceId } from '../../models';

/** The atlas format (design/art/atlas/README.md, design §9). */
export type AnimName = 'idle' | 'walk' | 'attack' | 'shoot' | 'hit' | 'death';

export interface AnimMeta {
  fps: number;
  loop: boolean;
  /** attack: the frame on which the damage shows. */
  hitFrame?: number;
  /** shoot: the frame on which the projectile leaves… */
  releaseFrame?: number;
  /** …which projectile (`projectiles.json` → `<id>/fly`)… */
  projectile?: string;
  /** …and from where, in px of the 224 canvas. */
  projectileOrigin?: { x: number; y: number };
  /** death: stop on the last frame. */
  holdLast?: boolean;
}

export interface UnitArtMeta {
  anims: Partial<Record<AnimName, AnimMeta>>;
  name: string;
  tier?: number;
  fly?: boolean;
  ranged?: boolean;
  hero?: boolean;
}

export interface RaceArtMeta {
  frameSize: number;
  nominalSize: number;
  anchor: { x: number; y: number };
  units: Record<string, UnitArtMeta>;
}

export interface AtlasIndex {
  frameSize: number;
  nominalSize: number;
  anchor: { x: number; y: number };
  races: Record<RaceId, string[]>;
  projectiles: string;
}

export interface RaceAtlas {
  raceId: RaceId;
  meta: RaceArtMeta;
  /** `<unitId>/<anim>` → frames, merged over every page of the race. */
  animations: Record<string, Texture[]>;
}

export interface ProjectileAtlas {
  /** `<projectileId>/fly` → frames. */
  animations: Record<string, Texture[]>;
}

export const DEFAULT_ATLAS_BASE = 'art/atlas/';

/**
 * Loads `index.json`, then only the races asked for (≈ 11 MB of GPU memory each) and the
 * projectiles. A missing animation fails loudly: a broken art drop must not reach a phone silently.
 */
export class AtlasLoader {
  private indexPromise: Promise<AtlasIndex> | null = null;
  private readonly races = new Map<RaceId, Promise<RaceAtlas>>();
  private projectilesPromise: Promise<ProjectileAtlas> | null = null;

  constructor(private readonly base = DEFAULT_ATLAS_BASE) {}

  index(): Promise<AtlasIndex> {
    this.indexPromise ??= fetch(this.base + 'index.json').then((response) => {
      if (!response.ok) throw new Error(`Atlas index: HTTP ${response.status}`);
      return response.json() as Promise<AtlasIndex>;
    });
    return this.indexPromise;
  }

  race(raceId: RaceId): Promise<RaceAtlas> {
    let promise = this.races.get(raceId);
    if (!promise) {
      promise = this.loadRace(raceId);
      this.races.set(raceId, promise);
    }
    return promise;
  }

  projectiles(): Promise<ProjectileAtlas> {
    this.projectilesPromise ??= this.index().then(async (index) => {
      const sheet = await Assets.load<Spritesheet>(this.base + index.projectiles);
      return { animations: { ...sheet.animations } };
    });
    return this.projectilesPromise;
  }

  private async loadRace(raceId: RaceId): Promise<RaceAtlas> {
    const index = await this.index();
    const pages = index.races[raceId];
    if (!pages?.length) throw new Error(`No atlas for race ${raceId}`);
    const sheets = await Promise.all(pages.map((page) => Assets.load<Spritesheet>(this.base + page)));
    const animations: Record<string, Texture[]> = {};
    const metas: RaceArtMeta[] = [];
    for (const sheet of sheets) {
      Object.assign(animations, sheet.animations);
      const pageMeta = (sheet.data.meta as { pocketLegions?: RaceArtMeta }).pocketLegions;
      if (pageMeta) metas.push(pageMeta);
    }
    if (!metas.length) throw new Error(`Atlas ${raceId}: no meta.pocketLegions`);
    const meta: RaceArtMeta = { ...metas[0], units: Object.assign({}, ...metas.map((page) => page.units)) };
    return { raceId, meta, animations };
  }
}

/** Frames of one animation; throws if the art drop lacks it. */
export function framesOf(atlas: RaceAtlas, unitId: string, anim: AnimName): Texture[] {
  const frames = atlas.animations[`${unitId}/${anim}`];
  if (!frames?.length) throw new Error(`Atlas ${atlas.raceId}: no frames for ${unitId}/${anim}`);
  return frames;
}

/** `walk` is the fallback for anything a unit lacks (none today, but final art may drop some). */
export function animMeta(atlas: RaceAtlas, unitId: string, anim: AnimName): AnimMeta {
  const unit = atlas.meta.units[unitId];
  return unit?.anims[anim] ?? { fps: 10, loop: anim === 'idle' || anim === 'walk' };
}
