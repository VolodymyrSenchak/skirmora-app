import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  ElementRef,
  inject,
  isDevMode,
  output,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { errorMessage } from '../../../core/api-error';
import { UNITS } from '../../../engine/engine/data/races';
import { getMap } from '../../../engine/engine/grid';
import { BattleInput } from '../../../battle/battle-input';
import { EventAnimator } from '../../../battle/event-animator';
import { PixiBattleRenderer } from '../../../battle/pixi/pixi-battle-renderer';
import type { GameAction, StackView } from '../../../models';
import { PocketLegions } from '../../../session/actions';
import { SessionConnection } from '../../../session/session-connection';
import { SessionStore } from '../../../session/session.store';
import { seatColor } from '../../../ui/colors';
import { abilityName, eventLine, plural, range, STATUS_NAMES, unitName } from '../../../ui/copy';
import { ResultPanel } from '../over/result.panel';

const SPEED_KEY = 'pocket-legions:speed';
const LOG_LINES = 5;
const TOAST_MS = 3000;
/** Plan §10: claim once the local clock passes the deadline by a second. */
const CLAIM_GRACE_MS = 1000;

/**
 * The battle screen (plan §7, §8): the Pixi scene and the HUD around it — round, turn order,
 * timer, the selected stack, the action bar, the last events. Every button comes from `hints`.
 */
@Component({
  selector: 'app-battle-view',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ResultPanel],
  template: `
    <div class="battle">
      <header class="topbar">
        <span class="round mono">Раунд {{ battle()?.round }}</span>
        <ol class="order" aria-label="Порядок ходів">
          @for (chip of order(); track chip.seat) {
            <li
              class="chip"
              [class.active]="chip.active"
              [class.out]="chip.out"
              [style.--seat]="chip.color"
              [attr.aria-current]="chip.active ? 'true' : null"
            >
              <span class="seat-dot" [style.background]="chip.color"></span>{{ chip.name }}
            </li>
          }
        </ol>
        @if (timerText(); as t) {
          <span class="timer mono" [class.low]="timerLow()" aria-label="Час ходу">{{ t }}</span>
        }
        <button class="btn small ghost menu-btn" type="button" (click)="menuOpen.set(!menuOpen())" aria-label="Меню" [attr.aria-expanded]="menuOpen()">☰</button>
      </header>

      @if (menuOpen()) {
        <div class="menu card" role="menu">
          <button class="btn small" type="button" role="menuitem" (click)="toggleSpeed()">Швидкість: {{ speed() }}×</button>
          @if (canSurrender()) {
            @if (confirmSurrender()) {
              <p>Здатися? Ваші загони покинуть поле.</p>
              <div class="row">
                <button class="btn small danger" type="button" role="menuitem" (click)="surrender()">Так, здатися</button>
                <button class="btn small" type="button" (click)="confirmSurrender.set(false)">Ні</button>
              </div>
            } @else {
              <button class="btn small danger" type="button" role="menuitem" (click)="confirmSurrender.set(true)">Здатися…</button>
            }
          }
          <button class="btn small ghost" type="button" role="menuitem" (click)="leave.emit()">Вийти з бою</button>
        </div>
      }

      <div class="scene-wrap">
        <div class="scene" #scene aria-label="Поле бою"></div>
        @if (loadError()) {
          <p class="scene-msg error-text">{{ loadError() }}</p>
        } @else if (!mounted()) {
          <p class="scene-msg muted">Завантаження…</p>
        }
        @if (showResult()) {
          <div class="result-layer">
            <app-result-panel (rematch)="rematch()" (leave)="leave.emit()" />
          </div>
        }
      </div>

      <section class="hud">
        <div class="turn" [style.--seat]="activeColor()" role="status">
          @if (over()) {
            <span>Бій закінчено</span>
          } @else if (animator.busy()) {
            <span>Хід: {{ activeName() }}…</span>
          } @else if (store.myTurn()) {
            <span><b>{{ connection.local ? activeName() + ', ваш хід' : 'Ваш хід' }}</b> · {{ instruction() }}</span>
          } @else {
            <span>Хід: <b>{{ activeName() }}</b> — чекаємо</span>
          }
        </div>

        @if (card(); as c) {
          <article class="unit-card card" [style.--seat]="c.color">
            <div class="unit-head">
              <h3>{{ c.name }}</h3>
              <span class="mono count">×{{ c.count }}</span>
            </div>
            <div class="stats mono">
              <div><b>{{ c.atk }}</b><i>атк</i></div>
              <div><b>{{ c.def }}</b><i>зах</i></div>
              <div><b>{{ c.dmg }}</b><i>шкода</i></div>
              <div><b>{{ c.hp }}</b><i>HP</i></div>
              <div><b>{{ c.spd }}</b><i>швид</i></div>
              @if (c.shots !== null) {
                <div><b>{{ c.shots }}</b><i>постр</i></div>
              }
            </div>
            @if (c.statuses.length) {
              <div class="tags">
                @for (s of c.statuses; track s) {
                  <span class="chip">{{ s }}</span>
                }
              </div>
            }
          </article>
        }

        @if (pendingText(); as p) {
          <p class="preview" aria-live="polite">{{ p }}</p>
        }

        @if (canAct()) {
          <div class="actions">
            @if (input.pending(); as pending) {
              <button class="btn primary" type="button" (click)="confirm()" [disabled]="!canConfirm()">Підтвердити</button>
              @if (pending.kind === 'shoot' && pending.canMelee) {
                <button class="btn" type="button" (click)="input.switchToMelee()">Рукопашна</button>
              }
              <button class="btn ghost" type="button" (click)="input.reset()">Скасувати</button>
            } @else {
              @if (input.selected()?.canDefend && input.mode() === 'act') {
                <button class="btn" type="button" (click)="send(input.defend())">Оборона</button>
              }
              @if (input.selected()?.abilities?.length) {
                <button class="btn" type="button" [attr.aria-pressed]="input.mode() === 'ability'" (click)="input.setMode('ability')">
                  {{ abilityLabel() }}
                </button>
              }
              @if (input.heroHints()) {
                <button class="btn" type="button" [attr.aria-pressed]="input.mode() === 'hero'" (click)="input.setMode('hero')">
                  Герой: {{ heroLabel() }}
                </button>
              }
              @if (input.mode() !== 'act') {
                <button class="btn ghost" type="button" (click)="input.reset()">Назад</button>
              }
            }
          </div>
        }

        @if (timeUp()) {
          <button class="btn danger" type="button" (click)="claimTimeout()">Час вийшов — пропустити хід</button>
        }

        @if (toast()) {
          <p class="toast" role="alert">{{ toast() }}</p>
        }

        <ol class="log" aria-live="polite" aria-label="Журнал бою">
          @for (line of log(); track line.seq) {
            <li [style.--seat]="line.color">{{ line.text }}</li>
          }
        </ol>
      </section>
    </div>
  `,
  styles: `
    :host { display: block; }
    .battle { display: grid; grid-template-columns: minmax(0, 1fr); gap: 8px; padding: 8px 8px 24px; max-width: 760px; margin: 0 auto; }
    .topbar { display: flex; align-items: center; gap: 8px; position: relative; }
    .round { font-size: 13px; color: var(--brass); white-space: nowrap; }
    .order { list-style: none; display: flex; gap: 4px; margin: 0; padding: 0; overflow-x: auto; flex: 1; min-width: 0; }
    .order .chip { white-space: nowrap; border: 1px solid transparent; font-size: 12.5px; }
    .order .chip.active { border-color: var(--seat); background: color-mix(in srgb, var(--seat) 25%, var(--panel-2)); }
    .order .chip.out { opacity: 0.45; text-decoration: line-through; }
    .timer { font-size: 15px; padding: 2px 8px; border-radius: 6px; background: var(--panel-2); }
    .timer.low { color: #fff; background: var(--danger); }
    .menu-btn { font-size: 18px; }
    .menu { position: absolute; right: 8px; top: 46px; z-index: 10; display: grid; gap: 8px; width: min(280px, calc(100vw - 32px)); }
    .menu .row { display: flex; gap: 8px; }
    .scene-wrap { position: relative; width: 100%; aspect-ratio: 1 / 1; max-height: 78dvh; margin: 0 auto; }
    .scene { position: absolute; inset: 0; border-radius: 10px; overflow: hidden; background: var(--cloth); }
    .scene-msg { position: absolute; inset: 0; display: grid; place-items: center; }
    .result-layer { position: absolute; inset: 0; display: grid; place-items: center; padding: 16px; background: #0008; border-radius: 10px; }
    .result-layer app-result-panel { width: min(360px, 100%); }
    .hud { display: grid; gap: 8px; align-content: start; }
    .turn { border-left: 4px solid var(--seat); padding: 6px 10px; background: var(--panel); border-radius: 6px; font-size: 14px; }
    .unit-card { display: grid; gap: 8px; padding: 10px; border-left: 4px solid var(--seat); }
    .unit-head { display: flex; justify-content: space-between; align-items: baseline; gap: 8px; }
    .unit-head h3 { font-size: 18px; }
    .count { color: var(--brass); }
    .stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(48px, 1fr)); gap: 2px; text-align: center; }
    .stats div { background: var(--cloth); padding: 4px 0; display: grid; border-radius: 4px; }
    .stats b { font-size: 13px; }
    .stats i { font-style: normal; font-size: 9.5px; color: var(--muted); letter-spacing: 0.06em; }
    .tags { display: flex; flex-wrap: wrap; gap: 4px; }
    .preview { background: var(--panel-2); border-radius: 8px; padding: 8px 10px; font-size: 14px; }
    .actions { display: flex; flex-wrap: wrap; gap: 8px; }
    .actions .btn { flex: 1 1 auto; }
    .actions .btn[aria-pressed='true'] { border-color: var(--brass); color: var(--brass); }
    .actions .btn.primary { flex-basis: 100%; }
    .toast { color: var(--danger); font-size: 14px; }
    .log { list-style: none; margin: 0; padding: 0; display: grid; gap: 2px; font-size: 13px; color: var(--muted); }
    .log li { border-left: 3px solid var(--seat, var(--line)); padding-left: 8px; }
    .log li:last-child { color: var(--fg); }
    @media (orientation: landscape) and (min-width: 700px) {
      .battle {
        max-width: none; height: 100dvh; padding-bottom: 8px;
        grid-template-columns: min(calc(100dvh - 64px), calc(100vw - 300px)) minmax(260px, 1fr);
        grid-template-rows: auto 1fr;
      }
      .topbar { grid-column: 1 / -1; }
      .scene-wrap { width: 100%; height: auto; max-height: none; align-self: start; }
      .hud { overflow-y: auto; max-height: calc(100dvh - 64px); }
    }
  `,
})
export class BattleView {
  protected readonly store = inject(SessionStore);
  protected readonly connection = inject(SessionConnection);
  private readonly sceneRef = viewChild.required<ElementRef<HTMLElement>>('scene');

  readonly leave = output<void>();

  private readonly renderer = new PixiBattleRenderer();
  protected readonly animator = new EventAnimator(this.renderer, { hidden: () => document.visibilityState === 'hidden' });
  protected readonly battle = this.store.battle;
  protected readonly over = computed(() => this.store.phase() === 'over');
  protected readonly mounted = signal(false);
  protected readonly loadError = signal<string | null>(null);
  protected readonly menuOpen = signal(false);
  protected readonly confirmSurrender = signal(false);
  protected readonly toast = signal<string | null>(null);
  protected readonly speed = signal(readSpeed());
  private readonly sending = signal(false);
  private readonly now = signal(Date.now());
  private claimedDeadline: string | null = null;
  private toastTimer: ReturnType<typeof setTimeout> | null = null;

  /** What the scene shows: the latest stacks (the renderer lags behind on its own). */
  private readonly stacks = computed<readonly StackView[]>(() => this.battle()?.stacks ?? []);

  protected readonly input = new BattleInput({
    // no hints while the queue plays or an action is in flight: input is locked (plan §9)
    hints: computed(() => (this.animator.busy() || this.sending() || this.over() ? null : this.store.hints())),
    stacks: this.stacks,
  });

  protected readonly canAct = computed(() => !!this.input.selected() || !!this.input.heroHints());
  protected readonly canSurrender = computed(() => this.store.phase() === 'battle' && !!this.store.mySeat() && !this.store.mySeat()!.eliminated);
  protected readonly showResult = computed(() => this.over() && !this.animator.busy());

  protected readonly activeName = computed(() => this.store.seatName()(this.battle()?.activeSeat));
  protected readonly activeColor = computed(() => seatColor(this.battle()?.activeSeat));

  protected readonly order = computed(() => {
    const battle = this.battle();
    const seats = this.store.game()?.seats ?? [];
    if (!battle) return [];
    return battle.order.map((seat) => ({
      seat,
      name: this.store.seatName()(seat),
      color: seatColor(seat),
      active: seat === battle.activeSeat && !this.over(),
      out: seats.find((candidate) => candidate.seat === seat)?.eliminated ?? false,
    }));
  });

  /** Countdown from `turnDeadline` against the local clock (plan §10). Off in hot-seat unless turned on. */
  private readonly remainingMs = computed(() => {
    const deadline = this.battle()?.turnDeadline;
    if (!deadline || this.over()) return null;
    if (this.connection.local && !this.localTimer()) return null;
    return Date.parse(deadline) - this.now();
  });
  protected readonly timerText = computed(() => {
    const ms = this.remainingMs();
    if (ms === null) return null;
    const s = Math.max(0, Math.ceil(ms / 1000));
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  });
  protected readonly timerLow = computed(() => (this.remainingMs() ?? Infinity) < 10_000);
  /** Hot-seat: `claimTimeout` is never sent by itself; the players decide. */
  protected readonly timeUp = computed(() => this.connection.local && (this.remainingMs() ?? 1) <= 0 && !this.animator.busy());

  protected readonly card = computed(() => {
    const stack = this.input.selectedStack() ?? null;
    if (!stack) return null;
    const unit = UNITS[stack.unitId];
    return {
      name: unitName(stack.unitId),
      color: seatColor(stack.seat),
      count: stack.count,
      atk: unit.atk,
      def: unit.def,
      dmg: range(unit.dmg),
      hp: `${stack.hpTop}/${unit.hp}`,
      spd: unit.spd,
      shots: unit.ranged ? stack.shots : null,
      statuses: stack.statuses.map((status) => STATUS_NAMES[status.id] ?? status.id),
    };
  });

  protected readonly instruction = computed(() => {
    switch (this.input.mode()) {
      case 'ability':
        return 'оберіть ціль здібності';
      case 'hero':
        return heroInstruction(this.input.heroHints()?.abilityId);
      default:
        return this.input.pending() ? 'торкніться ще раз, щоб підтвердити' : 'клітинка — рух, ворог — атака';
    }
  });

  protected readonly abilityLabel = computed(() => abilityName(this.input.selected()?.abilities[0]?.abilityId));
  protected readonly heroLabel = computed(() => abilityName(this.input.heroHints()?.abilityId));
  protected readonly canConfirm = computed(() => {
    const pending = this.input.pending();
    return !!pending && (pending.kind !== 'hero' || this.input.heroReady());
  });

  protected readonly pendingText = computed(() => {
    const pending = this.input.pending();
    if (!pending) return null;
    const name = (id: string | null | undefined) => {
      const stack = this.stacks().find((candidate) => candidate.id === id);
      return stack ? unitName(stack.unitId) : '';
    };
    switch (pending.kind) {
      case 'attack':
      case 'shoot': {
        const { dmg, kills } = pending.preview;
        const killText = kills[1] > 0 ? `, вб'є ${range(kills)}` : '';
        const penalty =
          pending.kind === 'shoot' && pending.penalty.length
            ? ` (½: ${pending.penalty.map((p) => (p === 'range' ? 'далеко' : 'впритул')).join(', ')})`
            : '';
        return `${pending.kind === 'shoot' ? 'Постріл' : 'Атака'} → ${name(pending.targetId)}: ${range(dmg)} ${plural(dmg[1], 'шкода', 'шкоди', 'шкоди')}${killText}${penalty}`;
      }
      case 'ability':
        return `${this.abilityLabel()}${pending.targetId ? ` → ${name(pending.targetId)}` : ''}`;
      case 'hero':
        return `${this.heroLabel()}${pending.target ? ` → ${name(pending.target)}` : ''}${pending.ally ? ` · лікує ${name(pending.ally)}` : ''}`;
    }
  });

  protected readonly log = computed(() => {
    const shown = this.animator.shownSeq();
    const stacks = this.stacks();
    const seatName = this.store.seatName();
    const names = {
      stack: (id: string | undefined) => {
        const stack = stacks.find((candidate) => candidate.id === id);
        return stack ? unitName(stack.unitId) : '';
      },
      seat: (seat: number | undefined) => seatName(seat),
    };
    const lines: { seq: number; text: string; color: string }[] = [];
    for (const event of this.store.game()?.events ?? []) {
      if (event.seq > shown) break;
      const text = eventLine(event, names);
      if (!text || event.type === 'turnStarted' || event.type === 'roundStarted') continue;
      const seat = event.seat ?? stacks.find((stack) => stack.id === event.stackId)?.seat;
      lines.push({ seq: event.seq, text, color: seatColor(seat) });
    }
    return lines.slice(-LOG_LINES);
  });

  constructor() {
    this.renderer.setSpeed(this.speed());
    const reduced = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)');
    this.renderer.setInstant(!!reduced?.matches);

    afterNextRender(() => void this.mount());
    // dev builds: lets a console script (or an e2e run) drive and inspect the battle
    if (isDevMode()) (globalThis as Record<string, unknown>)['__battle'] = this;

    // every new snapshot → the animator (plan §9)
    effect(() => {
      const battle = this.battle();
      const events = this.store.game()?.events ?? [];
      if (!this.mounted() || !battle) return;
      untracked(() => this.animator.push(battle, events));
    });

    effect(() => {
      const groups = this.input.highlights();
      if (this.mounted()) untracked(() => this.renderer.highlight(groups));
    });

    // a new turn (or a morale bonus) starts with a clean selection
    effect(() => {
      this.battle()?.turn;
      this.battle()?.bonusStackId;
      untracked(() => {
        this.input.selectedId.set(null);
        this.input.reset();
      });
    });

    // the clock for the countdown and the online timeout claim
    const clock = setInterval(() => this.now.set(Date.now()), 250);
    effect(() => {
      const ms = this.remainingMs();
      const deadline = this.battle()?.turnDeadline ?? null;
      if (this.connection.local || ms === null || deadline === null) return;
      if (ms < -CLAIM_GRACE_MS && this.claimedDeadline !== deadline) {
        this.claimedDeadline = deadline;
        untracked(() => void this.connection.dispatch(PocketLegions.claimTimeout()));
      }
    });

    const onVisible = () => {
      if (document.visibilityState === 'visible') this.animator.flush();
    };
    document.addEventListener('visibilitychange', onVisible);

    inject(DestroyRef).onDestroy(() => {
      clearInterval(clock);
      if (this.toastTimer) clearTimeout(this.toastTimer);
      document.removeEventListener('visibilitychange', onVisible);
      this.animator.stop();
      this.renderer.destroy();
    });
  }

  private localTimer(): boolean {
    return (this.connection as { timerEnabled?: boolean }).timerEnabled ?? false;
  }

  private async mount(): Promise<void> {
    const game = this.store.game();
    const battle = this.battle();
    if (!game || !battle) return;
    try {
      await this.renderer.mount(
        this.sceneRef().nativeElement,
        getMap(game.mapId),
        battle.sides.map((side) => ({ seat: side.seat, raceId: side.raceId })),
      );
      this.renderer.onCellTap((cell) => {
        if (!this.store.myTurn()) return;
        this.send(this.input.tap(cell));
      });
      this.mounted.set(true);
    } catch (error) {
      console.error(error);
      this.loadError.set('Не вдалося завантажити поле бою. Оновіть сторінку.');
    }
  }

  protected confirm(): void {
    this.send(this.input.confirm());
  }

  protected async send(action: GameAction | null): Promise<void> {
    if (!action || this.sending()) return;
    this.sending.set(true);
    try {
      const result = await this.connection.dispatch(action);
      if (!result.ok) this.showToast(errorMessage(result.error));
    } finally {
      this.sending.set(false);
    }
  }

  protected toggleSpeed(): void {
    const next = this.speed() === 1 ? 2 : 1;
    this.speed.set(next);
    this.renderer.setSpeed(next);
    try {
      localStorage.setItem(SPEED_KEY, String(next));
    } catch {
      /* private mode */
    }
  }

  protected surrender(): void {
    this.menuOpen.set(false);
    this.confirmSurrender.set(false);
    void this.send(PocketLegions.surrender());
  }

  protected claimTimeout(): void {
    void this.send(PocketLegions.claimTimeout());
  }

  protected rematch(): void {
    void this.send(PocketLegions.rematch());
  }

  private showToast(text: string): void {
    this.toast.set(text);
    if (this.toastTimer) clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => this.toast.set(null), TOAST_MS);
  }
}

function readSpeed(): number {
  try {
    return localStorage.getItem(SPEED_KEY) === '2' ? 2 : 1;
  } catch {
    return 1;
  }
}

function heroInstruction(abilityId: string | undefined): string {
  switch (abilityId) {
    case 'heavenly_shield':
      return 'оберіть свій загін';
    case 'earth_roots':
      return 'оберіть ворожий загін';
    case 'blood_ritual':
      return 'оберіть ворога, потім свій загін';
    case 'hellfire':
      return 'оберіть центр квадрата 3×3';
    case 'stone_wall':
      return 'оберіть початок і кінець стіни з 3 клітинок';
    default:
      return 'підтвердьте вміння';
  }
}
