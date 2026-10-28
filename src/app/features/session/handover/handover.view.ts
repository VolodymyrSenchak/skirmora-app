import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { SessionConnection } from '../../../session/session-connection';
import { SessionStore } from '../../../session/session.store';
import { seatColor } from '../../../ui/colors';

/**
 * Hot-seat curtain (plan §6, §7): full screen, the next player's name in their seat colour,
 * nothing of anyone's army behind it until they tap.
 */
@Component({
  selector: 'app-handover-view',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (connection.handover(); as next) {
      <main class="curtain" [style.--seat]="color()">
        <span class="eyebrow">{{ phaseLabel() }}</span>
        <p class="muted">Передай телефон</p>
        <h1>{{ next.nickname }}</h1>
        <p class="muted small">Інші не дивляться: на наступному екрані ваша армія.</p>
        <button class="btn primary" type="button" (click)="connection.confirmHandover()">Я — {{ next.nickname }}, показати</button>
      </main>
    }
  `,
  styles: `
    .curtain {
      min-height: 100dvh; display: grid; place-content: center; gap: 14px; text-align: center; padding: 24px;
      background: radial-gradient(80% 60% at 50% 40%, color-mix(in srgb, var(--seat) 30%, transparent), transparent 70%), var(--bg);
    }
    h1 { font-size: clamp(40px, 12vw, 72px); color: var(--seat); line-height: 1; }
    .small { font-size: 13px; max-width: 32ch; margin: 0 auto; }
    .btn { margin-top: 12px; }
  `,
})
export class HandoverView {
  protected readonly connection = inject(SessionConnection);
  private readonly store = inject(SessionStore);

  protected readonly color = computed(() => seatColor(this.connection.handover()?.seat));
  protected readonly phaseLabel = computed(() => (this.store.phase() === 'deploy' ? 'Розстановка' : 'Збір армії'));
}
