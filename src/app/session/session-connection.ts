import { Signal } from '@angular/core';
import { GameAction, TerminalReason } from '../models';
import { ActionResult, ConnectionState } from './session.transport';

/** Who the hot-seat device has to be handed to before the next private screen. */
export interface Handover {
  playerId: string;
  nickname: string;
  seat: number;
}

/**
 * What the session screens talk to. Online it is the `TransportManager`, in hot-seat the
 * `LocalSession`; the screens can't tell them apart (plan §2).
 */
export abstract class SessionConnection {
  abstract readonly connection: Signal<ConnectionState>;
  abstract readonly terminal: Signal<TerminalReason | null>;
  /** True for hot-seat: one device, no network. */
  abstract readonly local: boolean;
  /** Hot-seat only: the curtain is up until the named player taps it. */
  abstract readonly handover: Signal<Handover | null>;
  abstract dispatch(action: GameAction): Promise<ActionResult>;
  abstract confirmHandover(): void;
}
