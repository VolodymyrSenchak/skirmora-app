import { ChangeDetectionStrategy, Component, computed, input, model } from '@angular/core';
import { MAPS } from '../engine/engine/data/maps';
import type { GameMode, MapId } from '../models';
import { MapPreview } from './map-preview';

/** The 8 maps as live previews (create, lobby settings, hot-seat setup). */
@Component({
  selector: 'app-map-picker',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MapPreview],
  template: `
    <div class="maps" role="radiogroup" aria-label="Карта">
      @for (m of maps; track m.id) {
        <button
          class="map card"
          type="button"
          role="radio"
          [attr.aria-checked]="m.id === mapId()"
          [disabled]="disabled()"
          (click)="mapId.set(m.id)"
        >
          <app-map-preview [mapId]="m.id" [players]="players()" [mode]="mode()" />
          <span class="map-name">{{ m.name }}</span>
          <span class="mono muted small">{{ m.size }}×{{ m.size }} · {{ m.players }}</span>
        </button>
      }
    </div>
    <p class="muted small">{{ desc() }}</p>
  `,
  styles: `
    :host { display: grid; gap: 8px; }
    .maps { display: grid; grid-template-columns: repeat(auto-fill, minmax(118px, 1fr)); gap: 8px; }
    .map { display: grid; gap: 4px; padding: 6px; text-align: left; }
    .map[aria-checked='true'] { border-color: var(--brass); box-shadow: 0 0 0 1px var(--brass); }
    .map:disabled { opacity: 0.6; }
    .map-name { font: 700 14px/1.1 var(--font-display); }
    .small { font-size: 13px; }
  `,
})
export class MapPicker {
  protected readonly maps = MAPS;
  readonly mapId = model.required<MapId>();
  readonly players = input(2);
  readonly mode = input<GameMode>('ffa');
  readonly disabled = input(false);

  protected readonly desc = computed(() => MAPS.find((map) => map.id === this.mapId())?.desc ?? '');
}
