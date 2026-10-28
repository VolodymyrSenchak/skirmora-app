import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { DomSanitizer } from '@angular/platform-browser';
import { deployZone, getMap } from '../engine/engine/grid';
import type { GameMode, MapId } from '../models';
import { mapSvg } from '../battle/pixi/map-texture';
import { SEAT_COLORS } from './colors';

/**
 * A map as an inline SVG from the synced map data (plan §15.3): the create, lobby and hot-seat
 * setup screens. `players` decides the zones drawn (2 → columns, 3–4 → corners).
 */
@Component({
  selector: 'app-map-preview',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<div class="map" [innerHTML]="svg()" role="img" [attr.aria-label]="label()"></div>`,
  styles: `
    :host { display: block; }
    .map { border-radius: 6px; overflow: hidden; }
  `,
})
export class MapPreview {
  private readonly sanitizer = inject(DomSanitizer);

  readonly mapId = input.required<MapId>();
  readonly players = input(2);
  readonly mode = input<GameMode>('ffa');
  readonly zones = input(true);

  protected readonly label = computed(() => getMap(this.mapId()).name);

  protected readonly svg = computed(() => {
    const map = getMap(this.mapId());
    const four = this.mode() === 'teams' || this.players() > 2;
    const count = this.mode() === 'teams' ? 4 : this.players();
    const zones = this.zones()
      ? Array.from({ length: count }, (_, index) => ({ cells: deployZone(map, four ? 'four' : 'two', index), color: SEAT_COLORS[index] }))
      : [];
    // our own SVG built from static map data: nothing user-supplied goes in
    return this.sanitizer.bypassSecurityTrustHtml(mapSvg(map, { cell: 24, zones, fluid: true }));
  });
}
