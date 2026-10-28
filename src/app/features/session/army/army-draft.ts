import { computed, signal, Signal } from '@angular/core';
import { armyPoints, gearCap, itemCost, maxChampions, maxStacks, validateArmy } from '../../../engine/engine/army';
import { ITEMS, SLOTS } from '../../../engine/engine/data/items';
import { RACES, UNITS } from '../../../engine/engine/data/races';
import type { Army, ItemId, RaceId, SingleSlot, Slot, UnitId } from '../../../models';

export interface DraftRules {
  raceId: RaceId;
  budget: number;
  mapSize: number;
  playerCount: number;
}

export interface DraftStack {
  unitId: UnitId;
  count: number;
}

export const SINGLE_SLOTS = SLOTS.filter((slot): slot is SingleSlot => slot !== 'ring');

/**
 * The army being bought (plan §7 "army"). Live validation comes from the synced `army.ts` —
 * the same function the server runs — so the shop and the server never disagree; the server
 * still checks the submit.
 */
export class ArmyDraft {
  readonly stacks = signal<DraftStack[]>([]);
  readonly items = signal<Partial<Record<SingleSlot, ItemId>>>({});
  readonly rings = signal<ItemId[]>([]);

  constructor(private readonly rules: Signal<DraftRules | null>) {}

  readonly army = computed<Army>(() => ({
    stacks: this.stacks().map((stack) => ({ ...stack })),
    items: { ...this.items() },
    rings: [...this.rings()],
  }));

  readonly budget = computed(() => this.rules()?.budget ?? 0);
  readonly gearCap = computed(() => gearCap(this.budget()));
  readonly points = computed(() => armyPoints(this.army(), this.budget()));
  readonly spent = computed(() => this.points().unitPoints + this.points().gearPoints);
  readonly remaining = computed(() => this.budget() - this.spent());
  readonly maxStacks = computed(() => {
    const rules = this.rules();
    return rules ? maxStacks(rules.mapSize, rules.playerCount) : 6;
  });
  readonly maxChampions = computed(() => maxChampions(this.budget()));
  readonly champions = computed(() =>
    this.stacks().reduce((sum, stack) => sum + (UNITS[stack.unitId].tier === 10 ? stack.count : 0), 0),
  );

  /** The first rule the army breaks, as the server would report it; null = ready to submit. */
  readonly problem = computed<string | null>(() => {
    const rules = this.rules();
    if (!rules) return 'no-race';
    const check = validateArmy(this.army(), rules.raceId, rules);
    return check.ok ? null : check.reason;
  });

  readonly units = computed(() => {
    const raceId = this.rules()?.raceId;
    return raceId ? RACES[raceId].units.map((id) => UNITS[id]) : [];
  });

  stacksOf(unitId: UnitId): number {
    return this.stacks().filter((stack) => stack.unitId === unitId).length;
  }

  /** A unit can be added as a new stack: room for a stack, at most 2 of a type, a champion slot left. */
  canAdd(unitId: UnitId): boolean {
    const unit = UNITS[unitId];
    if (this.stacks().length >= this.maxStacks() || this.stacksOf(unitId) >= 2) return false;
    if (unit.tier === 10 && this.champions() >= this.maxChampions()) return false;
    return this.remaining() >= unit.cost;
  }

  /** How many of the unit the leftover budget buys on top of `current`. */
  affordable(unitId: UnitId, current = 0): number {
    const unit = UNITS[unitId];
    let count = current + Math.max(0, Math.floor(this.remaining() / unit.cost));
    if (unit.tier === 10) count = Math.min(count, current + this.maxChampions() - this.champions());
    return count;
  }

  /** Adds a stack of the unit sized to a fair share of what is left. */
  add(unitId: UnitId): void {
    if (!this.canAdd(unitId)) return;
    const unit = UNITS[unitId];
    const slotsLeft = Math.max(1, this.maxStacks() - this.stacks().length);
    const share = Math.floor(this.remaining() / slotsLeft / unit.cost);
    const count = Math.max(1, Math.min(share, this.affordable(unitId)));
    this.stacks.update((stacks) => [...stacks, { unitId, count }]);
  }

  setCount(index: number, count: number): void {
    const stack = this.stacks()[index];
    if (!stack) return;
    const max = this.affordable(stack.unitId, stack.count);
    const next = Math.max(1, Math.min(Math.floor(count) || 1, max));
    this.stacks.update((stacks) => stacks.map((candidate, i) => (i === index ? { ...candidate, count: next } : candidate)));
  }

  remove(index: number): void {
    this.stacks.update((stacks) => stacks.filter((_, i) => i !== index));
  }

  equip(slot: SingleSlot, itemId: ItemId | null): void {
    this.items.update((items) => {
      const next = { ...items };
      if (itemId) next[slot] = itemId;
      else delete next[slot];
      return next;
    });
  }

  setRing(index: 0 | 1, itemId: ItemId | null): void {
    this.rings.update((rings) => {
      const next: (ItemId | null)[] = [rings[0] ?? null, rings[1] ?? null];
      next[index] = itemId;
      return next.filter((id): id is ItemId => !!id);
    });
  }

  itemsFor(slot: Slot) {
    return Object.values(ITEMS).filter((item) => item.slot === slot);
  }

  itemCost(itemId: ItemId): number {
    return itemCost(itemId, this.budget());
  }

  /** Whether swapping `slot`'s item for `itemId` keeps the gear under the 30% cap. */
  fitsCap(itemId: ItemId, replacing: ItemId | null | undefined): boolean {
    const after = this.points().gearPoints - (replacing ? this.itemCost(replacing) : 0) + this.itemCost(itemId);
    return after <= this.gearCap();
  }

  load(army: Army | null): void {
    this.stacks.set(army ? army.stacks.map((stack) => ({ unitId: stack.unitId as UnitId, count: stack.count })) : []);
    this.items.set(army ? { ...army.items } : {});
    this.rings.set(army ? [...army.rings] : []);
  }

  clear(): void {
    this.load(null);
  }
}
