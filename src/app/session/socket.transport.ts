import { signal } from '@angular/core';
import { io, Socket } from 'socket.io-client';
import { Subject } from 'rxjs';
import { GameAction, GameSession, TerminalReason } from '../models';
import { toApiError } from '../core/api-error';
import { ActionResult, ConnectionState, SessionTransport, terminalFor } from './session.transport';

const ACK_TIMEOUT_MS = 5000;

export interface SocketTransportOptions {
  apiUrl: string;
  code: string;
  playerToken: string;
}

/**
 * Socket.IO over the websocket transport only — the polling transport is not available on
 * Vercel and the server does not offer it either.
 */
export class SocketTransport implements SessionTransport {
  private readonly _state = signal<ConnectionState>('closed');
  private readonly _snapshots = new Subject<GameSession>();
  private readonly _terminal = new Subject<TerminalReason>();
  private readonly _failures = signal(0);
  /** The server disconnected us for being quiet (20 min). Reconnect on interaction, not on a timer. */
  private readonly _idle = signal(false);

  readonly state = this._state.asReadonly();
  readonly snapshots = this._snapshots.asObservable();
  readonly terminal = this._terminal.asObservable();
  /** Consecutive failed connects. Three of them and the manager moves to polling. */
  readonly failures = this._failures.asReadonly();
  readonly idle = this._idle.asReadonly();

  private socket: Socket | null = null;

  constructor(private readonly options: SocketTransportOptions) {}

  connect(): void {
    if (this.socket) {
      if (!this.socket.connected) {
        this._state.set('connecting');
        this.socket.connect();
      }
      return;
    }

    this._state.set('connecting');
    const socket = io(this.options.apiUrl, {
      path: '/socket.io',
      transports: ['websocket'],
      auth: { code: this.options.code, playerToken: this.options.playerToken },
      autoConnect: true,
      // the server closes every ~300 s by design; let socket.io walk back in on its own
      reconnection: true,
      reconnectionDelay: 500,
      reconnectionDelayMax: 5000,
    });
    this.socket = socket;

    socket.on('connect', () => {
      this._failures.set(0);
      this._idle.set(false);
      this._state.set('live');
      // no initial GET needed: the server pushes `session:state` right after the handshake
    });

    socket.on('disconnect', () => {
      if (this._state() !== 'closed') {
        this._state.set('connecting');
      }
    });

    socket.on('connect_error', (error: Error & { data?: { code?: string } }) => {
      const reason = error.data?.code ? terminalFor(error.data.code) : null;
      if (reason) {
        this.emitTerminal(reason);
        return;
      }
      this._failures.update((count) => count + 1);
      this._state.set('connecting');
    });

    socket.on('session:state', (view) => this._snapshots.next(view as GameSession));
    socket.on('session:expired', () => this.emitTerminal('expired'));
    socket.on('player:removed', (payload: { reason: string }) => {
      this.emitTerminal(terminalFor(payload?.reason) ?? 'left');
    });
    socket.on('session:idle', () => {
      this._idle.set(true);
      socket.io.opts.reconnection = false;
      socket.disconnect();
      this._state.set('degraded');
    });
  }

  /** Called on a real user interaction or on the tab becoming visible — never on a timer. */
  wake(): void {
    if (!this.socket) {
      this.connect();
      return;
    }
    if (this._idle()) {
      this._idle.set(false);
      this.socket.io.opts.reconnection = true;
    }
    if (!this.socket.connected) {
      this._state.set('connecting');
      this.socket.connect();
    }
  }

  /** Tab hidden > 60 s. The session stays alive server-side; we just stop holding a socket open. */
  sleep(): void {
    if (this.socket?.connected) {
      this.socket.disconnect();
    }
    this._state.set('degraded');
  }

  async dispatch(action: GameAction): Promise<ActionResult> {
    const socket = this.socket;
    if (!socket?.connected) {
      return { ok: false, error: { code: 'internal-server-error', message: 'Not connected' } };
    }
    try {
      const ack = await socket
        .timeout(ACK_TIMEOUT_MS)
        .emitWithAck('action', { type: action.type, payload: action.payload });
      return ack as ActionResult;
    } catch (error) {
      // a timed-out ack is not a verdict — the caller retries over HTTP
      return { ok: false, error: toApiError(error) };
    }
  }

  close(): void {
    this._state.set('closed');
    this.socket?.removeAllListeners();
    this.socket?.disconnect();
    this.socket = null;
  }

  private emitTerminal(reason: TerminalReason): void {
    this._terminal.next(reason);
    this.close();
  }
}
