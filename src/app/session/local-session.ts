import { DestroyRef, inject, Injectable, signal } from '@angular/core';
import { Subscription } from 'rxjs';
import { getMap } from '../engine/engine/grid';
import { GameAction, PocketLegionsView, TerminalReason } from '../models';
import { PocketLegions } from './actions';
import { LocalTransport } from './local.transport';
import { autoDeployFor, presetArmy } from './local-presets';
import { Handover, SessionConnection } from './session-connection';
import { ActionResult, ConnectionState } from './session.transport';
import { SessionStore } from './session.store';

/** The hot-seat side of `SessionConnection`: one `LocalTransport` feeding the store. */
@Injectable()
export class LocalSession extends SessionConnection {
  private readonly store = inject(SessionStore);
  private readonly _transport = signal<LocalTransport | null>(null);
  private subscription = new Subscription();
  private readonly _terminal = signal<TerminalReason | null>(null);
  private readonly noHandover = signal<Handover | null>(null);
  private readonly closed = signal<ConnectionState>('closed');

  readonly local = true;
  readonly terminal = this._terminal.asReadonly();

  get connection() {
    return this._transport()?.state ?? this.closed;
  }

  get handover() {
    return this._transport()?.handover ?? this.noHandover;
  }

  get timerEnabled(): boolean {
    return this._transport()?.timerEnabled ?? false;
  }

  constructor() {
    super();
    inject(DestroyRef).onDestroy(() => this.stop());
  }

  start(transport: LocalTransport): void {
    this.stop();
    this.store.reset();
    this._transport.set(transport);
    this.subscription.add(transport.snapshots.subscribe((view) => this.store.apply(view)));
    this.subscription.add(transport.terminal.subscribe((reason) => this._terminal.set(reason)));
    transport.connect();
  }

  stop(): void {
    this.subscription.unsubscribe();
    this.subscription = new Subscription();
    this._transport()?.close();
  }

  dispatch(action: GameAction): Promise<ActionResult> {
    const transport = this._transport();
    if (!transport) return Promise.resolve({ ok: false, error: { code: 'internal-server-error', message: 'No game' } });
    return transport.dispatch(action);
  }

  confirmHandover(): void {
    this._transport()?.confirmHandover();
  }

  /**
   * Phase 1 "quick battle": every seat gets a ready-made army of its race and an automatic
   * deployment, straight into the battle. Drives the real actions, so the engine checks it all.
   */
  quickStart(races: Parameters<typeof presetArmy>[0][]): void {
    const transport = this._transport();
    if (!transport) return;
    for (let guard = 0; guard < 32; guard++) {
      transport.confirmHandover();
      const game: PocketLegionsView = transport.view().game!;
      const seat = game.mySeat ?? 0;
      if (game.phase === 'army') {
        const raceId = races[seat % races.length];
        if (game.seats[seat]?.raceId !== raceId) transport.dispatchSync(PocketLegions.pickRace(raceId));
        const settings = transport.snapshot.settings;
        transport.dispatchSync(
          PocketLegions.submitArmy(presetArmy(raceId, settings.budget, getMap(game.mapId).size, game.seats.length)),
        );
      } else if (game.phase === 'deploy') {
        transport.dispatchSync(PocketLegions.submitDeploy(autoDeployFor(game)));
      } else {
        break;
      }
    }
    transport.confirmHandover();
  }
}

