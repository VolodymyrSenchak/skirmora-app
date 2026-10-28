import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { APP_CONFIG } from '../core/api.config';
import { SessionApiService } from '../core/session-api.service';
import { GameSession } from '../models';
import { SessionStore } from './session.store';
import { TransportManager } from './transport.manager';
import { VisibilityService } from './visibility.service';

/** A stand-in for the socket.io client: tests fire its handlers by hand. */
class FakeSocket {
  readonly handlers = new Map<string, (payload?: unknown) => void>();
  readonly io = { opts: { reconnection: true } };
  connected = false;
  connectCalls = 0;
  disconnectCalls = 0;

  on(event: string, handler: (payload?: unknown) => void): this {
    this.handlers.set(event, handler);
    return this;
  }

  connect(): this {
    this.connectCalls++;
    return this;
  }

  disconnect(): this {
    this.disconnectCalls++;
    this.connected = false;
    return this;
  }

  removeAllListeners(): this {
    this.handlers.clear();
    return this;
  }

  timeout(): this {
    return this;
  }

  emitWithAck(): Promise<unknown> {
    return Promise.resolve({ ok: true, session: snapshot() });
  }

  fire(event: string, payload?: unknown): void {
    this.handlers.get(event)?.(payload);
  }

  /** What the server does on a successful handshake: connect, then push state. */
  goLive(): void {
    this.connected = true;
    this.fire('connect');
  }
}

let socket: FakeSocket;

vi.mock('socket.io-client', () => ({
  io: () => socket,
}));

function snapshot(version = 1): GameSession {
  return {
    code: '042137',
    status: 'pending',
    version,
    createdAt: '2026-01-01T20:00:00.000Z',
    expiresAt: '2026-01-02T20:00:00.000Z',
    hostPlayerId: 'p1',
    me: { playerId: 'p1', nickname: 'Vova', isHost: true },
    players: [],
    settings: { maxPlayers: 4, allowJoinInProgress: false, mapId: 'arena', budget: 1000, mode: 'ffa', turnSeconds: 45, dataVersion: '2026.11.0' },
    poll: { intervalMs: 3000 },
    game: null,
  };
}

const visible = signal(true);

function setup(api: Partial<SessionApiService> = {}) {
  visible.set(true);
  TestBed.configureTestingModule({
    providers: [
      SessionStore,
      TransportManager,
      { provide: APP_CONFIG, useValue: { apiUrl: 'http://localhost:8080' } },
      { provide: VisibilityService, useValue: { visible } },
      {
        provide: SessionApiService,
        useValue: {
          getState: () => of(snapshot(2)),
          postAction: () => of(snapshot(3)),
          ...api,
        },
      },
    ],
  });
  return {
    manager: TestBed.inject(TransportManager),
    store: TestBed.inject(SessionStore),
  };
}

describe('TransportManager', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    socket = new FakeSocket();
  });

  afterEach(() => {
    vi.useRealTimers();
    TestBed.resetTestingModule();
  });

  it('starts on the socket and takes the pushed snapshot as the initial load', () => {
    const { manager, store } = setup();
    manager.start('042137', 'token');
    expect(manager.connection()).toBe('connecting');

    socket.goLive();
    socket.fire('session:state', snapshot(4));
    TestBed.tick();

    expect(manager.connection()).toBe('live');
    expect(store.view()?.version).toBe(4);
  });

  it('falls back to polling after three failed connects, and stops again when the socket recovers', async () => {
    const getState = vi.fn(() => of(snapshot(2)));
    const { manager } = setup({ getState });
    manager.start('042137', 'token');

    socket.fire('connect_error', new Error('no'));
    socket.fire('connect_error', new Error('no'));
    TestBed.tick();
    expect(getState).not.toHaveBeenCalled();

    socket.fire('connect_error', new Error('no'));
    TestBed.tick();
    await vi.advanceTimersByTimeAsync(0);
    expect(getState).toHaveBeenCalled();
    expect(manager.connection()).toBe('degraded');

    const callsWhileDegraded = getState.mock.calls.length;
    socket.goLive();
    TestBed.tick();
    expect(manager.connection()).toBe('live');

    await vi.advanceTimersByTimeAsync(10_000);
    expect(getState.mock.calls.length).toBe(callsWhileDegraded);
  });

  it('ends everything on a terminal connect_error', () => {
    const { manager } = setup();
    manager.start('042137', 'token');

    socket.fire('connect_error', Object.assign(new Error('gone'), { data: { code: 'kicked' } }));
    TestBed.tick();

    expect(manager.terminal()).toBe('kicked');
    expect(manager.connection()).toBe('closed');
  });

  it('ends everything on session:expired', () => {
    const { manager } = setup();
    manager.start('042137', 'token');
    socket.goLive();

    socket.fire('session:expired', { expiresAt: '2026-01-02T20:00:00.000Z' });
    TestBed.tick();

    expect(manager.terminal()).toBe('expired');
  });

  it('maps player:removed reasons straight through', () => {
    const { manager } = setup();
    manager.start('042137', 'token');
    socket.goLive();

    socket.fire('player:removed', { reason: 'replaced' });
    TestBed.tick();

    expect(manager.terminal()).toBe('replaced');
  });

  it('lets the socket go once the tab has been hidden for a minute', async () => {
    const { manager } = setup();
    manager.start('042137', 'token');
    socket.goLive();
    TestBed.tick();

    visible.set(false);
    TestBed.tick();
    await vi.advanceTimersByTimeAsync(59_000);
    expect(socket.disconnectCalls).toBe(0);

    await vi.advanceTimersByTimeAsync(2000);
    expect(socket.disconnectCalls).toBe(1);

    const before = socket.connectCalls;
    visible.set(true);
    TestBed.tick();
    expect(socket.connectCalls).toBe(before + 1);
  });

  it('does not reconnect on a timer after session:idle', async () => {
    const { manager } = setup();
    manager.start('042137', 'token');
    socket.goLive();
    TestBed.tick();

    socket.fire('session:idle', {});
    TestBed.tick();
    const afterIdle = socket.connectCalls;

    await vi.advanceTimersByTimeAsync(120_000);
    expect(socket.connectCalls).toBe(afterIdle);

    // a real touch is what brings it back
    document.dispatchEvent(new Event('pointerdown'));
    TestBed.tick();
    expect(socket.connectCalls).toBe(afterIdle + 1);
  });

  it('dispatches over HTTP while the socket is down and applies the returned view', async () => {
    const postAction = vi.fn(() => of(snapshot(9)));
    const { manager, store } = setup({ postAction });
    manager.start('042137', 'token');

    const result = await manager.dispatch({ type: 'lobby.start', payload: {} });

    expect(postAction).toHaveBeenCalled();
    expect(result.ok).toBe(true);
    expect(store.view()?.version).toBe(9);
  });

  it('turns a 410 on the polling path into a terminal', async () => {
    const postAction = vi.fn(() =>
      throwError(() => ({ code: 'gone', message: 'This room is over' })),
    );
    const { manager } = setup({ postAction });
    manager.start('042137', 'token');

    const result = await manager.dispatch({ type: 'lobby.start', payload: {} });

    expect(result.ok).toBe(false);
    expect(manager.terminal()).toBe('expired');
  });
});
