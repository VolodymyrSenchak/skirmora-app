import { Injectable } from '@angular/core';

export interface PlayerIdentity {
  code: string;
  playerId: string;
  playerToken: string;
  nickname: string;
}

const PREFIX = 'pocket-legions:player:';
const LAST_NICKNAME = 'pocket-legions:nickname';

/**
 * The token is the whole identity: no accounts, no refresh, no reclaim.
 * Stored under one key per code so two rooms in two tabs do not fight.
 */
@Injectable({ providedIn: 'root' })
export class IdentityService {
  get(code: string): PlayerIdentity | null {
    const raw = read(PREFIX + normalise(code));
    if (!raw) {
      return null;
    }
    try {
      const parsed = JSON.parse(raw) as PlayerIdentity;
      return parsed.playerToken && parsed.playerId ? parsed : null;
    } catch {
      return null;
    }
  }

  save(identity: PlayerIdentity): void {
    const code = normalise(identity.code);
    write(PREFIX + code, JSON.stringify({ ...identity, code }));
    write(LAST_NICKNAME, identity.nickname);
  }

  clear(code: string): void {
    remove(PREFIX + normalise(code));
  }

  /** Prefills the nickname field the next time this person joins anything. */
  lastNickname(): string {
    return read(LAST_NICKNAME) ?? '';
  }
}

function normalise(code: string): string {
  return code.trim();
}

/* localStorage throws in private mode and in some embedded webviews — never let that kill a screen. */
function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* the player keeps playing; they just lose the room on reload */
  }
}

function remove(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}
