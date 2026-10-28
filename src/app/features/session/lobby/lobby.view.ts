import { ChangeDetectionStrategy, Component, computed, effect, inject, output, signal, untracked } from '@angular/core';
import { errorMessage } from '../../../core/api-error';
import { startProblemText } from '../../../core/start-check';
import { MAPS } from '../../../engine/engine/data/maps';
import type { CreateSettings, GameAction } from '../../../models';
import { Lobby } from '../../../session/actions';
import { SessionConnection } from '../../../session/session-connection';
import { SessionStore } from '../../../session/session.store';
import { seatColor } from '../../../ui/colors';
import { MapPreview } from '../../../ui/map-preview';
import { RoomSettingsForm } from '../../create/room-settings.form';

/**
 * The lobby (SA, plus the settings summary and the host's settings edit, plan §7): share the code,
 * see who is in, and the host starts when the map allows the player count.
 */
@Component({
  selector: 'app-lobby-view',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MapPreview, RoomSettingsForm],
  template: `
    <main class="shell lobby">
      <header class="head">
        <span class="eyebrow">Кімната</span>
        <div class="code-row">
          <h1 class="mono code">{{ store.code() }}</h1>
          <button class="btn small" type="button" (click)="share()">{{ copied() ? 'Скопійовано' : 'Поділитися' }}</button>
        </div>
        <p class="muted small">Надішліть код або посилання друзям: {{ link() }}</p>
      </header>

      <section class="card players" aria-labelledby="players-h">
        <h2 id="players-h">Гравці {{ store.players().length }}/{{ settings()?.maxPlayers }}</h2>
        <ul>
          @for (p of players(); track p.id) {
            <li>
              <span class="seat-dot" [style.background]="p.color"></span>
              <span class="dot" [class.on]="p.isOnline" [attr.aria-label]="p.isOnline ? 'онлайн' : 'офлайн'"></span>
              <span class="name">{{ p.nickname }}{{ p.isMe ? ' (ви)' : '' }}</span>
              @if (p.isHost) {
                <span class="chip">господар</span>
              } @else if (store.isHost()) {
                <button class="btn small ghost" type="button" (click)="act.emit(transferHost(p.id))">Зробити господарем</button>
                <button class="btn small ghost danger" type="button" (click)="act.emit(kick(p.id))">Вилучити</button>
              }
            </li>
          }
        </ul>
      </section>

      @if (editing()) {
        <section class="card edit">
          <h2>Налаштування</h2>
          <app-room-settings-form [(value)]="draft" [minPlayers]="store.players().length" />
          @if (editError()) {
            <p class="error-text" role="alert">{{ editError() }}</p>
          }
          <div class="row">
            <button class="btn primary" type="button" (click)="saveSettings()" [disabled]="saving()">Зберегти</button>
            <button class="btn ghost" type="button" (click)="editing.set(false)">Скасувати</button>
          </div>
        </section>
      } @else if (settings(); as s) {
        <section class="card summary">
          <app-map-preview [mapId]="s.mapId" [players]="s.mode === 'teams' ? 4 : store.players().length" [mode]="s.mode" />
          <div class="facts">
            <h2>{{ mapName() }}</h2>
            <span class="muted">{{ s.mode === 'teams' ? '2 на 2' : 'Кожен сам за себе' }} · бюджет {{ s.budget }} · {{ s.turnSeconds }} с на хід</span>
            @if (store.isHost()) {
              <button class="btn small" type="button" (click)="startEdit()">Змінити налаштування</button>
            }
          </div>
        </section>
      }

      @if (store.isHost()) {
        @if (startProblem(); as problem) {
          <p class="muted">{{ problem }}</p>
        }
        <button class="btn primary" type="button" (click)="act.emit(start())" [disabled]="!!startProblem()">Почати гру</button>
      } @else {
        <p class="muted waiting">Чекаємо, поки господар почне гру…</p>
      }
      <button class="btn ghost" type="button" (click)="exit.emit()">Вийти з кімнати</button>
    </main>
  `,
  styles: `
    .lobby { gap: 14px; }
    .head { display: grid; gap: 6px; }
    .code-row { display: flex; align-items: center; gap: 12px; }
    .code { font-size: 44px; letter-spacing: 0.08em; font-family: var(--font-mono); }
    .small { font-size: 13px; word-break: break-all; }
    h2 { font-size: 20px; }
    .players ul { list-style: none; margin: 8px 0 0; padding: 0; display: grid; gap: 6px; }
    .players li { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; min-height: 36px; }
    .name { font-weight: 600; }
    .dot { width: 8px; height: 8px; border-radius: 50%; background: var(--faint); }
    .dot.on { background: var(--ok); }
    .summary { display: grid; grid-template-columns: 120px 1fr; gap: 12px; align-items: start; }
    .facts { display: grid; gap: 6px; }
    .edit { display: grid; gap: 12px; }
    .row { display: flex; gap: 8px; }
    .waiting { text-align: center; }
  `,
})
export class LobbyView {
  protected readonly store = inject(SessionStore);
  private readonly connection = inject(SessionConnection);

  readonly act = output<GameAction>();
  readonly exit = output<void>();

  protected readonly settings = this.store.settings;
  protected readonly copied = signal(false);
  protected readonly editing = signal(false);
  protected readonly saving = signal(false);
  protected readonly editError = signal<string | null>(null);
  protected readonly draft = signal<CreateSettings>({ mapId: 'valley', budget: 1000, mode: 'ffa', turnSeconds: 45, maxPlayers: 4 });

  /** Snapshots replace the object on every presence change; only a real change counts. */
  private readonly settingsKey = computed(() => JSON.stringify(this.settings()));
  protected readonly link = computed(() => `${location.origin}/join?code=${this.store.code()}`);
  protected readonly mapName = computed(() => MAPS.find((map) => map.id === this.settings()?.mapId)?.name ?? '');
  protected readonly players = computed(() => {
    const me = this.store.me()?.playerId;
    return this.store.players().map((player, seat) => ({ ...player, color: seatColor(seat), isMe: player.id === me }));
  });
  protected readonly startProblem = computed(() => {
    const settings = this.settings();
    if (!settings) return null;
    if (this.store.players().length < 2) return 'Потрібно щонайменше 2 гравці.';
    return startProblemText(settings, this.store.players().length);
  });

  constructor() {
    // the room's settings changed under the open editor (another tab of the host): close it
    effect(() => {
      this.settingsKey();
      untracked(() => this.editing.set(false));
    });
  }

  protected start = Lobby.start;
  protected kick = Lobby.kick;
  protected transferHost = Lobby.transferHost;

  protected startEdit(): void {
    const s = this.settings();
    if (!s) return;
    this.draft.set({ mapId: s.mapId, budget: s.budget, mode: s.mode, turnSeconds: s.turnSeconds, maxPlayers: s.maxPlayers });
    this.editError.set(null);
    this.editing.set(true);
  }

  protected async saveSettings(): Promise<void> {
    this.saving.set(true);
    this.editError.set(null);
    try {
      const result = await this.connection.dispatch(Lobby.updateSettings(this.draft()));
      if (result.ok) this.editing.set(false);
      else this.editError.set(errorMessage(result.error));
    } finally {
      this.saving.set(false);
    }
  }

  protected async share(): Promise<void> {
    const url = this.link();
    try {
      if (navigator.share) {
        await navigator.share({ title: 'Skirmora', text: `Код кімнати: ${this.store.code()}`, url });
        return;
      }
      await navigator.clipboard.writeText(url);
      this.copied.set(true);
      setTimeout(() => this.copied.set(false), 2000);
    } catch {
      /* dismissed */
    }
  }
}
