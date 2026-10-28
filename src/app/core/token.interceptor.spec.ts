import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { APP_CONFIG } from './api.config';
import { IdentityService } from './identity.service';
import { tokenInterceptor } from './token.interceptor';

const API = 'http://localhost:8080';

describe('tokenInterceptor', () => {
  let http: HttpClient;
  let backend: HttpTestingController;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([tokenInterceptor])),
        provideHttpClientTesting(),
        { provide: APP_CONFIG, useValue: { apiUrl: API } },
      ],
    });
    TestBed.inject(IdentityService).save({
      code: '042137',
      playerId: 'p1',
      playerToken: 'secret-token',
      nickname: 'Vova',
    });
    http = TestBed.inject(HttpClient);
    backend = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    backend.verify();
    TestBed.resetTestingModule();
  });

  function headerFor(url: string): string | null {
    http.get(url).subscribe({ next: () => undefined, error: () => undefined });
    const request = backend.expectOne(url);
    const token = request.request.headers.get('X-Player-Token');
    request.flush({});
    return token;
  }

  it('sends the token on state, actions and history', () => {
    expect(headerFor(`${API}/api/sessions/042137/state`)).toBe('secret-token');
    expect(headerFor(`${API}/api/sessions/042137/actions`)).toBe('secret-token');
    expect(headerFor(`${API}/api/sessions/042137/history`)).toBe('secret-token');
  });

  it('never sends it on create, info or join', () => {
    expect(headerFor(`${API}/api/sessions`)).toBeNull();
    expect(headerFor(`${API}/api/sessions/042137/info`)).toBeNull();
    expect(headerFor(`${API}/api/sessions/042137/join`)).toBeNull();
  });

  it('never sends it to another origin', () => {
    expect(headerFor('https://example.com/api/sessions/042137/state')).toBeNull();
  });

  it('uses the token stored for the code in the URL, not some other room', () => {
    expect(headerFor(`${API}/api/sessions/999999/state`)).toBeNull();
  });
});
