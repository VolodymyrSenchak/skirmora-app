import { ChangeDetectionStrategy, Component, inject, input, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { IdentityService } from '../../core/identity.service';
import { Lobby } from '../../session/actions';
import { SessionConnection } from '../../session/session-connection';
import { SessionStore } from '../../session/session.store';
import { TransportManager } from '../../session/transport.manager';
import { SessionScreens } from './session-screens';

/**
 * `/s/:code`: the online session (SA §7). It provides the store and the transport manager and
 * hands the rest to the shared screens. No identity for this code → the join form.
 */
@Component({
  selector: 'app-session-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [SessionStore, TransportManager, { provide: SessionConnection, useExisting: TransportManager }],
  imports: [SessionScreens],
  template: `<app-session-screens (leave)="leave()" />`,
})
export class SessionPage implements OnInit {
  private readonly transport = inject(TransportManager);
  private readonly identity = inject(IdentityService);
  private readonly store = inject(SessionStore);
  private readonly router = inject(Router);

  /** Route param, bound by `withComponentInputBinding()`. */
  readonly code = input.required<string>();

  ngOnInit(): void {
    const code = this.code();
    const identity = this.identity.get(code);
    if (!identity) {
      void this.router.navigate(['/join'], { queryParams: { code } });
      return;
    }
    this.transport.start(code, identity.playerToken);
  }

  /** Tell the room first, so the others see the seat empty instead of a ghost going offline. */
  async leave(): Promise<void> {
    if (!this.transport.terminal()) {
      await this.transport.dispatch(Lobby.leave());
    }
    this.identity.clear(this.code());
    this.transport.stop();
    this.store.reset();
    void this.router.navigate(['/']);
  }
}
