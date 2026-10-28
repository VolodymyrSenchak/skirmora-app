import { ChangeDetectionStrategy, Component, input, model } from '@angular/core';
import { BUDGETS } from '../../engine/game/skirmora.state';
import type { CreateSettings, GameMode } from '../../models';
import { MapPicker } from '../../ui/map-picker';

export const DEFAULT_ROOM_SETTINGS: CreateSettings = {
  mapId: 'valley',
  budget: 1000,
  mode: 'ffa',
  turnSeconds: 45,
  maxPlayers: 4,
};

export const TURN_OPTIONS = [30, 45, 60, 90] as const;

/**
 * Map, budget, mode, turn time, room size (contract §1): create, and the host's lobby edit.
 * TODO(open question, API plan §13): which room rules the host may change before the start —
 * the API takes any subset of the create settings today, so the form offers all of them. Ask the owner.
 */
@Component({
  selector: 'app-room-settings-form',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MapPicker],
  template: `
    <section class="field">
      <span class="label">Карта</span>
      <app-map-picker
        [mapId]="value().mapId"
        (mapIdChange)="patch({ mapId: $event })"
        [players]="value().mode === 'teams' ? 4 : value().maxPlayers"
        [mode]="value().mode"
        [disabled]="disabled()"
      />
    </section>
    <section class="field">
      <span class="label">Бюджет</span>
      <div class="segs">
        @for (b of budgets; track b) {
          <button class="seg" type="button" [disabled]="disabled()" [attr.aria-pressed]="b === value().budget" (click)="patch({ budget: b })">{{ b }}</button>
        }
      </div>
    </section>
    <section class="field">
      <span class="label">Режим</span>
      <div class="segs">
        <button class="seg" type="button" [disabled]="disabled()" [attr.aria-pressed]="value().mode === 'ffa'" (click)="patch({ mode: 'ffa' })">Кожен сам за себе</button>
        <button class="seg" type="button" [disabled]="disabled()" [attr.aria-pressed]="value().mode === 'teams'" (click)="setTeams()">2 на 2</button>
      </div>
    </section>
    <section class="field">
      <span class="label">Час на хід</span>
      <div class="segs">
        @for (s of turns; track s) {
          <button class="seg" type="button" [disabled]="disabled()" [attr.aria-pressed]="s === value().turnSeconds" (click)="patch({ turnSeconds: s })">{{ s }} с</button>
        }
      </div>
    </section>
    <section class="field">
      <span class="label">Гравців у кімнаті</span>
      <div class="segs">
        @for (n of sizes; track n) {
          <button
            class="seg"
            type="button"
            [disabled]="disabled() || (value().mode === 'teams' && n !== 4) || n < minPlayers()"
            [attr.aria-pressed]="n === value().maxPlayers"
            (click)="patch({ maxPlayers: n })"
          >
            до {{ n }}
          </button>
        }
      </div>
    </section>
  `,
  styles: `
    :host { display: grid; gap: 16px; }
  `,
})
export class RoomSettingsForm {
  protected readonly budgets = BUDGETS;
  protected readonly turns = TURN_OPTIONS;
  protected readonly sizes = [2, 3, 4];

  readonly value = model.required<CreateSettings>();
  readonly disabled = input(false);
  /** Players already in the room: `maxPlayers` can't go below (contract §2). */
  readonly minPlayers = input(1);

  protected patch(changes: Partial<CreateSettings>): void {
    this.value.update((value) => ({ ...value, ...changes }));
  }

  protected setTeams(): void {
    this.patch({ mode: 'teams' as GameMode, maxPlayers: 4 });
  }

}
