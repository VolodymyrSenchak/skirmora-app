import type { BuiltMap } from '../engine/engine/grid';
import type { Cell, GameEvent, RaceId, StackView } from '../models';

export type HighlightKind =
  /** a cell the selected stack can walk to */
  | 'move'
  /** an enemy the selected stack can attack in melee */
  | 'attack'
  /** an enemy the selected stack can shoot */
  | 'shoot'
  /** a target of the stack's ability or the hero's */
  | 'ability'
  /** the cells to attack from, for the enemy picked first */
  | 'from'
  /** the chosen cell / target of a pending action */
  | 'chosen'
  /** the selected stack */
  | 'selected'
  /** another stack that can still act this turn */
  | 'actable'
  /** a deploy zone */
  | 'zone';

export interface Highlight {
  kind: HighlightKind;
  cells: readonly Cell[];
  /** zone: the seat colour. */
  color?: string;
}

export interface SceneSide {
  seat: number;
  raceId: RaceId;
}

export interface SceneWall extends Cell {
  untilRound?: number;
}

/**
 * The battle scene behind an interface (plan §8): the event animator and the input talk to this,
 * so a final-art renderer (or a test double) can replace Pixi.
 */
export interface BattleRenderer {
  mount(host: HTMLElement, map: BuiltMap, sides: readonly SceneSide[]): Promise<void>;
  /** Instant: on first render, after a gap, and when the event queue drains. */
  setStacks(stacks: readonly StackView[], walls?: readonly SceneWall[]): void;
  /** Replaces every highlight. */
  highlight(groups: readonly Highlight[]): void;
  /** Resolves when the animation has done its part (attacks resolve on the hit frame). */
  play(event: GameEvent): Promise<void>;
  onCellTap(callback: (cell: Cell) => void): void;
  /** 1 or 2. */
  setSpeed(speed: number): void;
  /** prefers-reduced-motion: no tweens, damage numbers still show briefly. */
  setInstant(instant: boolean): void;
  destroy(): void;
}
