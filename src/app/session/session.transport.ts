import { Signal } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiError, GameAction, GameSession, TerminalReason } from '../models';

export type ConnectionState = 'connecting' | 'live' | 'degraded' | 'closed';

export type ActionResult = { ok: true; session: GameSession } | { ok: false; error: ApiError };

export interface SessionTransport {
  readonly state: Signal<ConnectionState>;
  readonly snapshots: Observable<GameSession>;
  readonly terminal: Observable<TerminalReason>;
  dispatch(action: GameAction): Promise<ActionResult>;
  connect(): void;
  close(): void;
}

/** `connect_error` carries one of these in `err.data.code`; all of them end the session. */
export function terminalFor(code: string): TerminalReason | null {
  switch (code) {
    case 'not-found':
      return 'not-found';
    case 'unauthorized':
      return 'unauthorized';
    case 'kicked':
      return 'kicked';
    case 'left':
      return 'left';
    case 'replaced':
      return 'replaced';
    case 'gone':
      return 'expired';
    case 'session-finished':
      return 'finished';
    case 'outdated':
      return 'outdated';
    default:
      return null;
  }
}
