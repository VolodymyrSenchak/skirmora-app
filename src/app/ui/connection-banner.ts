import { ChangeDetectionStrategy, Component, computed, effect, input, signal, untracked } from '@angular/core';
import { ConnectionState } from '../session/session.transport';

/** The socket closes every ~300 s by design. Below three seconds the player should never know. */
const QUIET_MS = 3000;

/**
 * Exactly three states: hidden (live, or reconnecting for less than 3 s),
 * "Перепідключення…", and "Повільний зв’язок" while polling. It never blocks input — actions
 * queued while degraded go over HTTP anyway.
 */
@Component({
  selector: 'app-connection-banner',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (label(); as text) {
      <div class="banner" role="status" aria-live="polite">
        <span class="banner__dot" [style.background]="dotColour()"></span>
        <span class="banner__text">{{ text }}</span>
      </div>
    }
  `,
  styles: `
    .banner {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 13px 15px;
      border-radius: 14px;
      background: var(--panel);
      border: 1.5px solid var(--line);
      font-size: 13.5px;
    }

    .banner__dot {
      width: 9px;
      height: 9px;
      border-radius: var(--r-pill);
      display: block;
      flex-shrink: 0;
    }

    .banner__text {
      flex-grow: 1;
    }
  `,
})
export class ConnectionBannerComponent {
  readonly state = input.required<ConnectionState>();
  /** Shown in the "slow line" copy so it matches what the server actually asked for. */
  readonly pollIntervalMs = input(1500);

  private readonly settled = signal(false);

  readonly label = computed<string | null>(() => {
    const state = this.state();
    if (state === 'degraded') {
      return `Повільний зв’язок — оновлюємо кожні ${(this.pollIntervalMs() / 1000).toFixed(1)} с`;
    }
    if (state === 'connecting' && this.settled()) {
      return 'Перепідключення…';
    }
    return null;
  });

  readonly dotColour = computed(() => (this.state() === 'degraded' ? 'var(--ok)' : 'var(--brass)'));

  constructor() {
    effect((onCleanup) => {
      const connecting = this.state() === 'connecting';
      untracked(() => this.settled.set(false));
      if (!connecting) {
        return;
      }
      const timer = setTimeout(() => this.settled.set(true), QUIET_MS);
      onCleanup(() => clearTimeout(timer));
    });
  }
}
