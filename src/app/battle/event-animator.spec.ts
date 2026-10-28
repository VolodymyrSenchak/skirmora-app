import { describe, expect, it } from 'vitest';
import type { BattleView, GameEvent, StackView } from '../models';
import { EventAnimator } from './event-animator';

const ev = (seq: number, type: GameEvent['type'] = 'moved'): GameEvent => ({ seq, round: 1, type, stackId: 's0_0' });
const battle = (count: number): BattleView =>
  ({ stacks: [{ id: 's0_0', count } as StackView], walls: [] }) as unknown as BattleView;

/** A renderer whose `play` waits until the test releases it. */
function fakeRenderer() {
  const log: string[] = [];
  const pending: (() => void)[] = [];
  return {
    log,
    release: () => pending.shift()?.(),
    async flush() {
      while (pending.length) {
        pending.shift()!();
        await Promise.resolve();
        await Promise.resolve();
      }
    },
    renderer: {
      setStacks: (stacks: readonly StackView[]) => void log.push(`set:${stacks[0]?.count}`),
      play: (event: GameEvent) => {
        log.push(`play:${event.seq}`);
        return new Promise<void>((resolve) => pending.push(resolve));
      },
    },
  };
}

const tick = async () => {
  for (let i = 0; i < 5; i++) await Promise.resolve();
};

describe('EventAnimator', () => {
  it('shows the first view without animating', () => {
    const fake = fakeRenderer();
    const animator = new EventAnimator(fake.renderer);
    animator.push(battle(5), [ev(1), ev(2), ev(3)]);
    expect(fake.log).toEqual(['set:5']);
    expect(animator.shownSeq()).toBe(3);
    expect(animator.busy()).toBe(false);
  });

  it('plays new events in seq order and locks input until the queue drains', async () => {
    const fake = fakeRenderer();
    const animator = new EventAnimator(fake.renderer);
    animator.push(battle(5), [ev(1)]);
    animator.push(battle(4), [ev(1), ev(2), ev(3)]);
    expect(animator.busy()).toBe(true);
    // a snapshot arriving mid-queue appends, it doesn't restart
    animator.push(battle(3), [ev(1), ev(2), ev(3), ev(4)]);
    for (let i = 0; i < 3; i++) {
      await tick();
      expect(animator.busy()).toBe(true);
      fake.release();
    }
    await tick();
    expect(fake.log).toEqual(['set:5', 'play:2', 'play:3', 'play:4', 'set:3']);
    expect(animator.busy()).toBe(false);
    expect(animator.shownSeq()).toBe(4);
  });

  it('skips the animation after a gap and syncs hard', () => {
    const fake = fakeRenderer();
    const animator = new EventAnimator(fake.renderer);
    animator.push(battle(5), [ev(1), ev(2)]);
    // seq 3 never arrived (a reconnect): jump straight to the state
    animator.push(battle(2), [ev(4), ev(5), ev(6)]);
    expect(fake.log).toEqual(['set:5', 'set:2']);
    expect(animator.busy()).toBe(false);
    expect(animator.shownSeq()).toBe(6);
  });

  it('skips the animation while the tab is hidden', () => {
    const fake = fakeRenderer();
    let hidden = false;
    const animator = new EventAnimator(fake.renderer, { hidden: () => hidden });
    animator.push(battle(5), [ev(1)]);
    hidden = true;
    animator.push(battle(4), [ev(1), ev(2)]);
    expect(fake.log).toEqual(['set:5', 'set:4']);
  });

  it('keeps the log behind the animation', async () => {
    const fake = fakeRenderer();
    const animator = new EventAnimator(fake.renderer);
    animator.push(battle(5), [ev(1)]);
    animator.push(battle(4), [ev(1), ev(2), ev(3)]);
    await tick();
    expect(animator.shownSeq()).toBe(1);
    fake.release();
    await tick();
    expect(animator.shownSeq()).toBe(2);
    await fake.flush();
    await tick();
    expect(animator.shownSeq()).toBe(3);
  });
});
