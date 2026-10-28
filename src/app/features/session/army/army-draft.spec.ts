import { signal } from '@angular/core';
import { describe, expect, it } from 'vitest';
import { validateArmy } from '../../../engine/engine/army';
import { ArmyDraft, DraftRules } from './army-draft';

const rules = (overrides: Partial<DraftRules> = {}) =>
  signal<DraftRules | null>({ raceId: 'knights', budget: 1000, mapSize: 12, playerCount: 2, ...overrides });

describe('ArmyDraft', () => {
  it('reports no-stacks until something is bought, then nothing', () => {
    const draft = new ArmyDraft(rules());
    expect(draft.problem()).toBe('no-stacks');
    draft.add('militia');
    expect(draft.problem()).toBeNull();
    expect(draft.spent()).toBe(draft.points().unitPoints);
  });

  it('keeps counts inside the budget', () => {
    const draft = new ArmyDraft(rules());
    draft.add('swordsman');
    draft.setCount(0, 999);
    expect(draft.spent()).toBeLessThanOrEqual(1000);
    expect(draft.stacks()[0].count).toBe(Math.floor(1000 / 50));
    expect(draft.remaining()).toBeGreaterThanOrEqual(0);
    expect(draft.problem()).toBeNull();
  });

  it('allows two stacks of a type and the map limit of stacks', () => {
    const draft = new ArmyDraft(rules({ mapSize: 10, playerCount: 3 }));
    expect(draft.maxStacks()).toBe(5);
    draft.add('militia');
    draft.add('militia');
    expect(draft.canAdd('militia')).toBe(false);
    draft.add('archer');
    draft.add('swordsman');
    draft.add('horseman');
    expect(draft.stacks()).toHaveLength(5);
    expect(draft.canAdd('crossbowman')).toBe(false);
  });

  it('caps champions by the budget', () => {
    const draft = new ArmyDraft(rules({ budget: 500 }));
    expect(draft.maxChampions()).toBe(1);
    draft.add('angel');
    expect(draft.champions()).toBe(1);
    draft.setCount(0, 3);
    expect(draft.stacks()[0].count).toBe(1);
    expect(draft.canAdd('angel')).toBe(false);
  });

  it('keeps gear under the 30% cap, with prices scaled to the budget', () => {
    const draft = new ArmyDraft(rules({ budget: 500 }));
    expect(draft.gearCap()).toBe(150);
    expect(draft.itemCost('plate')).toBe(Math.round((75 * 500) / 1000));
    draft.equip('body', 'plate');
    draft.equip('weapon', 'spear_1000');
    draft.equip('head', 'crown');
    // 38 + 38 + 28 = 104; another 55-point (×0.5) shield fits, a fourth heavy item would not
    expect(draft.fitsCap('shield_guard', null)).toBe(true);
    draft.equip('shield', 'shield_guard');
    expect(draft.fitsCap('mantle', null)).toBe(false);
  });

  it('agrees with the server check it mirrors', () => {
    const draft = new ArmyDraft(rules());
    draft.add('archer');
    draft.add('paladin');
    draft.setRing(0, 'ring_str');
    draft.setRing(1, 'ring_str');
    draft.equip('feet', 'boots_scout');
    const check = validateArmy(draft.army(), 'knights', { budget: 1000, mapSize: 12, playerCount: 2 });
    expect(check.ok).toBe(draft.problem() === null);
    expect(draft.army().rings).toEqual(['ring_str', 'ring_str']);
    draft.setRing(0, null);
    expect(draft.army().rings).toEqual(['ring_str']);
  });

  it('loads an army back (a rematch keeps it)', () => {
    const draft = new ArmyDraft(rules());
    draft.load({ stacks: [{ unitId: 'monk', count: 2 }], items: { head: 'helm_luck' }, rings: ['ring_def'] });
    expect(draft.army()).toEqual({ stacks: [{ unitId: 'monk', count: 2 }], items: { head: 'helm_luck' }, rings: ['ring_def'] });
    expect(draft.problem()).toBeNull();
  });
});
