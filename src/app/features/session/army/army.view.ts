import { ChangeDetectionStrategy, Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { errorMessage } from '../../../core/api-error';
import { ABILITIES } from '../../../engine/engine/data/abilities';
import { ITEMS, SLOT_NAMES } from '../../../engine/engine/data/items';
import { RACE_IDS, RACES, UNITS } from '../../../engine/engine/data/races';
import { getMap } from '../../../engine/engine/grid';
import type { ItemId, RaceId, SingleSlot, UnitId } from '../../../models';
import type { ItemDef, UnitDef } from '../../../engine/engine/types';
import { Skirmora } from '../../../session/actions';
import { SessionConnection } from '../../../session/session-connection';
import { SessionStore } from '../../../session/session.store';
import { RACE_COLORS, seatColor } from '../../../ui/colors';
import { ERROR_REASONS, range } from '../../../ui/copy';
import { UnitPortrait } from '../../../ui/unit-portrait';
import { SeatsBar } from '../seats-bar';
import { ArmyDraft, SINGLE_SLOTS } from './army-draft';

type Tab = 'units' | 'hero';
type SlotKey = SingleSlot | 'ring0' | 'ring1';

const FX_LABELS: Record<string, string> = { atk: 'атака', def: 'захист', luck: 'удача', morale: 'мораль' };

/**
 * Army phase (plan §7): race grid → unit shop → hero gear → ready. Live checks from the synced
 * `army.ts`; a server `invalid-army { reason }` lands on the budget bar.
 */
@Component({
  selector: 'app-army-view',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [SeatsBar, UnitPortrait],
  templateUrl: './army.view.html',
  styleUrl: './army.view.scss',
})
export class ArmyView {
  protected readonly store = inject(SessionStore);
  protected readonly connection = inject(SessionConnection);

  protected readonly races = RACE_IDS.map((id) => RACES[id]);
  protected readonly raceColors = RACE_COLORS;
  protected readonly tab = signal<Tab>('units');
  protected readonly openSlot = signal<SlotKey | null>(null);
  protected readonly serverError = signal<string | null>(null);
  protected readonly busy = signal(false);
  /** Back on the race grid with a race already picked. */
  protected readonly choosingRace = signal(false);

  protected readonly seat = this.store.mySeat;
  protected readonly raceId = computed(() => this.seat()?.raceId ?? null);
  protected readonly race = computed(() => (this.raceId() ? RACES[this.raceId()!] : null));
  protected readonly ready = computed(() => this.seat()?.armyReady ?? false);
  protected readonly myColor = computed(() => seatColor(this.seat()?.seat));

  protected readonly draft = new ArmyDraft(
    computed(() => {
      const game = this.store.game();
      const raceId = this.raceId();
      if (!game || !raceId) return null;
      return { raceId, budget: game.budget, mapSize: getMap(game.mapId).size, playerCount: game.seats.length };
    }),
  );

  protected readonly problemText = computed(() => {
    const problem = this.draft.problem();
    return problem ? (ERROR_REASONS[problem] ?? problem) : null;
  });

  protected readonly unitPct = computed(() => pct(this.draft.points().unitPoints, this.draft.budget()));
  protected readonly gearPct = computed(() => pct(this.draft.points().gearPoints, this.draft.budget()));
  protected readonly capPct = computed(() => pct(this.draft.gearCap(), this.draft.budget()));

  protected readonly slots = computed(() => {
    const items = this.draft.items();
    const rings = this.draft.rings();
    const single = SINGLE_SLOTS.map((slot) => ({ key: slot as SlotKey, slot, name: SLOT_NAMES[slot], itemId: items[slot] ?? null }));
    const ringSlots = ([0, 1] as const).map((i) => ({ key: `ring${i}` as SlotKey, slot: 'ring' as const, name: `Кільце ${i + 1}`, itemId: rings[i] ?? null }));
    return [...single, ...ringSlots];
  });

  constructor() {
    // start from the army the server has (a rematch keeps it), once per race
    let loadedFor: string | null = null;
    effect(() => {
      const raceId = this.raceId();
      const army = this.store.game()?.mine?.army ?? null;
      const key = `${this.store.me()?.playerId}:${raceId}`;
      if (key === loadedFor) return;
      loadedFor = key;
      untracked(() => {
        this.draft.load(raceId && army ? army : null);
        this.serverError.set(null);
      });
    });
  }

  protected pickRace(raceId: RaceId): void {
    if (raceId === this.raceId()) {
      this.choosingRace.set(false);
      return;
    }
    // a new race drops the army on the server too
    void this.send(Skirmora.pickRace(raceId)).then(() => this.choosingRace.set(false));
  }

  protected submit(): void {
    void this.send(Skirmora.submitArmy(this.draft.army()));
  }

  protected unready(): void {
    void this.send(Skirmora.unready());
  }

  protected toggleSlot(key: SlotKey): void {
    this.openSlot.set(this.openSlot() === key ? null : key);
  }

  protected choose(key: SlotKey, itemId: ItemId | null): void {
    this.serverError.set(null);
    if (key === 'ring0' || key === 'ring1') this.draft.setRing(key === 'ring0' ? 0 : 1, itemId);
    else this.draft.equip(key, itemId);
    this.openSlot.set(null);
  }

  protected add(unitId: UnitId): void {
    this.serverError.set(null);
    this.draft.add(unitId);
  }

  protected step(index: number, delta: number): void {
    this.serverError.set(null);
    const stack = this.draft.stacks()[index];
    if (stack) this.draft.setCount(index, stack.count + delta);
  }

  protected setCount(index: number, event: Event): void {
    this.serverError.set(null);
    this.draft.setCount(index, Number((event.target as HTMLInputElement).value));
  }

  protected max(index: number): void {
    const stack = this.draft.stacks()[index];
    if (stack) this.draft.setCount(index, this.draft.affordable(stack.unitId, stack.count));
  }

  protected remove(index: number): void {
    this.draft.remove(index);
  }

  protected unit(id: string): UnitDef {
    return UNITS[id as UnitId];
  }

  protected abilityTags(unit: UnitDef) {
    return unit.abilities.map((id) => ({ name: ABILITIES[id].name, desc: ABILITIES[id].desc }));
  }

  protected item(id: ItemId | null): ItemDef | null {
    return id ? ITEMS[id] : null;
  }

  protected itemEffect(item: ItemDef): string {
    if (item.text) return item.text;
    return Object.entries(item.fx)
      .map(([key, value]) => `${value > 0 ? '+' : ''}${value} ${FX_LABELS[key] ?? key}`)
      .join(', ');
  }

  protected dmg(unit: UnitDef): string {
    return range(unit.dmg);
  }

  private async send(action: Parameters<SessionConnection['dispatch']>[0]): Promise<void> {
    if (this.busy()) return;
    this.busy.set(true);
    this.serverError.set(null);
    try {
      const result = await this.connection.dispatch(action);
      if (!result.ok) this.serverError.set(errorMessage(result.error));
    } finally {
      this.busy.set(false);
    }
  }
}

function pct(value: number, total: number): number {
  return total > 0 ? Math.max(0, Math.min(100, (value / total) * 100)) : 0;
}
