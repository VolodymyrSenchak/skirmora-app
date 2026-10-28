import { computed, DestroyRef, DOCUMENT, effect, inject, Injectable, signal, untracked } from '@angular/core';
import { Subscription } from 'rxjs';
import { APP_CONFIG } from '../core/api.config';
import { SessionApiService } from '../core/session-api.service';
import { GameAction, GameSession, TerminalReason } from '../models';
import { PollingTransport } from './polling.transport';
import { SessionStore } from './session.store';
import { ActionResult, ConnectionState } from './session.transport';
import { Handover, SessionConnection } from './session-connection';
import { SocketTransport } from './socket.transport';
import { VisibilityService } from './visibility.service';

/** Three failed connects in a row and the socket has lost the argument. */
const FAILURES_BEFORE_POLLING = 3;
/** While polling, try the socket again this often. */
const SOCKET_RETRY_MS = 60_000;
/** A tab can be hidden this long before we stop holding a socket open. */
const HIDDEN_GRACE_MS = 60_000;

/**
 * Owns one socket transport and one polling transport and decides which is active.
 * The rules are API plan section 9.3; the server is built around them.
 */
@Injectable()
export class TransportManager extends SessionConnection {
  readonly local = false;
  /** Online every player has their own phone: no curtain. */
  readonly handover = signal<Handover | null>(null).asReadonly();
  private readonly config = inject(APP_CONFIG);
  private readonly api = inject(SessionApiService);
  private readonly store = inject(SessionStore);
  private readonly visibility = inject(VisibilityService);
  private readonly doc = inject(DOCUMENT);

  /** Held in a signal so the socket's own state can be read through `computed`, not mirrored. */
  private readonly socket = signal<SocketTransport | null>(null);
  private polling: PollingTransport | null = null;
  private subscriptions = new Subscription();
  private socketRetry: ReturnType<typeof setInterval> | null = null;
  private hiddenTimer: ReturnType<typeof setTimeout> | null = null;
  private removeWake: (() => void) | null = null;

  private readonly _terminal = signal<TerminalReason | null>(null);
  private readonly _pollingActive = signal(false);

  private readonly socketState = computed<ConnectionState>(() => this.socket()?.state() ?? 'closed');
  private readonly socketFailures = computed(() => this.socket()?.failures() ?? 0);
  private readonly socketIdle = computed(() => this.socket()?.idle() ?? false);

  readonly terminal = this._terminal.asReadonly();

  /** What the connection banner reads. `degraded` is polling, `connecting` is reconnecting. */
  readonly connection = computed<ConnectionState>(() => {
    if (this._terminal()) {
      return 'closed';
    }
    if (this.socketState() === 'live') {
      return 'live';
    }
    return this._pollingActive() ? 'degraded' : this.socketState();
  });

  constructor() {
    super();
    // three strikes and we move to HTTP; the socket keeps trying in the background
    effect(() => {
      if (this.socketFailures() >= FAILURES_BEFORE_POLLING) {
        untracked(() => this.startPolling());
      }
    });

    // socket back on its feet: stop paying for HTTP
    effect(() => {
      if (this.socketState() === 'live') {
        untracked(() => this.stopPolling());
      }
    });

    // hidden > 60 s and we let the socket go; visible again and we wake it at once
    effect(() => {
      const visible = this.visibility.visible();
      untracked(() => (visible ? this.onVisible() : this.onHidden()));
    });

    inject(DestroyRef).onDestroy(() => this.stop());
  }

  start(code: string, playerToken: string): void {
    this.stop();
    this._terminal.set(null);

    const socket = new SocketTransport({ apiUrl: this.config.apiUrl, code, playerToken });
    this.subscriptions.add(socket.snapshots.subscribe((view) => this.store.apply(view)));
    this.subscriptions.add(socket.terminal.subscribe((reason) => this.onTerminal(reason)));

    const polling = new PollingTransport({
      api: this.api,
      code,
      isHidden: () => !this.visibility.visible(),
    });
    this.polling = polling;
    this.subscriptions.add(polling.snapshots.subscribe((view: GameSession) => this.store.apply(view)));
    this.subscriptions.add(polling.terminal.subscribe((reason) => this.onTerminal(reason)));

    this.socket.set(socket);
    socket.connect();
    this.listenForWake();
  }

  confirmHandover(): void {
    /* hot-seat only */
  }

  stop(): void {
    this.subscriptions.unsubscribe();
    this.subscriptions = new Subscription();
    this.socket()?.close();
    this.socket.set(null);
    this.polling?.close();
    this.polling = null;
    this._pollingActive.set(false);
    this.clearSocketRetry();
    this.clearHiddenTimer();
    this.removeWake?.();
    this.removeWake = null;
  }

  /**
   * Socket when it is live, HTTP otherwise, including after a timed-out ack, because a timeout
   * is not an answer. Both paths return the post-action view, so the actor sees the result
   * without waiting for the push.
   */
  async dispatch(action: GameAction): Promise<ActionResult> {
    const socket = this.socket();
    if (socket && this.socketState() === 'live') {
      const result = await socket.dispatch(action);
      if (result.ok) {
        this.store.apply(result.session);
        return result;
      }
      if (result.error.code !== 'internal-server-error') {
        return result;
      }
      // the socket could not deliver a verdict; ask over HTTP instead
    }
    if (!this.polling) {
      return { ok: false, error: { code: 'internal-server-error', message: 'Not connected' } };
    }
    const result = await this.polling.dispatch(action);
    if (result.ok) {
      this.store.apply(result.session);
    }
    return result;
  }

  private onTerminal(reason: TerminalReason): void {
    this._terminal.set(reason);
    this.stop();
  }

  private startPolling(): void {
    if (this._pollingActive() || !this.polling) {
      return;
    }
    this._pollingActive.set(true);
    this.polling.connect();
    this.socketRetry ??= setInterval(() => this.socket()?.wake(), SOCKET_RETRY_MS);
  }

  private stopPolling(): void {
    if (!this._pollingActive()) {
      return;
    }
    this._pollingActive.set(false);
    this.polling?.close();
    this.clearSocketRetry();
  }

  private onHidden(): void {
    if (this.hiddenTimer !== null || !this.socket()) {
      return;
    }
    this.hiddenTimer = setTimeout(() => {
      this.hiddenTimer = null;
      this.socket()?.sleep();
    }, HIDDEN_GRACE_MS);
  }

  private onVisible(): void {
    this.clearHiddenTimer();
    this.socket()?.wake();
  }

  /**
   * `session:idle` means the server hung up on a quiet room. Coming back is the player's move,
   * not a timer's, so we wait for a real touch.
   */
  private listenForWake(): void {
    if (this.removeWake) {
      return;
    }
    const onInteraction = () => {
      if (this.socketIdle()) {
        this.socket()?.wake();
      }
    };
    this.doc.addEventListener('pointerdown', onInteraction, { passive: true });
    this.doc.addEventListener('keydown', onInteraction);
    this.removeWake = () => {
      this.doc.removeEventListener('pointerdown', onInteraction);
      this.doc.removeEventListener('keydown', onInteraction);
    };
  }

  private clearSocketRetry(): void {
    if (this.socketRetry !== null) {
      clearInterval(this.socketRetry);
      this.socketRetry = null;
    }
  }

  private clearHiddenTimer(): void {
    if (this.hiddenTimer !== null) {
      clearTimeout(this.hiddenTimer);
      this.hiddenTimer = null;
    }
  }
}
