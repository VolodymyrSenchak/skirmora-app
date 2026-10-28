import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TerminalReason } from '../../models';

interface EndedCopy {
  title: string;
  body: string;
  primary: { label: string; link: string; query?: Record<string, string> };
}

/** Dead ends (SA): anything that ends the session ends it on every screen at once. */
@Component({
  selector: 'app-ended-view',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink],
  template: `
    <main class="shell ended">
      <div class="card">
        <h1>{{ copy().title }}</h1>
        <p class="muted">{{ copy().body }}</p>
      </div>
      <a class="btn primary" [routerLink]="copy().primary.link" [queryParams]="copy().primary.query ?? {}">{{ copy().primary.label }}</a>
      @if (reason() === 'outdated') {
        <button class="btn" type="button" (click)="reload()">Перезавантажити</button>
      }
    </main>
  `,
  styles: `
    .ended { min-height: 100dvh; align-content: center; text-align: center; }
    .card { display: grid; gap: 10px; padding: 24px 18px; }
    h1 { font-size: 26px; }
  `,
})
export class EndedView {
  readonly reason = input<TerminalReason | null>(null);
  readonly code = input<string>('');

  protected readonly copy = computed<EndedCopy>(() => {
    const home = { label: 'На головну', link: '/' };
    switch (this.reason()) {
      case 'kicked':
        return { title: 'Вас вилучили з кімнати', body: 'Господар кімнати прибрав вас зі списку гравців.', primary: home };
      case 'left':
        return { title: 'Ви вийшли з кімнати', body: 'Щоб повернутися, приєднайтесь знову за кодом.', primary: { label: 'Приєднатися', link: '/join', query: { code: this.code() } } };
      case 'replaced':
        return { title: 'Вхід з іншого пристрою', body: 'Хтось увійшов у цю кімнату під вашим ім’ям.', primary: home };
      case 'unauthorized':
        return { title: 'Немає доступу', body: 'Цей пристрій не знає вашого місця в кімнаті. Приєднайтесь за кодом.', primary: { label: 'Приєднатися', link: '/join', query: { code: this.code() } } };
      case 'not-found':
        return { title: 'Кімнати немає', body: 'Можливо, код неправильний або кімнату вже прибрали.', primary: home };
      case 'expired':
        return { title: 'Кімната закрита', body: 'Кімнати живуть добу або закриваються, коли в них тихо.', primary: home };
      case 'outdated':
        return { title: 'Гру оновлено', body: 'Ця кімната створена зі старими правилами. Перезавантажте сторінку і створіть нову кімнату.', primary: { label: 'Нова кімната', link: '/create' } };
      default:
        return { title: 'Гру закінчено', body: 'Кімнату закрито.', primary: home };
    }
  });

  protected reload(): void {
    location.reload();
  }
}
