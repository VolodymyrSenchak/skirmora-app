import { describe, expect, it } from 'vitest';
import type { GameSession, PocketLegionsView } from '../../models';
import { pickScreen } from './screen';

const view = (status: GameSession['status'], game: Partial<PocketLegionsView> | null): GameSession =>
  ({ status, game: game as PocketLegionsView | null }) as GameSession;

describe('pickScreen', () => {
  it.each([
    ['no view', null, null, false, 'loading'],
    ['terminal wins', view('in_progress', { phase: 'battle' }), 'kicked', false, 'ended'],
    ['pending', view('pending', null), null, false, 'lobby'],
    ['army', view('in_progress', { phase: 'army' }), null, false, 'army'],
    ['deploy', view('in_progress', { phase: 'deploy' }), null, false, 'deploy'],
    ['handover before a private screen', view('in_progress', { phase: 'army' }), null, true, 'handover'],
    ['battle', view('in_progress', { phase: 'battle', battle: {} as never }), null, false, 'battle'],
    ['over after a battle stays on the field', view('in_progress', { phase: 'over', battle: {} as never }), null, false, 'battle'],
    ['over before any battle', view('in_progress', { phase: 'over', battle: null }), null, false, 'over'],
    ['finished without a battle', view('finished', { phase: 'over', battle: null }), null, false, 'ended'],
  ] as const)('%s', (_, session, terminal, handover, expected) => {
    expect(pickScreen(session, terminal, handover)).toBe(expected);
  });
});
