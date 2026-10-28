import { signal } from '@angular/core';
import { firstValueFrom, Subject } from 'rxjs';
import { toApiError } from '../core/api-error';
import { SessionApiService } from '../core/session-api.service';
import { GameAction, GameSession, TerminalReason } from '../models';
import { ActionResult, ConnectionState, SessionTransport, terminalFor } from './session.transport';

/** While the tab is hidden the round can wait — the server's own interval only covers foreground. */
const HIDDEN_INTERVAL_MS = 10_000;
const DEFAULT_INTERVAL_MS = 3000;

export interface PollingTransportOptions {
  api: SessionApiService;
  code: string;
  /** Read at each tick, so a backgrounded tab slows down without restarting the loop. */
  isHidden: () => boolean;
}

/**
 * The HTTP fallback. One request in flight at a time, at `view.poll.intervalMs`
 * (3000 pending / 1500 in progress / 10000 finished).
 *
 * No `If-None-Match` by hand: the API sets `ETag` + `Cache-Control: private, no-cache`, so the
 * browser revalidates and turns the 304 back into a 200 from cache before HttpClient sees it.
 */
export class PollingTransport implements SessionTransport {
  private readonly _state = signal<ConnectionState>('closed');
  private readonly _snapshots = new Subject<GameSession>();
  private readonly _terminal = new Subject<TerminalReason>();

  readonly state = this._state.asReadonly();
  readonly snapshots = this._snapshots.asObservable();
  readonly terminal = this._terminal.asObservable();

  private timer: ReturnType<typeof setTimeout> | null = null;
  private intervalMs = DEFAULT_INTERVAL_MS;
  private running = false;

  constructor(private readonly options: PollingTransportOptions) {}

  connect(): void {
    if (this.running) {
      return;
    }
    this.running = true;
    this._state.set('connecting');
    void this.tick();
  }

  close(): void {
    this.running = false;
    this._state.set('closed');
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  async dispatch(action: GameAction): Promise<ActionResult> {
    try {
      const session = await firstValueFrom(this.options.api.postAction(this.options.code, action));
      this._snapshots.next(session);
      return { ok: true, session };
    } catch (error) {
      const apiError = toApiError(error);
      const reason = terminalFor(apiError.code);
      if (reason) {
        this.emitTerminal(reason);
      }
      return { ok: false, error: apiError };
    }
  }

  private async tick(): Promise<void> {
    if (!this.running) {
      return;
    }
    try {
      const session = await firstValueFrom(this.options.api.getState(this.options.code));
      this.intervalMs = session.poll?.intervalMs ?? DEFAULT_INTERVAL_MS;
      this._state.set('degraded');
      this._snapshots.next(session);
    } catch (error) {
      const apiError = toApiError(error);
      const reason = terminalFor(apiError.code);
      if (reason) {
        this.emitTerminal(reason);
        return;
      }
      // a dropped request is not a dead session; keep the loop and keep the last snapshot
      this._state.set('connecting');
    }
    this.schedule();
  }

  private schedule(): void {
    if (!this.running) {
      return;
    }
    const delay = this.options.isHidden() ? HIDDEN_INTERVAL_MS : this.intervalMs;
    this.timer = setTimeout(() => void this.tick(), delay);
  }

  private emitTerminal(reason: TerminalReason): void {
    this._terminal.next(reason);
    this.close();
    this._terminal.complete();
  }
}
