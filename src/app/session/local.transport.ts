import { signal } from '@angular/core';
import { Subject } from 'rxjs';
import type { Rng } from '../engine/engine/rng';
import { DATA_VERSION } from '../engine/engine/version';
import { pocketLegionsModule } from '../engine/game/pocketLegions.module';
import type { PocketLegionsState } from '../engine/game/pocketLegions.state';
import type { PlayerRecord } from '../engine/models/session.model';
import { cryptoRng } from '../core/rng';
import { ApiError, CreateSettings, GameAction, GameSession, RoomSettings, TerminalReason } from '../models';
import { GAME_PREFIX } from './actions';
import type { Handover } from './session-connection';
import { ActionResult, ConnectionState, SessionTransport } from './session.transport';

export const LOCAL_CODE = 'local';
export const LOCAL_STORAGE_KEY = 'pocket-legions:local-game';

/** Everything a hot-seat game is; saved after every action so a reload resumes it (plan §6). */
export interface LocalGame {
  createdAt: string;
  version: number;
  players: PlayerRecord[];
  settings: RoomSettings;
  state: PocketLegionsState;
  /** Whose view the device shows. */
  viewerId: string;
  /** The curtain is up until `viewerId` taps it. */
  handover: boolean;
  /** Show the turn countdown (off by default in hot-seat). */
  timer: boolean;
}

export interface LocalSetup {
  nicknames: string[];
  settings: Partial<CreateSettings>;
  timer?: boolean;
}

export interface LocalDeps {
  rng?: Rng;
  now?: () => Date;
  /** `null` = don't persist (tests); default `localStorage`, guarded. */
  storage?: Storage | null;
}

/** The host acts for these in hot-seat: everyone holds the same phone. */
const HOST_ACTIONS = new Set(['rematch', 'setTeam']);

/**
 * Hot-seat is just another transport (plan §2, §6): the synced game module runs in the browser,
 * and every snapshot is `project(state, viewer)` for the seat whose turn it is. Lobby actions are
 * server-only and not synced; `create` does what the server's `lobby.start` does.
 */
export class LocalTransport implements SessionTransport {
  private readonly _state = signal<ConnectionState>('closed');
  private readonly _snapshots = new Subject<GameSession>();
  private readonly _terminal = new Subject<TerminalReason>();
  private readonly _handover = signal<Handover | null>(null);

  readonly state = this._state.asReadonly();
  readonly snapshots = this._snapshots.asObservable();
  readonly terminal = this._terminal.asObservable();
  readonly handover = this._handover.asReadonly();

  private readonly rng: Rng;
  private readonly now: () => Date;
  private readonly storage: Storage | null;

  private constructor(
    private game: LocalGame,
    deps: LocalDeps,
  ) {
    this.rng = deps.rng ?? cryptoRng;
    this.now = deps.now ?? (() => new Date());
    this.storage = deps.storage === undefined ? safeLocalStorage() : deps.storage;
    this._handover.set(this.handoverFor(game));
  }

  /** A new game: N local players, then the module's `createInitialState` (what `lobby.start` does). */
  static create(setup: LocalSetup, deps: LocalDeps = {}): { transport: LocalTransport } | { error: ApiError } {
    const now = (deps.now ?? (() => new Date()))();
    const players: PlayerRecord[] = setup.nicknames.map((nickname, i) => ({
      id: `local-${i + 1}`,
      nickname,
      tokenHash: '',
      joinedAt: new Date(now.getTime() + i).toISOString(),
      status: 'active',
    }));
    // `dataVersion` is the module's to set; the schema wants the key present
    const parsed = pocketLegionsModule.settingsSchema.safeParse({ ...setup.settings, dataVersion: DATA_VERSION });
    if (!parsed.success) return { error: { code: 'bad-request', message: parsed.error.message } };
    const settings: RoomSettings = {
      ...parsed.data,
      maxPlayers: setup.settings.maxPlayers ?? 4,
      allowJoinInProgress: false,
    };
    const initial = pocketLegionsModule.createInitialState({
      actorId: players[0].id,
      hostPlayerId: players[0].id,
      activePlayers: players,
      settings,
      status: 'in_progress',
      now,
      rng: deps.rng ?? cryptoRng,
    });
    if (!initial.isSuccess) return { error: toError(initial) };
    const game: LocalGame = {
      createdAt: now.toISOString(),
      version: 1,
      players,
      settings,
      state: initial.result!,
      viewerId: players[0].id,
      handover: true,
      timer: setup.timer ?? false,
    };
    const transport = new LocalTransport(game, deps);
    transport.save();
    return { transport };
  }

  /** The saved game, or null. */
  static restore(deps: LocalDeps = {}): LocalTransport | null {
    const storage = deps.storage === undefined ? safeLocalStorage() : deps.storage;
    const raw = read(storage);
    if (!raw) return null;
    try {
      const game = JSON.parse(raw) as LocalGame;
      return game?.state && game.players?.length ? new LocalTransport(game, deps) : null;
    } catch {
      return null;
    }
  }

  static hasSaved(storage: Storage | null = safeLocalStorage()): boolean {
    return LocalTransport.restore({ storage }) !== null;
  }

  static clearSaved(storage: Storage | null = safeLocalStorage()): void {
    try {
      storage?.removeItem(LOCAL_STORAGE_KEY);
    } catch {
      /* private mode */
    }
  }

  get timerEnabled(): boolean {
    return this.game.timer;
  }

  /** The current state, for tests and the dev tools. */
  get snapshot(): LocalGame {
    return this.game;
  }

  connect(): void {
    this._state.set('live');
    this.emit();
  }

  close(): void {
    this._state.set('closed');
  }

  /** The named player has the phone: drop the curtain. */
  confirmHandover(): void {
    if (!this.game.handover) return;
    this.game = { ...this.game, handover: false };
    this._handover.set(null);
    this.save();
    this.emit();
  }

  async dispatch(action: GameAction): Promise<ActionResult> {
    return this.dispatchSync(action);
  }

  dispatchSync(action: GameAction): ActionResult {
    if (!action.type.startsWith(GAME_PREFIX)) {
      return fail({ code: 'bad-request', message: `${action.type} is not available in hot-seat` });
    }
    const name = action.type.slice(GAME_PREFIX.length);
    const handler = Object.hasOwn(pocketLegionsModule.actions, name) ? pocketLegionsModule.actions[name] : undefined;
    if (!handler) return fail({ code: 'bad-request', message: `Unknown action ${action.type}` });
    const parsed = handler.schema.safeParse(action.payload);
    if (!parsed.success) return fail({ code: 'bad-request', message: parsed.error.message });

    const host = this.game.players[0].id;
    const actorId = HOST_ACTIONS.has(name) ? host : this.game.viewerId;
    const result = handler.handle(this.ctx(actorId), this.game.state, parsed.data);
    if (!result.isSuccess) return fail(toError(result));

    const state = result.result!.state;
    const viewerId = nextViewer(state, this.game.viewerId);
    const handover = viewerId !== this.game.viewerId ? isPrivatePhase(state) : this.game.handover;
    this.game = { ...this.game, state, version: this.game.version + 1, viewerId, handover };
    this._handover.set(this.handoverFor(this.game));
    this.save();
    const session = this.emit();
    return { ok: true, session };
  }

  /** The view the device shows now. */
  view(): GameSession {
    const { game } = this;
    const viewer = game.players.find((player) => player.id === game.viewerId) ?? game.players[0];
    const host = game.players[0].id;
    return {
      code: LOCAL_CODE,
      status: 'in_progress',
      version: game.version,
      createdAt: game.createdAt,
      expiresAt: new Date(Date.parse(game.createdAt) + 365 * 24 * 3600 * 1000).toISOString(),
      hostPlayerId: host,
      me: { playerId: viewer.id, nickname: viewer.nickname, isHost: viewer.id === host },
      players: game.players.map((player) => ({
        id: player.id,
        nickname: player.nickname,
        isHost: player.id === host,
        isOnline: true,
        joinedAt: player.joinedAt,
      })),
      settings: { ...game.settings },
      poll: { intervalMs: 0 },
      game: pocketLegionsModule.project(game.state, viewer.id, this.ctx(viewer.id)),
    };
  }

  private emit(): GameSession {
    const session = this.view();
    this._snapshots.next(session);
    return session;
  }

  private ctx(actorId: string) {
    return {
      actorId,
      hostPlayerId: this.game.players[0].id,
      activePlayers: this.game.players,
      settings: this.game.settings,
      status: 'in_progress' as const,
      now: this.now(),
      rng: this.rng,
    };
  }

  private handoverFor(game: LocalGame): Handover | null {
    if (!game.handover) return null;
    const player = game.players.find((candidate) => candidate.id === game.viewerId);
    const seat = game.state.seats.find((candidate) => candidate.playerId === game.viewerId);
    return player ? { playerId: player.id, nickname: player.nickname, seat: seat?.seat ?? 0 } : null;
  }

  private save(): void {
    if (!this.storage) return;
    try {
      this.storage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(this.game));
    } catch {
      /* private mode or full: the game goes on, a reload just loses it */
    }
  }
}

/**
 * Who holds the phone next (plan §6): army and deploy go seat by seat in seat order,
 * the battle follows the active seat, the result stays with whoever saw the end.
 */
export function nextViewer(state: PocketLegionsState, current: string): string {
  const bySeat = [...state.seats].sort((a, b) => a.seat - b.seat);
  switch (state.phase) {
    case 'army':
      return bySeat.find((seat) => !seat.armyReady)?.playerId ?? current;
    case 'deploy':
      return bySeat.find((seat) => !seat.deployReady)?.playerId ?? current;
    case 'battle':
      return bySeat.find((seat) => seat.seat === state.battle?.activeSeat)?.playerId ?? current;
    default:
      return current;
  }
}

/** Army and deployment are secret until the battle starts. */
function isPrivatePhase(state: PocketLegionsState): boolean {
  return state.phase === 'army' || state.phase === 'deploy';
}

function toError(result: { error?: string | Error; errorStatus?: string; errorCode?: string; errorReason?: string }): ApiError {
  return {
    code: (result.errorCode ?? result.errorStatus ?? 'internal-server-error') as ApiError['code'],
    message: result.error instanceof Error ? result.error.message : (result.error ?? 'Error'),
    ...(result.errorReason ? { reason: result.errorReason } : {}),
  };
}

const fail = (error: ApiError): ActionResult => ({ ok: false, error });

function safeLocalStorage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

function read(storage: Storage | null): string | null {
  try {
    return storage?.getItem(LOCAL_STORAGE_KEY) ?? null;
  } catch {
    return null;
  }
}

/** A saved game from another data version can't be played on (plan §4). */
export function isOutdated(game: LocalGame): boolean {
  return game.settings.dataVersion !== DATA_VERSION;
}
