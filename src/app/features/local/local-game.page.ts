import { ChangeDetectionStrategy, Component, inject, input, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { LocalSession } from '../../session/local-session';
import { LocalTransport } from '../../session/local.transport';
import { SessionConnection } from '../../session/session-connection';
import { SessionStore } from '../../session/session.store';
import { SessionScreens } from '../session/session-screens';

/** Ready-made armies for the quick battle, by seat. */
const QUICK_RACES = ['knights', 'barbarians', 'elves', 'demons'] as const;

/** `/local/game`: the session screens over the saved `LocalTransport` (plan §6, §7). */
@Component({
  selector: 'app-local-game-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [SessionStore, LocalSession, { provide: SessionConnection, useExisting: LocalSession }],
  imports: [SessionScreens],
  template: `<app-session-screens (leave)="leave()" />`,
})
export class LocalGamePage implements OnInit {
  private readonly session = inject(LocalSession);
  private readonly router = inject(Router);

  /** `?quick=1`: skip the shop — ready-made armies and automatic deployment. */
  readonly quick = input<string>();

  ngOnInit(): void {
    const saved = LocalTransport.restore();
    if (!saved) {
      void this.router.navigateByUrl('/local');
      return;
    }
    this.session.start(saved);
    if (this.quick()) {
      this.session.quickStart([...QUICK_RACES]);
      void this.router.navigate([], { queryParams: {}, replaceUrl: true });
    }
  }

  leave(): void {
    this.session.stop();
    LocalTransport.clearSaved();
    void this.router.navigateByUrl('/');
  }
}
