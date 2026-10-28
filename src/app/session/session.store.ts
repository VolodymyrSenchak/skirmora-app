import { computed, Injectable, signal } from '@angular/core';
import { DATA_VERSION } from '../engine/engine/version';
import { GameSession, SessionPlayerView } from '../models';

/**
 * One signal holds the server's view; everything else is `computed` (SA §4).
 *
 * Nothing here derives game rules. Whether a stack can act is `hints.stacks`, not "is it my
 * turn and has it acted" — the server (or the local engine in hot-seat) already decided that.
 */
@Injectable()
export class SessionStore {
  private readonly _view = signal<GameSession | null>(null);

  readonly view = this._view.asReadonly();
  readonly code = computed(() => this._view()?.code ?? null);
  readonly status = computed(() => this._view()?.status ?? null);
  readonly me = computed(() => this._view()?.me ?? null);
  readonly players = computed<SessionPlayerView[]>(() => this._view()?.players ?? []);
  readonly isHost = computed(() => this._view()?.me.isHost ?? false);
  readonly settings = computed(() => this._view()?.settings ?? null);
  readonly game = computed(() => this._view()?.game ?? null);
  /** 'army' | 'deploy' | 'battle' | 'over' */
  readonly phase = computed(() => this.game()?.phase ?? null);
  readonly battle = computed(() => this.game()?.battle ?? null);
  readonly mySeat = computed(() => {
    const me = this.me();
    return this.game()?.seats.find((seat) => seat.playerId === me?.playerId) ?? null;
  });
  readonly myTurn = computed(() => {
    const battle = this.battle();
    const seat = this.mySeat();
    return !!battle && !!seat && battle.activeSeat === seat.seat && !this.game()?.result;
  });
  /** Non-null only on my turn. */
  readonly hints = computed(() => this.game()?.hints ?? null);
  readonly pollIntervalMs = computed(() => this._view()?.poll.intervalMs ?? 3000);
  /** The room was made with other game data than this build has: reload before acting (plan §4). */
  readonly outdated = computed(() => {
    const version = this.settings()?.dataVersion;
    return !!version && version !== DATA_VERSION;
  });

  /** Ids on the wire, names on the screen. */
  private readonly byId = computed(() => new Map(this.players().map((player) => [player.id, player])));

  /** A player who left mid-game is gone from `players` but still owns a seat. */
  readonly nicknameOf = computed(() => {
    const players = this.byId();
    return (playerId: string | null | undefined): string =>
      !playerId ? '' : (players.get(playerId)?.nickname ?? '(вийшов)');
  });

  /** Seat number → nickname. */
  readonly seatName = computed(() => {
    const seats = this.game()?.seats ?? [];
    const nickname = this.nicknameOf();
    return (seat: number | null | undefined): string => {
      const owner = seats.find((candidate) => candidate.seat === seat);
      return owner ? nickname(owner.playerId) : '';
    };
  });

  /**
   * Version guard: never go backwards. The comparison is `<`, not `<=` — presence updates
   * deliberately do not bump `version`, so an online/offline change arrives as a new snapshot
   * at the same version. Dropping equal versions would freeze the presence dots.
   */
  apply(next: GameSession): void {
    const current = this._view();
    if (current && next.version < current.version) {
      return;
    }
    // Replace, never merge: the snapshot is already projected for this viewer.
    this._view.set(next);
  }

  reset(): void {
    this._view.set(null);
  }
}
