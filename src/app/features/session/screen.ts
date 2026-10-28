import type { GameSession, TerminalReason } from '../../models';

export type Screen = 'loading' | 'ended' | 'lobby' | 'handover' | 'army' | 'deploy' | 'battle' | 'over';

/**
 * The whole of the session shell's routing, as a pure function (plan §7), so the
 * (status, phase, handover, terminal) table can be tested directly.
 *
 * A finished battle stays on the battle screen: its last events still animate there, and the
 * result shows over the field once they have. `over` is only for a game that ended before a battle.
 */
export function pickScreen(view: GameSession | null, terminal: TerminalReason | null, handoverPending: boolean): Screen {
  if (terminal) return 'ended';
  if (!view) return 'loading';
  if (view.status === 'pending') return 'lobby';
  const game = view.game;
  if (view.status === 'finished' && !game?.battle) return 'ended';
  if (!game) return 'loading';
  if (handoverPending) return 'handover';
  switch (game.phase) {
    case 'army':
      return 'army';
    case 'deploy':
      return 'deploy';
    case 'battle':
      return 'battle';
    default:
      return game.battle ? 'battle' : 'over';
  }
}
