import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { MAPS } from '../../engine/engine/data/maps';
import { BUDGETS, startProblem } from '../../engine/game/pocketLegions.state';
import { DATA_VERSION } from '../../engine/engine/version';
import type { GameMode, MapId } from '../../models';
import { LocalTransport } from '../../session/local.transport';
import { seatColor } from '../../ui/colors';
import { MapPreview } from '../../ui/map-preview';

const NAMES_KEY = 'pocket-legions:local-names';
const MAX_NAME = 20;

/** `/local`: hot-seat setup — 2–4 names, map, budget, mode, the optional turn timer (plan §7). */
@Component({
  selector: 'app-local-setup-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MapPreview, RouterLink],
  template: `
    <main class="shell setup">
      <header>
        <a class="back" routerLink="/">← Назад</a>
        <span class="eyebrow">Один телефон</span>
        <h1>Нова гра</h1>
        <p class="muted">Телефон передають по колу: армію й розстановку кожен бачить лише свою.</p>
      </header>

      <section class="field" aria-labelledby="players-h">
        <span class="label" id="players-h">Гравці</span>
        @for (name of names(); track $index; let i = $index) {
          <div class="name-row">
            <span class="seat-dot" [style.background]="color(i)"></span>
            <input
              [value]="name"
              (input)="rename(i, $event)"
              [attr.maxlength]="maxName"
              [attr.aria-label]="'Ім’я гравця ' + (i + 1)"
            />
            @if (names().length > 2) {
              <button class="btn small ghost" type="button" (click)="removePlayer(i)" [attr.aria-label]="'Прибрати гравця ' + (i + 1)">✕</button>
            }
          </div>
        }
        @if (names().length < 4) {
          <button class="btn small" type="button" (click)="addPlayer()">+ Гравець</button>
        }
      </section>

      <section class="field" aria-labelledby="map-h">
        <span class="label" id="map-h">Карта</span>
        <div class="maps">
          @for (m of maps; track m.id) {
            <button class="map card" type="button" [attr.aria-pressed]="m.id === mapId()" (click)="mapId.set(m.id)">
              <app-map-preview [mapId]="m.id" [players]="names().length" [mode]="mode()" />
              <span class="map-name">{{ m.name }}</span>
              <span class="mono muted small">{{ m.size }}×{{ m.size }} · {{ m.players }}</span>
            </button>
          }
        </div>
        <p class="muted small">{{ mapDesc() }}</p>
      </section>

      <section class="field">
        <span class="label">Бюджет</span>
        <div class="segs">
          @for (b of budgets; track b) {
            <button class="seg" type="button" [attr.aria-pressed]="b === budget()" (click)="budget.set(b)">{{ b }}</button>
          }
        </div>
      </section>

      <section class="field">
        <span class="label">Режим</span>
        <div class="segs">
          <button class="seg" type="button" [attr.aria-pressed]="mode() === 'ffa'" (click)="mode.set('ffa')">Кожен сам за себе</button>
          <button class="seg" type="button" [attr.aria-pressed]="mode() === 'teams'" (click)="mode.set('teams')">2 на 2</button>
        </div>
      </section>

      <section class="field">
        <span class="label">Таймер ходу</span>
        <div class="segs">
          <button class="seg" type="button" [attr.aria-pressed]="!timer()" (click)="timer.set(false)">Без таймера</button>
          @for (s of turnOptions; track s) {
            <button class="seg" type="button" [attr.aria-pressed]="timer() && turnSeconds() === s" (click)="timer.set(true); turnSeconds.set(s)">{{ s }} с</button>
          }
        </div>
      </section>

      @if (problem(); as p) {
        <p class="error-text" role="alert">{{ p }}</p>
      }
      @if (hasSaved) {
        <p class="muted small">Почата гра на цьому телефоні буде замінена новою.</p>
      }
      <button class="btn primary" type="button" (click)="start()" [disabled]="!!problem()">Почати</button>
      <button class="btn" type="button" (click)="start(true)" [disabled]="!!problem()">Швидкий бій (готові армії)</button>
    </main>
  `,
  styles: `
    .setup { gap: 18px; }
    header { display: grid; gap: 6px; }
    h1 { font-size: 36px; }
    .back { color: var(--muted); text-decoration: none; font-size: 14px; }
    .small { font-size: 13px; }
    .name-row { display: flex; align-items: center; gap: 8px; }
    .name-row input {
      flex: 1; min-height: var(--tap); padding: 0 12px; border-radius: var(--r-field); border: 1px solid var(--line); background: var(--cloth);
    }
    .maps { display: grid; grid-template-columns: repeat(auto-fill, minmax(118px, 1fr)); gap: 8px; }
    .map { display: grid; gap: 4px; padding: 6px; text-align: left; }
    .map[aria-pressed='true'] { border-color: var(--brass); box-shadow: 0 0 0 1px var(--brass); }
    .map-name { font: 700 14px/1.1 var(--font-display); }
  `,
})
export class LocalSetupPage {
  private readonly router = inject(Router);

  protected readonly maps = MAPS;
  protected readonly budgets = BUDGETS;
  protected readonly turnOptions = [30, 45, 60, 90];
  protected readonly maxName = MAX_NAME;
  protected readonly hasSaved = LocalTransport.hasSaved();

  protected readonly names = signal<string[]>(readNames());
  protected readonly mapId = signal<MapId>('valley');
  protected readonly budget = signal<(typeof BUDGETS)[number]>(1000);
  protected readonly mode = signal<GameMode>('ffa');
  protected readonly timer = signal(false);
  protected readonly turnSeconds = signal(45);

  protected readonly mapDesc = computed(() => MAPS.find((map) => map.id === this.mapId())?.desc ?? '');

  /** The engine's own start check (what the server's `lobby.start` runs), plus names. */
  protected readonly problem = computed(() => {
    const names = this.names().map((name) => name.trim());
    if (names.some((name) => !name)) return 'Кожному гравцю потрібне ім’я.';
    if (new Set(names).size !== names.length) return 'Імена мають бути різні.';
    const problem = startProblem(
      { mapId: this.mapId(), budget: this.budget(), mode: this.mode(), turnSeconds: this.turnSeconds(), dataVersion: DATA_VERSION },
      names.length,
    );
    if (!problem) return null;
    if (this.mode() === 'teams') return this.mapTeams() ? '2 на 2 — рівно 4 гравці.' : 'На цій карті немає режиму 2 на 2.';
    const [min, max] = MAPS.find((map) => map.id === this.mapId())!.ffaPlayers;
    return `Ця карта для ${min === max ? min : `${min}–${max}`} гравців.`;
  });

  private mapTeams(): boolean {
    return MAPS.find((map) => map.id === this.mapId())?.teams ?? false;
  }

  protected color(seat: number): string {
    return seatColor(seat);
  }

  protected rename(index: number, event: Event): void {
    const value = (event.target as HTMLInputElement).value.slice(0, MAX_NAME);
    this.names.update((names) => names.map((name, i) => (i === index ? value : name)));
  }

  protected addPlayer(): void {
    this.names.update((names) => [...names, `Гравець ${names.length + 1}`]);
  }

  protected removePlayer(index: number): void {
    this.names.update((names) => names.filter((_, i) => i !== index));
  }

  protected start(quick = false): void {
    if (this.problem()) return;
    const nicknames = this.names().map((name) => name.trim());
    const created = LocalTransport.create({
      nicknames,
      settings: { mapId: this.mapId(), budget: this.budget(), mode: this.mode(), turnSeconds: this.turnSeconds(), maxPlayers: 4 },
      timer: this.timer(),
    });
    if ('error' in created) return;
    try {
      localStorage.setItem(NAMES_KEY, JSON.stringify(nicknames));
    } catch {
      /* private mode */
    }
    void this.router.navigateByUrl(quick ? '/local/game?quick=1' : '/local/game');
  }
}

function readNames(): string[] {
  try {
    const names = JSON.parse(localStorage.getItem(NAMES_KEY) ?? 'null') as unknown;
    if (Array.isArray(names) && names.length >= 2 && names.length <= 4 && names.every((name) => typeof name === 'string')) {
      return names as string[];
    }
  } catch {
    /* private mode */
  }
  return ['Гравець 1', 'Гравець 2'];
}
