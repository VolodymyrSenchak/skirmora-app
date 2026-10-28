import { ChangeDetectionStrategy, Component, computed, inject, output } from '@angular/core';
import { SessionConnection } from '../../session/session-connection';
import { SessionStore } from '../../session/session.store';
import { BattleView } from './battle/battle.view';
import { HandoverView } from './handover/handover.view';
import { ResultPanel } from './over/result.panel';
import { PocketLegions } from '../../session/actions';
import { pickScreen } from './screen';

/**
 * Picks the screen by phase (plan §7). Shared by the online session page and the hot-seat
 * page: both provide a `SessionStore` and a `SessionConnection`, and this can't tell them apart.
 */
@Component({
  selector: 'app-session-screens',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [BattleView, HandoverView, ResultPanel],
  template: `
    @if (store.outdated()) {
      <p class="outdated" role="alert">Гру оновлено — перезавантажте сторінку.</p>
    }
    @switch (screen()) {
      @case ('loading') {
        <main class="shell"><p class="muted">Завантаження…</p></main>
      }
      @case ('handover') {
        <app-handover-view />
      }
      @case ('battle') {
        <app-battle-view (leave)="leave.emit()" />
      }
      @case ('over') {
        <main class="shell">
          <app-result-panel (rematch)="rematch()" (leave)="leave.emit()" />
        </main>
      }
      @default {
        <main class="shell"><p class="muted">{{ screen() }}</p></main>
      }
    }
  `,
  styles: `
    .outdated { background: var(--danger); color: #fff; padding: 8px 12px; text-align: center; margin: 0; }
  `,
})
export class SessionScreens {
  protected readonly store = inject(SessionStore);
  private readonly connection = inject(SessionConnection);

  readonly leave = output<void>();

  readonly screen = computed(() => pickScreen(this.store.view(), this.connection.terminal(), !!this.connection.handover()));

  protected rematch(): void {
    void this.connection.dispatch(PocketLegions.rematch());
  }
}
