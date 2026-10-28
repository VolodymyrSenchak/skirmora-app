import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  ElementRef,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { AnimatedSprite, Application, Container, Graphics, Text } from 'pixi.js';
import { RACE_IDS, RACES } from '../../engine/engine/data/races';
import { MAPS } from '../../engine/engine/data/maps';
import { deployZone, getMap } from '../../engine/engine/grid';
import type { MapId, RaceId } from '../../models';
import { AnimName, AtlasLoader, RaceAtlas } from '../../battle/pixi/atlas-loader';
import { rasterizeMap } from '../../battle/pixi/map-texture';
import { SEAT_COLORS } from '../../ui/colors';

const COLUMNS: AnimName[] = ['idle', 'walk', 'attack', 'shoot', 'hit', 'death'];
/** One grid cell shows the 224 px canvas at this size (128 px = the nominal frame). */
const CELL = 128;
/** Non-looping animations restart after this pause, as in design/art/atlas-viewer.html. */
const REPLAY_PAUSE_MS = 600;

type ZoneMode = 'two' | 'four' | 'none';

/**
 * Phase 0 check page: every animation of every race from the atlases, with the anchor (red cross)
 * and the projectile origin (yellow dot), plus all 8 maps through the battle's rasteriser.
 * Compare with design/art/atlas-viewer.html and the gallery's map section.
 */
@Component({
  selector: 'app-dev-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <main class="wrap">
      <header>
        <span class="eyebrow">Skirmora · dev</span>
        <h1>Атласи і карти</h1>
        <p class="muted">{{ summary() }}</p>
      </header>

      <section aria-labelledby="atlas-h">
        <h2 id="atlas-h">Атласи</h2>
        <div class="segs" role="group" aria-label="Раса">
          @for (race of races; track race) {
            <button class="seg" type="button" [attr.aria-pressed]="race === raceId()" (click)="selectRace(race)">
              {{ raceName(race) }}
            </button>
          }
        </div>
        <p class="muted small">
          Колонки: idle · walk · attack · shoot · hit · death. Червоний хрестик — точка опори, жовта точка — звідки
          вилітає снаряд. Останній рядок — снаряди.
        </p>
        @if (error()) {
          <p class="error-text">{{ error() }}</p>
        }
        <div class="stage" #stage></div>
      </section>

      <section aria-labelledby="maps-h">
        <h2 id="maps-h">Карти</h2>
        <div class="segs" role="group" aria-label="Зони розстановки">
          <button class="seg" type="button" [attr.aria-pressed]="zones() === 'two'" (click)="setZones('two')">2 гравці</button>
          <button class="seg" type="button" [attr.aria-pressed]="zones() === 'four'" (click)="setZones('four')">4 гравці</button>
          <button class="seg" type="button" [attr.aria-pressed]="zones() === 'none'" (click)="setZones('none')">Без зон</button>
        </div>
        <div class="maps">
          @for (map of maps; track map.id) {
            <article class="card map-card">
              <div class="map-host" [attr.data-map]="map.id"></div>
              <div class="row">
                <h3>{{ map.name }}</h3>
                <span class="mono size">{{ map.size }}×{{ map.size }} · {{ map.players }}</span>
              </div>
              <p class="muted">{{ map.desc }}</p>
            </article>
          }
        </div>
      </section>
    </main>
  `,
  styles: `
    .wrap { max-width: 1180px; margin: 0 auto; padding: 24px 16px 48px; display: grid; gap: 32px; }
    header { display: grid; gap: 8px; }
    h1 { font-size: clamp(32px, 6vw, 56px); }
    section { display: grid; gap: 12px; }
    .small { font-size: 13px; }
    .stage { overflow-x: auto; border-radius: 8px; }
    .stage :is(canvas) { display: block; max-width: 100%; height: auto; }
    .maps { display: grid; grid-template-columns: repeat(auto-fill, minmax(250px, 1fr)); gap: 14px; }
    .map-card { display: grid; gap: 10px; align-content: start; min-width: 0; }
    .map-host :is(canvas) { width: 100%; height: auto; display: block; border-radius: 6px; }
    .row { display: flex; justify-content: space-between; align-items: baseline; gap: 10px; }
    .size { color: var(--brass); font-size: 13px; white-space: nowrap; }
    .map-card p { font-size: 13.5px; }
  `,
})
export class DevPage {
  private readonly host = inject(ElementRef<HTMLElement>);
  private readonly stage = viewChild.required<ElementRef<HTMLElement>>('stage');
  private readonly loader = new AtlasLoader();
  private app: Application | null = null;
  private destroyed = false;
  private readonly timers = new Set<ReturnType<typeof setTimeout>>();

  readonly races = RACE_IDS;
  readonly maps = MAPS;
  readonly raceId = signal<RaceId>('knights');
  readonly zones = signal<ZoneMode>('two');
  readonly error = signal<string | null>(null);
  private readonly frameCount = signal<number | null>(null);
  readonly summary = computed(() => {
    const frames = this.frameCount();
    return `${RACE_IDS.length} рас, ${MAPS.length} карт` + (frames === null ? '' : ` · ${frames} кадрів у поточному атласі`);
  });

  constructor() {
    afterNextRender(() => {
      void this.init();
      void this.drawMaps();
    });
    inject(DestroyRef).onDestroy(() => {
      this.destroyed = true;
      this.timers.forEach(clearTimeout);
      this.app?.destroy(true, { children: true });
    });
  }

  raceName(raceId: RaceId): string {
    return RACES[raceId].name;
  }

  selectRace(raceId: RaceId): void {
    this.raceId.set(raceId);
    void this.drawRace();
  }

  setZones(mode: ZoneMode): void {
    this.zones.set(mode);
    void this.drawMaps();
  }

  private async init(): Promise<void> {
    const app = new Application();
    await app.init({ background: '#1c2230', width: COLUMNS.length * CELL, height: CELL, antialias: true });
    if (this.destroyed) {
      app.destroy(true);
      return;
    }
    this.app = app;
    this.stage().nativeElement.appendChild(app.canvas);
    await this.drawRace();
  }

  private async drawRace(): Promise<void> {
    const app = this.app;
    if (!app) return;
    const raceId = this.raceId();
    let atlas: RaceAtlas;
    try {
      atlas = await this.loader.race(raceId);
    } catch (error) {
      this.error.set(String(error));
      return;
    }
    if (this.destroyed || raceId !== this.raceId()) return;
    this.error.set(null);
    this.timers.forEach(clearTimeout);
    this.timers.clear();
    for (const child of app.stage.removeChildren()) child.destroy({ children: true });

    const { anchor, frameSize } = atlas.meta;
    const scale = CELL / frameSize;
    const unitIds = Object.keys(atlas.meta.units);
    let frames = 0;

    unitIds.forEach((unitId, row) => {
      const unit = atlas.meta.units[unitId];
      COLUMNS.forEach((anim, col) => {
        const meta = unit.anims[anim];
        const textures = atlas.animations[`${unitId}/${anim}`];
        if (!meta || !textures) return;
        frames += textures.length;
        const cell = new Container({ x: col * CELL, y: row * CELL });
        cell.addChild(new Graphics().rect(1, 1, CELL - 2, CELL - 2).fill({ color: (row + col) % 2 ? 0x222a3a : 0x1c2230 }));
        const sprite = new AnimatedSprite(textures);
        sprite.anchor.set(anchor.x, anchor.y);
        sprite.scale.set(scale);
        sprite.position.set(frameSize * anchor.x * scale, frameSize * anchor.y * scale);
        sprite.animationSpeed = meta.fps / 60;
        sprite.loop = meta.loop;
        if (!meta.loop) {
          sprite.onComplete = () => {
            const timer = setTimeout(() => {
              this.timers.delete(timer);
              if (!sprite.destroyed) sprite.gotoAndPlay(0);
            }, REPLAY_PAUSE_MS);
            this.timers.add(timer);
          };
        }
        sprite.play();
        cell.addChild(sprite);

        const ax = frameSize * anchor.x * scale;
        const ay = frameSize * anchor.y * scale;
        const marks = new Graphics()
          .moveTo(ax - 4, ay)
          .lineTo(ax + 4, ay)
          .moveTo(ax, ay - 4)
          .lineTo(ax, ay + 4)
          .stroke({ width: 1, color: 0xd9534a });
        if (meta.projectileOrigin) {
          marks.circle(meta.projectileOrigin.x * scale, meta.projectileOrigin.y * scale, 2.5).fill({ color: 0xffe27a });
        }
        cell.addChild(marks);
        if (col === 0) {
          cell.addChild(new Text({ text: unit.name, x: 4, y: 3, style: { fontSize: 11, fill: 0xa7adbb, fontFamily: 'Golos Text, sans-serif' } }));
        }
        app.stage.addChild(cell);
      });
    });

    // the projectiles, one per cell, in the last row(s)
    const projectiles = await this.loader.projectiles();
    if (this.destroyed || raceId !== this.raceId()) return;
    const names = Object.keys(projectiles.animations);
    names.forEach((name, i) => {
      const col = i % COLUMNS.length;
      const row = unitIds.length + Math.floor(i / COLUMNS.length);
      const cell = new Container({ x: col * CELL, y: row * CELL });
      cell.addChild(new Graphics().rect(1, 1, CELL - 2, CELL - 2).fill({ color: 0x1c2230 }));
      const sprite = new AnimatedSprite(projectiles.animations[name]);
      sprite.anchor.set(0.5);
      sprite.position.set(CELL / 2, CELL / 2);
      sprite.scale.set(1.5);
      sprite.animationSpeed = 12 / 60;
      sprite.play();
      cell.addChild(sprite);
      cell.addChild(new Text({ text: name, x: 4, y: 3, style: { fontSize: 11, fill: 0xa7adbb, fontFamily: 'Golos Text, sans-serif' } }));
      app.stage.addChild(cell);
    });

    const rows = unitIds.length + Math.ceil(names.length / COLUMNS.length);
    app.renderer.resize(COLUMNS.length * CELL, rows * CELL);
    this.frameCount.set(frames);
  }

  private async drawMaps(): Promise<void> {
    const mode = this.zones();
    for (const def of MAPS) {
      const map = getMap(def.id as MapId);
      const zones =
        mode === 'none'
          ? []
          : (mode === 'two' ? [0, 1] : [0, 1, 2, 3]).map((index) => ({
              cells: deployZone(map, mode, index),
              color: SEAT_COLORS[index],
            }));
      const canvas = await rasterizeMap(map, 24, { zones });
      if (this.destroyed || mode !== this.zones()) return;
      const slot = (this.host.nativeElement as HTMLElement).querySelector<HTMLElement>(`[data-map="${def.id}"]`);
      slot?.replaceChildren(canvas);
    }
  }
}
