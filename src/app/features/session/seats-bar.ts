import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { RACES } from '../../engine/engine/data/races';
import { Skirmora } from '../../session/actions';
import { SessionConnection } from '../../session/session-connection';
import { SessionStore } from '../../session/session.store';
import { seatColor } from '../../ui/colors';

/**
 * The other players during army and deploy: race and a ready chip only (plan §7) — never their
 * army. In 2 vs 2 the host moves players between teams here.
 */
@Component({
  selector: 'app-seats-bar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ul class="seats" aria-label="Гравці">
      @for (seat of seats(); track seat.seat) {
        <li class="chip" [class.me]="seat.me" [style.--seat]="seat.color">
          <span class="seat-dot" [style.background]="seat.color"></span>
          <span class="name">{{ seat.name }}</span>
          <span class="muted">{{ seat.race }}</span>
          @if (seat.ready) {
            <span class="ready" aria-label="готовий">✓</span>
          }
          @if (seat.team !== null) {
            @if (canSetTeams()) {
              <button class="team btn small" type="button" (click)="toggleTeam(seat.playerId, seat.team)" [attr.aria-label]="'Команда гравця ' + seat.name">
                {{ seat.team === 0 ? 'A' : 'Б' }}
              </button>
            } @else {
              <span class="team">{{ seat.team === 0 ? 'A' : 'Б' }}</span>
            }
          }
        </li>
      }
    </ul>
  `,
  styles: `
    .seats { list-style: none; margin: 0; padding: 0; display: flex; flex-wrap: wrap; gap: 6px; }
    .chip { border: 1px solid transparent; }
    .chip.me { border-color: var(--seat); }
    .name { font-weight: 600; }
    .ready { color: var(--ok); font-weight: 700; }
    .team { font: 700 12px/1 var(--font-mono); color: var(--brass); }
    .team.btn { min-height: 28px; padding: 0 8px; }
  `,
})
export class SeatsBar {
  private readonly store = inject(SessionStore);
  private readonly connection = inject(SessionConnection);

  /** Which ready flag to show. */
  readonly phase = input<'army' | 'deploy'>('army');

  protected readonly canSetTeams = computed(
    () => this.store.phase() === 'army' && (this.connection.local || this.store.isHost()),
  );

  protected readonly seats = computed(() => {
    const game = this.store.game();
    const me = this.store.me()?.playerId;
    return (game?.seats ?? []).map((seat) => ({
      seat: seat.seat,
      playerId: seat.playerId,
      name: this.store.nicknameOf()(seat.playerId),
      race: seat.raceId ? RACES[seat.raceId].name : '…',
      ready: this.phase() === 'army' ? seat.armyReady : seat.deployReady,
      team: seat.team,
      color: seatColor(seat.seat),
      me: seat.playerId === me,
    }));
  });

  protected toggleTeam(playerId: string, team: 0 | 1 | null): void {
    void this.connection.dispatch(Skirmora.setTeam(playerId, team === 0 ? 1 : 0));
  }
}
