import { ChangeDetectionStrategy, Component, computed, inject, output, signal } from '@angular/core';
import { errorMessage } from '../../core/api-error';
import type { GameAction } from '../../models';
import { Skirmora } from '../../session/actions';
import { SessionConnection } from '../../session/session-connection';
import { SessionStore } from '../../session/session.store';
import { ConnectionBannerComponent } from '../../ui/connection-banner';
import { ArmyView } from './army/army.view';
import { BattleView } from './battle/battle.view';
import { DeployView } from './deploy/deploy.view';
import { EndedView } from './ended.view';
import { HandoverView } from './handover/handover.view';
import { LobbyView } from './lobby/lobby.view';
import { ResultPanel } from './over/result.panel';
import { pickScreen } from './screen';

const TOAST_MS = 3500;

/**
 * Picks the screen by phase (plan §7). Shared by the online session page and the hot-seat
 * page: both provide a `SessionStore` and a `SessionConnection`, and this can't tell them apart.
 */
@Component({
  selector: 'app-session-screens',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ArmyView, BattleView, ConnectionBannerComponent, DeployView, EndedView, HandoverView, LobbyView, ResultPanel],
  template: `
    @if (store.outdated() && screen() !== 'ended') {
      <p class="outdated" role="alert">Гру оновлено — перезавантажте сторінку.</p>
    }
    @if (!connection.local && screen() !== 'ended') {
      <div class="banner"><app-connection-banner [state]="connection.connection()" [pollIntervalMs]="store.pollIntervalMs()" /></div>
    }
    @switch (screen()) {
      @case ('loading') {
        <main class="shell"><p class="muted">Завантаження…</p></main>
      }
      @case ('ended') {
        <app-ended-view [reason]="connection.terminal() ?? 'finished'" [code]="store.code() ?? ''" />
      }
      @case ('lobby') {
        <app-lobby-view (act)="dispatch($event)" (exit)="leave.emit()" />
      }
      @case ('handover') {
        <app-handover-view />
      }
      @case ('army') {
        <app-army-view />
      }
      @case ('deploy') {
        <app-deploy-view />
      }
      @case ('battle') {
        <app-battle-view (leave)="leave.emit()" />
      }
      @case ('over') {
        <main class="shell">
          <app-result-panel (rematch)="dispatch(rematch())" (leave)="leave.emit()" />
        </main>
      }
    }
    @if (toast()) {
      <p class="toast" role="alert">{{ toast() }}</p>
    }
  `,
  styles: `
    .outdated { background: var(--danger); color: #fff; padding: 8px 12px; text-align: center; margin: 0; }
    .banner:empty { display: none; }
    .banner { position: fixed; left: 8px; right: 8px; bottom: 8px; z-index: 50; max-width: 520px; margin: 0 auto; }
    .toast {
      position: fixed; left: 50%; bottom: 72px; transform: translateX(-50%); z-index: 60; margin: 0;
      background: var(--panel); border: 1px solid var(--danger); color: var(--fg); padding: 10px 14px; border-radius: 10px;
      max-width: calc(100vw - 32px);
    }
  `,
})
export class SessionScreens {
  protected readonly store = inject(SessionStore);
  protected readonly connection = inject(SessionConnection);

  readonly leave = output<void>();

  readonly screen = computed(() => pickScreen(this.store.view(), this.connection.terminal(), !!this.connection.handover()));
  protected readonly toast = signal<string | null>(null);
  protected readonly rematch = Skirmora.rematch;
  private toastTimer: ReturnType<typeof setTimeout> | null = null;

  /** A failed action leaves the store untouched: the next snapshot is the truth. Say little. */
  protected async dispatch(action: GameAction): Promise<void> {
    const result = await this.connection.dispatch(action);
    if (result.ok) return;
    this.toast.set(errorMessage(result.error));
    if (this.toastTimer) clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => this.toast.set(null), TOAST_MS);
  }
}
