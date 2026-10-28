import { computed, signal, Signal } from '@angular/core';
import type { Cell, GameAction, Hints, Preview, StackHints, StackView } from '../models';
import { PocketLegions } from '../session/actions';
import type { Highlight } from './battle-renderer';

export type InputMode = 'act' | 'ability' | 'hero';

/** A chosen action waiting for its confirming tap (plan §8: one tap never commits an attack). */
export type Pending =
  | { kind: 'attack'; targetId: string; from: Cell; options: Cell[]; preview: Preview }
  | { kind: 'shoot'; targetId: string; preview: Preview; penalty: string[]; canMelee: boolean }
  | { kind: 'ability'; targetId: string | null }
  | { kind: 'hero'; target?: string; ally?: string; cell?: Cell; cells?: Cell[] };

export interface InputContext {
  hints: Signal<Hints | null>;
  /** The stacks the scene shows (living ones matter). */
  stacks: Signal<readonly StackView[]>;
}

const same = (a: Cell, b: Cell) => a.x === b.x && a.y === b.y;
const has = (cells: readonly Cell[], cell: Cell) => cells.some((candidate) => same(candidate, cell));

/**
 * Tap → select / move / attack / shoot / ability / hero, from `hints` only (plan §8). Nothing here
 * knows a rule: a cell is a target because a hint lists it. The result of a tap is either a new
 * local state or an action to send.
 */
export class BattleInput {
  readonly selectedId = signal<string | null>(null);
  readonly mode = signal<InputMode>('act');
  readonly pending = signal<Pending | null>(null);

  constructor(private readonly ctx: InputContext) {}

  /** The selected stack's hints; the first actable stack when nothing valid is selected. */
  readonly selected = computed<StackHints | null>(() => {
    const hints = this.ctx.hints();
    if (!hints?.stacks.length) return null;
    const id = this.selectedId();
    return hints.stacks.find((stack) => stack.stackId === id) ?? hints.stacks[0];
  });

  readonly selectedStack = computed(() => {
    const id = this.selected()?.stackId;
    return id ? (this.ctx.stacks().find((stack) => stack.id === id) ?? null) : null;
  });

  readonly heroHints = computed(() => this.ctx.hints()?.hero ?? null);

  /** What the scene highlights for the current state. */
  readonly highlights = computed<Highlight[]>(() => {
    const hints = this.ctx.hints();
    const selected = this.selected();
    if (!hints || (!selected && this.mode() !== 'hero')) return [];
    const groups: Highlight[] = [];
    const cellOf = (id: string | undefined | null) => {
      const stack = id ? this.ctx.stacks().find((candidate) => candidate.id === id) : undefined;
      return stack ? [{ x: stack.x, y: stack.y }] : [];
    };
    const cellsOf = (ids: readonly string[]) => ids.flatMap((id) => cellOf(id));
    const pending = this.pending();
    const mode = this.mode();

    if (mode === 'hero') {
      const hero = hints.hero;
      if (!hero) return [];
      if (pending?.kind === 'hero' && pending.target && hero.abilityId === 'blood_ritual') {
        groups.push({ kind: 'chosen', cells: cellOf(pending.target) }, { kind: 'ability', cells: cellsOf(hero.allies) });
        if (pending.ally) groups.push({ kind: 'chosen', cells: cellOf(pending.ally) });
        return groups;
      }
      groups.push({ kind: 'ability', cells: hero.cells.length && hero.abilityId === 'stone_wall' ? hero.cells : cellsOf(hero.targets) });
      if (pending?.kind === 'hero') {
        if (pending.target) groups.push({ kind: 'chosen', cells: cellOf(pending.target) });
        if (pending.cell) groups.push({ kind: 'chosen', cells: square(pending.cell) });
        if (pending.cells) groups.push({ kind: 'chosen', cells: pending.cells });
      }
      return groups;
    }

    const others = hints.stacks.filter((stack) => stack.stackId !== selected!.stackId).map((stack) => stack.stackId);
    groups.push({ kind: 'actable', cells: cellsOf(others) });
    groups.push({ kind: 'selected', cells: cellOf(selected!.stackId) });

    if (mode === 'ability') {
      const ability = selected!.abilities[0];
      if (ability) groups.push({ kind: 'ability', cells: cellsOf(ability.targets) });
      if (pending?.kind === 'ability' && pending.targetId) groups.push({ kind: 'chosen', cells: cellOf(pending.targetId) });
      return groups;
    }

    if (pending?.kind === 'attack') {
      groups.push({ kind: 'from', cells: pending.options });
      groups.push({ kind: 'chosen', cells: [pending.from] });
      groups.push({ kind: 'attack', cells: cellOf(pending.targetId) });
      return groups;
    }
    groups.push({ kind: 'move', cells: selected!.moves });
    const shootable = new Set(selected!.shots.map((shot) => shot.targetId));
    groups.push({ kind: 'attack', cells: cellsOf(selected!.attacks.map((a) => a.targetId).filter((id) => !shootable.has(id))) });
    groups.push({ kind: 'shoot', cells: cellsOf([...shootable]) });
    if (pending?.kind === 'shoot') groups.push({ kind: 'chosen', cells: cellOf(pending.targetId) });
    return groups;
  });

  /** Back to "pick a stack" (a new turn, a cancel). */
  reset(): void {
    this.mode.set('act');
    this.pending.set(null);
  }

  select(stackId: string): void {
    this.selectedId.set(stackId);
    this.reset();
  }

  setMode(mode: InputMode): GameAction | null {
    this.pending.set(null);
    this.mode.set(this.mode() === mode ? 'act' : mode);
    // no target to pick: the mode itself is the choice, confirmed by the button
    if (this.mode() === 'ability' && this.selected()?.abilities[0]?.targets.length === 0) {
      this.pending.set({ kind: 'ability', targetId: null });
    }
    if (this.mode() === 'hero' && this.heroHints()?.abilityId === 'battle_cry') {
      this.pending.set({ kind: 'hero' });
    }
    return null;
  }

  /** The confirm button: sends the pending action. */
  confirm(): GameAction | null {
    const pending = this.pending();
    const selected = this.selected();
    if (!pending) return null;
    switch (pending.kind) {
      case 'attack':
        return this.commit(PocketLegions.act({ stackId: selected!.stackId, kind: 'attack', target: pending.targetId, cell: pending.from }));
      case 'shoot':
        return this.commit(PocketLegions.act({ stackId: selected!.stackId, kind: 'shoot', target: pending.targetId }));
      case 'ability':
        return this.commit(
          PocketLegions.act({ stackId: selected!.stackId, kind: 'ability', ...(pending.targetId ? { target: pending.targetId } : {}) }),
        );
      case 'hero': {
        const hero = this.heroHints();
        if (!hero || !this.heroReady(pending)) return null;
        const { target, ally, cell, cells } = pending;
        return this.commit(PocketLegions.heroAbility({ ...(target ? { target } : {}), ...(ally ? { ally } : {}), ...(cell ? { cell } : {}), ...(cells ? { cells } : {}) }));
      }
    }
  }

  /** Shoot ↔ melee for a target both are possible against. */
  switchToMelee(): void {
    const pending = this.pending();
    const selected = this.selected();
    if (pending?.kind !== 'shoot' || !selected) return;
    const attack = selected.attacks.find((option) => option.targetId === pending.targetId);
    if (attack) this.pending.set({ kind: 'attack', targetId: attack.targetId, from: attack.from[0], options: attack.from, preview: attack.preview });
  }

  defend(): GameAction | null {
    const selected = this.selected();
    return selected?.canDefend ? this.commit(PocketLegions.act({ stackId: selected.stackId, kind: 'defend' })) : null;
  }

  /** A tap on a cell. Returns the action to send, if the tap committed one. */
  tap(cell: Cell): GameAction | null {
    const hints = this.ctx.hints();
    if (!hints) return null;
    const stack = this.ctx.stacks().find((candidate) => candidate.count > 0 && same(candidate, cell));
    switch (this.mode()) {
      case 'hero':
        return this.tapHero(cell, stack);
      case 'ability':
        return this.tapAbility(stack);
      default:
        return this.tapAct(cell, stack, hints);
    }
  }

  private tapAct(cell: Cell, stack: StackView | undefined, hints: Hints): GameAction | null {
    const selected = this.selected();
    const pending = this.pending();
    if (!selected) return null;

    // a second tap on the chosen target commits; a tap on another "from" cell changes it
    if (pending?.kind === 'attack') {
      if (stack?.id === pending.targetId) return this.confirm();
      if (has(pending.options, cell)) {
        this.pending.set({ ...pending, from: cell });
        return null;
      }
    }
    if (pending?.kind === 'shoot' && stack?.id === pending.targetId) return this.confirm();

    if (stack) {
      const shot = selected.shots.find((option) => option.targetId === stack.id);
      const attack = selected.attacks.find((option) => option.targetId === stack.id);
      if (shot) {
        this.pending.set({ kind: 'shoot', targetId: stack.id, preview: shot.preview, penalty: shot.penalty, canMelee: !!attack });
        return null;
      }
      if (attack) {
        this.pending.set({ kind: 'attack', targetId: stack.id, from: attack.from[0], options: attack.from, preview: attack.preview });
        return null;
      }
      if (hints.stacks.some((option) => option.stackId === stack.id)) {
        this.select(stack.id);
        return null;
      }
    }
    if (has(selected.moves, cell)) {
      return this.commit(PocketLegions.act({ stackId: selected.stackId, kind: 'move', cell }));
    }
    this.pending.set(null);
    return null;
  }

  private tapAbility(stack: StackView | undefined): GameAction | null {
    const ability = this.selected()?.abilities[0];
    if (!ability || !stack) return null;
    const pending = this.pending();
    if (pending?.kind === 'ability' && pending.targetId === stack.id) return this.confirm();
    if (ability.targets.includes(stack.id)) this.pending.set({ kind: 'ability', targetId: stack.id });
    return null;
  }

  private tapHero(cell: Cell, stack: StackView | undefined): GameAction | null {
    const hero = this.heroHints();
    if (!hero) return null;
    const pending = this.pending()?.kind === 'hero' ? (this.pending() as Extract<Pending, { kind: 'hero' }>) : null;
    switch (hero.abilityId) {
      case 'heavenly_shield':
      case 'earth_roots':
        if (stack && pending?.target === stack.id) return this.confirm();
        if (stack && hero.targets.includes(stack.id)) this.pending.set({ kind: 'hero', target: stack.id });
        return null;
      case 'blood_ritual':
        if (stack && pending?.target && pending.ally === stack.id) return this.confirm();
        if (stack && pending?.target && hero.allies.includes(stack.id)) {
          this.pending.set({ ...pending, ally: stack.id });
          return null;
        }
        if (stack && hero.targets.includes(stack.id)) this.pending.set({ kind: 'hero', target: stack.id });
        return null;
      case 'hellfire':
        if (pending?.cell && same(pending.cell, cell)) return this.confirm();
        if (has(hero.cells, cell)) this.pending.set({ kind: 'hero', cell });
        return null;
      case 'stone_wall': {
        const chosen = pending?.cells ?? [];
        if (chosen.length === 3 && has(chosen, cell)) return this.confirm();
        if (chosen.length === 1) {
          const line = wallLine(chosen[0], cell);
          if (line && line.every((part) => has(hero.cells, part))) {
            this.pending.set({ kind: 'hero', cells: line });
            return null;
          }
        }
        if (has(hero.cells, cell)) this.pending.set({ kind: 'hero', cells: [cell] });
        return null;
      }
      case 'battle_cry':
        return null;
    }
  }

  /** Whether the pending hero action has everything its ability needs. */
  heroReady(pending: Pending | null = this.pending()): boolean {
    const hero = this.heroHints();
    if (!hero || pending?.kind !== 'hero') return false;
    switch (hero.abilityId) {
      case 'heavenly_shield':
      case 'earth_roots':
        return !!pending.target;
      case 'blood_ritual':
        return !!pending.target && !!pending.ally;
      case 'hellfire':
        return !!pending.cell;
      case 'stone_wall':
        return pending.cells?.length === 3;
      case 'battle_cry':
        return true;
    }
  }

  private commit(action: GameAction): GameAction {
    this.reset();
    return action;
  }
}

/** Start and end two cells apart in a straight line (8 directions) → the 3 wall cells in order. */
export function wallLine(start: Cell, end: Cell): Cell[] | null {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const ok = (Math.abs(dx) === 2 || dx === 0) && (Math.abs(dy) === 2 || dy === 0) && (dx !== 0 || dy !== 0);
  if (!ok) return null;
  const step = { x: Math.sign(dx), y: Math.sign(dy) };
  return [start, { x: start.x + step.x, y: start.y + step.y }, end];
}

/** Hellfire's 3×3 square around a cell. */
export function square(centre: Cell): Cell[] {
  const cells: Cell[] = [];
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) cells.push({ x: centre.x + dx, y: centre.y + dy });
  return cells;
}
