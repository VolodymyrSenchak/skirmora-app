import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { errorMessage, toApiError } from '../../core/api-error';
import { IdentityService } from '../../core/identity.service';
import { SessionApiService } from '../../core/session-api.service';
import { CreateSettings, NICKNAME_MAX_LENGTH, PASSWORD_MAX_LENGTH } from '../../models';
import { DEFAULT_ROOM_SETTINGS, RoomSettingsForm } from './room-settings.form';

const SETTINGS_KEY = 'skirmora:create-settings';

/** `/create`: settings, nickname, optional password → `POST /api/sessions` → `/s/:code` (plan §7). */
@Component({
  selector: 'app-create-session-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RoomSettingsForm, RouterLink],
  template: `
    <form class="shell create" (submit)="submit($event)">
      <header>
        <a class="back" routerLink="/">← Назад</a>
        <span class="eyebrow">Онлайн</span>
        <h1>Нова кімната</h1>
      </header>

      <section class="field">
        <label for="nick">Ваше ім’я</label>
        <input id="nick" autocomplete="nickname" [value]="nickname()" (input)="nickname.set(value($event))" [attr.maxlength]="nicknameMax" />
        @if (nicknameError()) {
          <span class="error">{{ nicknameError() }}</span>
        }
      </section>

      <app-room-settings-form [(value)]="settings" />

      <section class="field">
        <label for="pass">Пароль (необов’язково)</label>
        <input id="pass" type="password" autocomplete="new-password" [value]="password()" (input)="password.set(value($event))" [attr.maxlength]="passwordMax" />
      </section>

      @if (error()) {
        <p class="error-text" role="alert">{{ error() }}</p>
      }
      <button class="btn primary" type="submit" [disabled]="busy()">{{ busy() ? 'Створюємо…' : 'Створити кімнату' }}</button>
    </form>
  `,
  styles: `
    .create { gap: 18px; }
    header { display: grid; gap: 6px; }
    h1 { font-size: 36px; }
    .back { color: var(--muted); text-decoration: none; font-size: 14px; }
  `,
})
export class CreateSessionPage {
  private readonly api = inject(SessionApiService);
  private readonly identity = inject(IdentityService);
  private readonly router = inject(Router);

  protected readonly nicknameMax = NICKNAME_MAX_LENGTH;
  protected readonly passwordMax = PASSWORD_MAX_LENGTH;
  protected readonly nickname = signal(this.identity.lastNickname());
  protected readonly password = signal('');
  protected readonly settings = signal<CreateSettings>(readSettings());
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  private readonly touched = signal(false);

  protected readonly nicknameError = computed(() =>
    this.touched() && !this.nickname().trim() ? 'Як вас звати? Ім’я побачать інші гравці.' : null,
  );

  protected value(event: Event): string {
    return (event.target as HTMLInputElement).value;
  }

  protected async submit(event: Event): Promise<void> {
    event.preventDefault();
    this.touched.set(true);
    this.error.set(null);
    if (this.nicknameError() || this.busy()) return;
    this.busy.set(true);
    try {
      const settings = this.settings();
      const result = await firstValueFrom(
        this.api.create({
          nickname: this.nickname().trim(),
          ...(this.password() ? { password: this.password() } : {}),
          settings,
        }),
      );
      this.identity.save({
        code: result.session.code,
        playerId: result.playerId,
        playerToken: result.playerToken,
        nickname: result.session.me.nickname,
      });
      try {
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
      } catch {
        /* private mode */
      }
      await this.router.navigate(['/s', result.session.code]);
    } catch (error) {
      this.error.set(errorMessage(toApiError(error)));
    } finally {
      this.busy.set(false);
    }
  }
}

function readSettings(): CreateSettings {
  try {
    const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? 'null') as Partial<CreateSettings> | null;
    return { ...DEFAULT_ROOM_SETTINGS, ...(saved ?? {}) };
  } catch {
    return { ...DEFAULT_ROOM_SETTINGS };
  }
}
