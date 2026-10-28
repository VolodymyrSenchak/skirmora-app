import { ChangeDetectionStrategy, Component, computed, inject, output } from '@angular/core';
import { SessionStore } from '../../../session/session.store';
import { SessionConnection } from '../../../session/session-connection';
import { seatColor } from '../../../ui/colors';
import { END_REASONS } from '../../../ui/copy';

/**
 * The result (plan §7 "over"): winners, reason, points at the round limit, rematch for the host
 * and leave for everyone. In hot-seat the phone is the host.
 */
@Component({
  selector: 'app-result-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="result card" aria-labelledby="result-h">
      <span class="eyebrow">Бій закінчено</span>
      <h2 id="result-h">{{ headline() }}</h2>
      <p class="muted">{{ reason() }}</p>
      @if (points(); as rows) {
        <table class="points mono">
          <tbody>
            @for (row of rows; track row.seat) {
              <tr>
                <td><span class="seat-dot" [style.background]="row.color"></span> {{ row.name }}</td>
                <td class="num">{{ row.points }}</td>
              </tr>
            }
          </tbody>
        </table>
      }
      <div class="actions">
        @if (canRematch()) {
          <button class="btn primary" type="button" (click)="rematch.emit()">Реванш</button>
        }
        <button class="btn" type="button" (click)="leave.emit()">Вийти</button>
      </div>
      @if (!canRematch() && !connection.local) {
        <p class="muted small">Реванш запускає господар кімнати.</p>
      }
    </section>
  `,
  styles: `
    .result { display: grid; gap: 10px; text-align: center; padding: 20px 16px; box-shadow: 0 12px 40px #000a; }
    h2 { font-size: 28px; }
    .points { margin: 4px auto; border-collapse: collapse; min-width: 200px; }
    .points td { padding: 4px 8px; text-align: left; }
    .points .num { text-align: right; color: var(--brass); }
    .actions { display: grid; gap: 8px; margin-top: 6px; }
    .small { font-size: 13px; }
  `,
})
export class ResultPanel {
  private readonly store = inject(SessionStore);
  protected readonly connection = inject(SessionConnection);

  readonly rematch = output<void>();
  readonly leave = output<void>();

  private readonly result = computed(() => this.store.game()?.result ?? null);

  readonly headline = computed(() => {
    const result = this.result();
    if (!result || !result.winnerSeats.length) return 'Нічия';
    const names = result.winnerSeats.map((seat) => this.store.seatName()(seat));
    const mine = this.store.mySeat();
    if (!this.connection.local && mine && result.winnerSeats.includes(mine.seat)) return 'Перемога!';
    return result.winnerSeats.length > 1 ? `Перемогли ${names.join(' і ')}` : `Переміг ${names[0]}`;
  });

  readonly reason = computed(() => {
    const reason = this.result()?.reason;
    return reason ? (END_REASONS[reason] ?? reason) : '';
  });

  readonly points = computed(() => {
    const result = this.result();
    const order = this.store.battle()?.order;
    if (!result?.points || !order) return null;
    return order.map((seat, i) => ({ seat, name: this.store.seatName()(seat), color: seatColor(seat), points: result.points![i] }));
  });

  readonly canRematch = computed(() => this.connection.local || this.store.isHost());
}
