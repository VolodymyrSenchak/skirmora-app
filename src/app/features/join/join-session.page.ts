import { ChangeDetectionStrategy, Component, computed, effect, ElementRef, inject, input, signal, untracked, viewChildren } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { errorMessage, toApiError } from '../../core/api-error';
import { IdentityService } from '../../core/identity.service';
import { SessionApiService } from '../../core/session-api.service';
import { MAPS } from '../../engine/engine/data/maps';
import { ApiError, NICKNAME_MAX_LENGTH, PASSWORD_MAX_LENGTH, SessionInfo } from '../../models';

const CODE_LENGTH = 6;

/** `/join` (SA, adapted). `/join?code=042137` is the share link, so the code prefills. */
@Component({
  selector: 'app-join-session-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink],
  template: `
    <form class="shell join" (submit)="submit($event)">
      <header>
        <a class="back" routerLink="/">← Назад</a>
        <span class="eyebrow">Онлайн</span>
        <h1>Приєднатися</h1>
        <p class="muted">Шість цифр коду від того, хто створив кімнату.</p>
      </header>

      <section class="field">
        <label for="code-0">Код кімнати</label>
        <div class="digits">
          @for (digit of digits(); track $index) {
            <input
              #digitInput
              class="digit mono"
              [class.filled]="digit !== ''"
              [class.invalid]="codeError() !== null"
              [id]="'code-' + $index"
              type="text"
              inputmode="numeric"
              autocomplete="one-time-code"
              maxlength="1"
              [attr.aria-label]="'Цифра коду ' + ($index + 1)"
              [value]="digit"
              (input)="onDigit($index, $event)"
              (keydown)="onDigitKey($index, $event)"
              (paste)="onPaste($event)"
            />
          }
        </div>
        @if (codeError(); as message) {
          <span class="error">{{ message }}</span>
        } @else if (info(); as room) {
          <span class="found">✓ {{ roomLabel(room) }}</span>
        } @else if (looking()) {
          <span class="muted">Шукаємо кімнату…</span>
        }
      </section>

      <section class="field">
        <label for="nick">Ваше ім’я</label>
        <input id="nick" autocomplete="nickname" [value]="nickname()" (input)="nickname.set(value($event))" [attr.maxlength]="nicknameMax" />
        @if (nicknameError(); as message) {
          <span class="error">{{ message }}</span>
        }
      </section>

      @if (info()?.requiresPassword) {
        <section class="field">
          <label for="pass">Кімната з паролем</label>
          <input id="pass" type="password" autocomplete="current-password" [value]="password()" (input)="password.set(value($event))" [attr.maxlength]="passwordMax" />
          @if (passwordError(); as message) {
            <span class="error">{{ message }}</span>
          }
        </section>
      }

      @if (toast(); as message) {
        <p class="error-text" role="alert">{{ message }}</p>
      }
      <button class="btn primary" type="submit" [disabled]="busy()">{{ busy() ? 'Входимо…' : 'Увійти' }}</button>
      <p class="muted small">Приєднатися можна лише до початку гри.</p>
    </form>
  `,
  styles: `
    .join { gap: 18px; }
    header { display: grid; gap: 6px; }
    h1 { font-size: 36px; }
    .back { color: var(--muted); text-decoration: none; font-size: 14px; }
    .digits { display: flex; gap: 8px; }
    .digit {
      width: 100%; min-width: 0; height: 60px; padding: 0; text-align: center; font-size: 26px; font-weight: 700;
      border-radius: var(--r-field); border: 1.5px solid var(--line); background: var(--cloth);
    }
    .digit.filled { border-color: var(--brass); }
    .digit.invalid { border-color: var(--danger); }
    .found { color: var(--ok); font-size: 14px; }
    .small { font-size: 13px; }
  `,
})
export class JoinSessionPage {
  private readonly api = inject(SessionApiService);
  private readonly identity = inject(IdentityService);
  private readonly router = inject(Router);

  /** `withComponentInputBinding()` hands us `?code=042137` straight from the query string. */
  readonly code = input<string>('');
  private readonly inputs = viewChildren<ElementRef<HTMLInputElement>>('digitInput');

  protected readonly nicknameMax = NICKNAME_MAX_LENGTH;
  protected readonly passwordMax = PASSWORD_MAX_LENGTH;
  protected readonly digits = signal<string[]>(Array<string>(CODE_LENGTH).fill(''));
  protected readonly info = signal<SessionInfo | null>(null);
  protected readonly looking = signal(false);
  protected readonly busy = signal(false);
  protected readonly codeError = signal<string | null>(null);
  protected readonly passwordError = signal<string | null>(null);
  protected readonly nicknameServerError = signal<string | null>(null);
  protected readonly toast = signal<string | null>(null);
  protected readonly nickname = signal(this.identity.lastNickname());
  protected readonly password = signal('');
  private readonly touched = signal(false);

  protected readonly joined = computed(() => this.digits().join(''));
  protected readonly nicknameError = computed(() => {
    if (this.touched() && !this.nickname().trim()) return 'Як вас звати? Ім’я побачать інші гравці.';
    return this.nicknameServerError();
  });

  constructor() {
    // prefill from the shared link, once
    effect(() => {
      const prefill = this.code().replace(/\D/g, '').slice(0, CODE_LENGTH);
      if (prefill) untracked(() => this.setCode(prefill));
    });

    // look the room up as soon as six digits are in; that is what shows the password field
    effect((onCleanup) => {
      const code = this.joined();
      if (code.length < CODE_LENGTH) {
        untracked(() => {
          this.info.set(null);
          this.looking.set(false);
        });
        return;
      }
      untracked(() => {
        this.looking.set(true);
        this.codeError.set(null);
      });
      let cancelled = false;
      onCleanup(() => (cancelled = true));
      void this.lookup(code, () => cancelled);
    });
  }

  protected value(event: Event): string {
    return (event.target as HTMLInputElement).value;
  }

  protected roomLabel(info: SessionInfo): string {
    const map = MAPS.find((candidate) => candidate.id === info.mapId);
    const mode = info.mode === 'teams' ? '2 на 2' : 'кожен за себе';
    return `${map?.name ?? info.mapId} · ${mode} · ${info.budget} · ${info.playerCount} з ${info.maxPlayers}`;
  }

  protected onDigit(index: number, event: Event): void {
    const input = event.target as HTMLInputElement;
    const value = input.value.replace(/\D/g, '').slice(-1);
    input.value = value;
    this.digits.update((current) => current.map((digit, i) => (i === index ? value : digit)));
    if (value && index < CODE_LENGTH - 1) this.focusDigit(index + 1);
  }

  protected onDigitKey(index: number, event: KeyboardEvent): void {
    if (event.key === 'Backspace' && !this.digits()[index] && index > 0) {
      event.preventDefault();
      this.digits.update((current) => current.map((digit, i) => (i === index - 1 ? '' : digit)));
      this.focusDigit(index - 1);
    }
    if (event.key === 'ArrowLeft' && index > 0) this.focusDigit(index - 1);
    if (event.key === 'ArrowRight' && index < CODE_LENGTH - 1) this.focusDigit(index + 1);
  }

  protected onPaste(event: ClipboardEvent): void {
    const pasted = event.clipboardData?.getData('text')?.replace(/\D/g, '') ?? '';
    if (!pasted) return;
    event.preventDefault();
    this.setCode(pasted.slice(0, CODE_LENGTH));
  }

  protected async submit(event: Event): Promise<void> {
    event.preventDefault();
    this.touched.set(true);
    this.toast.set(null);
    this.passwordError.set(null);
    this.nicknameServerError.set(null);
    const code = this.joined();
    if (code.length < CODE_LENGTH) {
      this.codeError.set('Потрібно шість цифр.');
      return;
    }
    if (!this.nickname().trim() || this.busy()) return;
    this.busy.set(true);
    try {
      const password = this.password();
      const result = await firstValueFrom(this.api.join(code, { nickname: this.nickname().trim(), ...(password ? { password } : {}) }));
      this.identity.save({
        code: result.session.code,
        playerId: result.playerId,
        playerToken: result.playerToken,
        nickname: result.session.me.nickname,
      });
      await this.router.navigate(['/s', result.session.code]);
    } catch (error) {
      this.showJoinError(toApiError(error));
    } finally {
      this.busy.set(false);
    }
  }

  private async lookup(code: string, cancelled: () => boolean): Promise<void> {
    try {
      const info = await firstValueFrom(this.api.info(code));
      if (cancelled()) return;
      this.info.set(info);
      this.codeError.set(info.joinable ? null : notJoinableReason(info));
    } catch (error) {
      if (cancelled()) return;
      this.info.set(null);
      this.codeError.set(errorMessage(toApiError(error)));
    } finally {
      if (!cancelled()) this.looking.set(false);
    }
  }

  /** Every join error has its place (plan §12): name, password, code, or a toast. */
  private showJoinError(error: ApiError): void {
    const message = errorMessage(error);
    switch (error.code) {
      case 'nickname-taken':
        this.nicknameServerError.set(message);
        return;
      case 'unauthorized':
        this.passwordError.set(message);
        return;
      case 'not-found':
      case 'gone':
      case 'session-full':
      case 'session-finished':
      case 'session-started':
        this.codeError.set(message);
        return;
      default:
        this.toast.set(message);
    }
  }

  private setCode(code: string): void {
    const next = Array<string>(CODE_LENGTH).fill('');
    for (let i = 0; i < code.length && i < CODE_LENGTH; i++) next[i] = code[i];
    this.digits.set(next);
    this.focusDigit(Math.min(code.length, CODE_LENGTH - 1));
  }

  private focusDigit(index: number): void {
    queueMicrotask(() => {
      const input = this.inputs()[index]?.nativeElement;
      input?.focus();
      input?.select();
    });
  }
}

function notJoinableReason(info: SessionInfo): string {
  if (info.status === 'in_progress') return 'Гра вже почалась.';
  if (info.status === 'finished') return 'Ця гра вже закінчилась.';
  if (info.playerCount >= info.maxPlayers) return `Кімната заповнена — ${info.playerCount} з ${info.maxPlayers}.`;
  return 'До цієї кімнати зараз не можна приєднатися.';
}
