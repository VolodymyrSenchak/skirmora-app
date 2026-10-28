import { ChangeDetectionStrategy, Component, inject, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { LocalSession } from '../../session/local-session';
import { LocalTransport } from '../../session/local.transport';
import { SessionConnection } from '../../session/session-connection';
import { SessionStore } from '../../session/session.store';
import { SessionScreens } from '../session/session-screens';

/** `/local/game`: the session screens over a `LocalTransport` (plan §6, §7). */
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

  ngOnInit(): void {
    const saved = LocalTransport.restore();
    if (saved) {
      this.session.start(saved);
      return;
    }
    // Phase 1: no setup page yet — a quick 2-player battle with ready-made armies
    const created = LocalTransport.create({ nicknames: ['Гравець 1', 'Гравець 2'], settings: { mapId: 'arena', budget: 1000 } });
    if ('error' in created) {
      void this.router.navigateByUrl('/');
      return;
    }
    this.session.start(created.transport);
    this.session.quickStart(['knights', 'barbarians']);
  }

  leave(): void {
    this.session.stop();
    LocalTransport.clearSaved();
    void this.router.navigateByUrl('/');
  }
}
