import { signal } from '@angular/core';
import type { BattleView, GameEvent } from '../models';
import type { BattleRenderer } from './battle-renderer';

export interface AnimatorOptions {
  /** Tab hidden: skip straight to the state (plan §9). */
  hidden?: () => boolean;
}

/**
 * Sits between the store and the scene (plan §9). The store always holds the newest snapshot; the
 * scene shows the state as of the last animated event until the queue drains, then a hard
 * `setStacks` corrects any drift.
 */
export class EventAnimator {
  private readonly _busy = signal(false);
  private readonly _shownSeq = signal(0);
  /** Every event up to here is queued or played. */
  private animatedSeq = 0;
  private started = false;
  private queue: GameEvent[] = [];
  private latest: BattleView | null = null;
  private running = false;
  private stopped = false;

  /** Input is locked and hints hidden while true. */
  readonly busy = this._busy.asReadonly();
  /** The last event the screen has shown: the log stops here. */
  readonly shownSeq = this._shownSeq.asReadonly();

  constructor(
    private readonly renderer: Pick<BattleRenderer, 'setStacks' | 'play'>,
    private readonly options: AnimatorOptions = {},
  ) {}

  /** Every new view of the battle. `events` are the view's last 64. */
  push(battle: BattleView, events: readonly GameEvent[]): void {
    if (this.stopped) return;
    this.latest = battle;
    const lastSeq = events.length ? events[events.length - 1].seq : this.animatedSeq;
    const fresh = events.filter((event) => event.seq > this.animatedSeq);

    if (!this.started || (fresh.length && (fresh[0].seq > this.animatedSeq + 1 || this.options.hidden?.()))) {
      // first load, a gap after a reconnect, or a hidden tab: no animation, just the state
      this.started = true;
      this.queue = [];
      this.animatedSeq = lastSeq;
      this._shownSeq.set(lastSeq);
      if (!this.running) this.renderer.setStacks(battle.stacks, battle.walls);
      return;
    }
    if (!fresh.length) {
      if (!this.running) this.renderer.setStacks(battle.stacks, battle.walls);
      return;
    }
    this.queue.push(...fresh);
    this.animatedSeq = fresh[fresh.length - 1].seq;
    if (!this.running) void this.run();
  }

  /** Drops the queue and shows the newest state (the tab came back, say). */
  flush(): void {
    this.queue = [];
    this._shownSeq.set(this.animatedSeq);
    if (this.latest && !this.running) this.renderer.setStacks(this.latest.stacks, this.latest.walls);
  }

  stop(): void {
    this.stopped = true;
    this.queue = [];
  }

  private async run(): Promise<void> {
    this.running = true;
    this._busy.set(true);
    try {
      while (this.queue.length && !this.stopped) {
        const event = this.queue.shift()!;
        try {
          await this.renderer.play(event);
        } catch (error) {
          console.error('EventAnimator: animation failed', event, error);
        }
        this._shownSeq.set(Math.max(this._shownSeq(), event.seq));
      }
    } finally {
      this.running = false;
      if (!this.stopped) {
        // the hard sync point
        if (this.latest) this.renderer.setStacks(this.latest.stacks, this.latest.walls);
        this._shownSeq.set(this.animatedSeq);
        this._busy.set(false);
      }
    }
  }
}
