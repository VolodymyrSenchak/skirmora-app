/**
 * The session envelope, from the synced `models/session.model.ts` (plan §4). Skirmora is
 * the only game the API serves, so there is no `gameType` and the game view is typed.
 */
import type {
  CoreSettings,
  SessionInfo as CoreSessionInfo,
  SessionPlayerView,
  SessionStatus,
  SessionView,
} from '../engine/models/session.model';
import type { ErrorCode as EngineErrorCode } from '../engine/models/result';
import type { GameMode, MapId, SkirmoraSettings, SkirmoraView } from './skirmora.model';

export type { SessionPlayerView, SessionStatus };

/** `settings` of a room: the core part plus the game's (contract §1). */
export type RoomSettings = CoreSettings & SkirmoraSettings;

/** What the store holds: the API's `SessionView` with the settings and game typed. */
export interface GameSession extends Omit<SessionView<SkirmoraView>, 'settings'> {
  settings: RoomSettings;
}

/** `GET /info`, with the game's public fields. */
export interface SessionInfo extends CoreSessionInfo {
  mapId: MapId;
  mode: GameMode;
  budget: number;
}

export interface PlayerSessionResult {
  playerId: string;
  playerToken: string;
  session: GameSession;
}

/** The settings a host chooses (create, `lobby.updateSettings`). `dataVersion` is the server's. */
export type CreateSettings = Pick<RoomSettings, 'mapId' | 'budget' | 'mode' | 'turnSeconds' | 'maxPlayers'>;

export interface CreateSessionBody {
  nickname: string;
  password?: string;
  settings?: Partial<CreateSettings>;
}

export interface JoinSessionBody {
  nickname: string;
  password?: string;
}

/** Wire shape of every action: `{ type: 'lobby.start' | 'skirmora.act' | …, payload }`. */
export interface GameAction {
  type: string;
  payload: object;
}

/** Every API failure is `{ error: { code, message, reason? } }`. */
export type ErrorCode = EngineErrorCode;

export interface ApiError {
  code: ErrorCode;
  message: string;
  /** `invalid-army`, `invalid-deploy`, `illegal-action`: which rule failed (contract §2). */
  reason?: string;
}

/** Why a session screen turned into a dead end. */
export type TerminalReason =
  | 'expired'
  | 'kicked'
  | 'left'
  | 'replaced'
  | 'unauthorized'
  | 'not-found'
  | 'finished'
  | 'outdated';

/** The API's limits (models/session.schemas.ts there). */
export const NICKNAME_MAX_LENGTH = 20;
export const PASSWORD_MAX_LENGTH = 64;
