import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { LocalTransport } from '../../session/local.transport';

/** `/`: online, one phone, join (plan §7). */
@Component({
  selector: 'app-home-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink],
  template: `
    <main class="shell home">
      <header>
        <span class="eyebrow">Покрокова тактика · 2–4 гравці</span>
        <h1>Pocket Legions</h1>
        <p class="muted">Шість рас, герої зі спорядженням і бої на картах від 10×10 до 20×20.</p>
      </header>
      <nav class="actions">
        @if (hasLocal) {
          <a class="btn primary" routerLink="/local/game">Продовжити гру на одному телефоні</a>
        }
        <a class="btn" [class.primary]="!hasLocal" routerLink="/local">Один телефон</a>
      </nav>
    </main>
  `,
  styles: `
    .home { min-height: 100dvh; align-content: center; gap: 28px; }
    header { display: grid; gap: 10px; }
    h1 { font-size: clamp(44px, 13vw, 72px); line-height: 0.95; font-weight: 800; }
    .actions { display: grid; gap: 10px; }
  `,
})
export class HomePage {
  protected readonly hasLocal = LocalTransport.hasSaved();
}
