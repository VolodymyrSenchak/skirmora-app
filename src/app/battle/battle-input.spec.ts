import { signal } from '@angular/core';
import { describe, expect, it } from 'vitest';
import type { Hints, StackHints, StackView } from '../models';
import { BattleInput, wallLine } from './battle-input';

const stack = (id: string, seat: number, x: number, y: number): StackView =>
  ({ id, seat, x, y, count: 5, unitId: 'militia', statuses: [] }) as unknown as StackView;

const preview = { dmg: [10, 15] as [number, number], kills: [1, 2] as [number, number] };

const stacks = [stack('s0_0', 0, 1, 1), stack('s0_1', 0, 1, 3), stack('s1_0', 1, 4, 1), stack('s1_1', 1, 6, 6)];

function hintsFor(overrides: Partial<StackHints>[] = [{}, {}]): Hints {
  const base = (stackId: string): StackHints => ({ stackId, moves: [], attacks: [], shots: [], abilities: [], canDefend: true });
  return {
    stacks: [
      { ...base('s0_0'), moves: [{ x: 2, y: 1 }, { x: 3, y: 1 }, { x: 3, y: 2 }], attacks: [{ targetId: 's1_0', from: [{ x: 3, y: 1 }, { x: 3, y: 2 }], preview }], ...overrides[0] },
      { ...base('s0_1'), shots: [{ targetId: 's1_1', penalty: ['range'], preview }], ...overrides[1] },
    ],
    hero: null,
  };
}

function setup(hints: Hints | null = hintsFor()) {
  const hintsSignal = signal<Hints | null>(hints);
  const input = new BattleInput({ hints: hintsSignal, stacks: signal(stacks) });
  return { input, hintsSignal };
}

describe('BattleInput', () => {
  it('selects only stacks the hints offer', () => {
    const { input } = setup();
    expect(input.selected()?.stackId).toBe('s0_0');
    // an enemy that can't be attacked: nothing happens
    expect(input.tap({ x: 6, y: 6 })).toBeNull();
    expect(input.selected()?.stackId).toBe('s0_0');
    input.tap({ x: 1, y: 3 });
    expect(input.selected()?.stackId).toBe('s0_1');
  });

  it('moves with one tap on a highlighted cell, ignores the rest', () => {
    const { input } = setup();
    expect(input.tap({ x: 9, y: 9 })).toBeNull();
    expect(input.tap({ x: 2, y: 1 })).toEqual({ type: 'skirmora.act', payload: { stackId: 's0_0', kind: 'move', cell: { x: 2, y: 1 } } });
  });

  it('never commits an attack with one tap', () => {
    const { input } = setup();
    expect(input.tap({ x: 4, y: 1 })).toBeNull();
    expect(input.pending()).toMatchObject({ kind: 'attack', targetId: 's1_0', from: { x: 3, y: 1 } });
    expect(input.tap({ x: 4, y: 1 })).toEqual({
      type: 'skirmora.act',
      payload: { stackId: 's0_0', kind: 'attack', target: 's1_0', cell: { x: 3, y: 1 } },
    });
    expect(input.pending()).toBeNull();
  });

  it('lets the player pick another cell to attack from', () => {
    const { input } = setup();
    input.tap({ x: 4, y: 1 });
    // (3,2) is both a move cell and a "from" cell: while an attack is pending it picks the cell
    expect(input.tap({ x: 3, y: 2 })).toBeNull();
    expect(input.pending()).toMatchObject({ kind: 'attack', from: { x: 3, y: 2 } });
    expect(input.confirm()?.payload).toMatchObject({ kind: 'attack', cell: { x: 3, y: 2 } });
  });

  it('shoots after a confirming tap, with the preview at hand', () => {
    const { input } = setup();
    input.tap({ x: 1, y: 3 });
    expect(input.tap({ x: 6, y: 6 })).toBeNull();
    expect(input.pending()).toMatchObject({ kind: 'shoot', targetId: 's1_1', preview });
    expect(input.tap({ x: 6, y: 6 })?.payload).toEqual({ stackId: 's0_1', kind: 'shoot', target: 's1_1' });
  });

  it('offers nothing without hints (not my turn, or the queue is playing)', () => {
    const { input, hintsSignal } = setup(null);
    expect(input.selected()).toBeNull();
    expect(input.tap({ x: 2, y: 1 })).toBeNull();
    expect(input.highlights()).toEqual([]);
    hintsSignal.set(hintsFor());
    expect(input.highlights().find((group) => group.kind === 'move')?.cells.length).toBe(3);
  });

  it('builds a stone wall from its two ends', () => {
    expect(wallLine({ x: 1, y: 1 }, { x: 3, y: 1 })).toEqual([{ x: 1, y: 1 }, { x: 2, y: 1 }, { x: 3, y: 1 }]);
    expect(wallLine({ x: 1, y: 1 }, { x: 3, y: 3 })).toEqual([{ x: 1, y: 1 }, { x: 2, y: 2 }, { x: 3, y: 3 }]);
    expect(wallLine({ x: 1, y: 1 }, { x: 3, y: 2 })).toBeNull();
  });

  it('runs a hero ability that needs an enemy and an ally (blood ritual)', () => {
    const hints = hintsFor();
    hints.hero = { abilityId: 'blood_ritual', targets: ['s1_0'], allies: ['s0_1'], cells: [] };
    const { input } = setup(hints);
    input.setMode('hero');
    input.tap({ x: 4, y: 1 });
    expect(input.heroReady()).toBe(false);
    input.tap({ x: 1, y: 3 });
    expect(input.heroReady()).toBe(true);
    expect(input.tap({ x: 1, y: 3 })).toEqual({ type: 'skirmora.heroAbility', payload: { target: 's1_0', ally: 's0_1' } });
  });
});
