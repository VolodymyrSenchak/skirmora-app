import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { APP_CONFIG } from './api.config';
import { IdentityService } from './identity.service';

/** `/api/sessions/:code/{state,actions,history}` — the only endpoints that take a player token. */
const PLAYER_ENDPOINT = /\/api\/sessions\/([^/?#]+)\/(state|actions|history)(?:[/?#]|$)/;

/**
 * Adds `X-Player-Token`, scoped by URL and origin. Never on create / info / join,
 * and never to anything that is not the API.
 */
export const tokenInterceptor: HttpInterceptorFn = (req, next) => {
  const { apiUrl } = inject(APP_CONFIG);
  if (!req.url.startsWith(apiUrl)) {
    return next(req);
  }
  const match = PLAYER_ENDPOINT.exec(req.url);
  if (!match) {
    return next(req);
  }
  const identity = inject(IdentityService).get(decodeURIComponent(match[1]));
  if (!identity) {
    return next(req);
  }
  return next(req.clone({ setHeaders: { 'X-Player-Token': identity.playerToken } }));
};
