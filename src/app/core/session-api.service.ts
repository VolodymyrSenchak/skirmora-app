import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import {
  CreateSessionBody,
  GameAction,
  GameEvent,
  GameSession,
  JoinSessionBody,
  PlayerSessionResult,
  SessionInfo,
} from '../models';
import { APP_CONFIG } from './api.config';

/** The only place that knows the API's URLs. Components never inject HttpClient. */
@Injectable({ providedIn: 'root' })
export class SessionApiService {
  private readonly http = inject(HttpClient);
  private readonly base = `${inject(APP_CONFIG).apiUrl}/api/sessions`;

  create(body: CreateSessionBody): Observable<PlayerSessionResult> {
    return this.http.post<PlayerSessionResult>(this.base, body);
  }

  info(code: string): Observable<SessionInfo> {
    return this.http.get<SessionInfo>(`${this.base}/${encodeURIComponent(code)}/info`);
  }

  join(code: string, body: JoinSessionBody): Observable<PlayerSessionResult> {
    return this.http.post<PlayerSessionResult>(`${this.base}/${encodeURIComponent(code)}/join`, body);
  }

  /**
   * The API sets `ETag` + `Cache-Control: private, no-cache`, so the browser revalidates and
   * turns any 304 back into a 200 from cache before we see it. Do not send `If-None-Match` here.
   */
  getState(code: string): Observable<GameSession> {
    return this.http.get<GameSession>(`${this.base}/${encodeURIComponent(code)}/state`);
  }

  postAction(code: string, action: GameAction): Observable<GameSession> {
    return this.http.post<GameSession>(`${this.base}/${encodeURIComponent(code)}/actions`, action);
  }

  getHistory(code: string): Observable<GameEvent[]> {
    return this.http.get<GameEvent[]>(`${this.base}/${encodeURIComponent(code)}/history`);
  }
}
