import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  ElementRef,
  inject,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { errorMessage } from '../../../core/api-error';
import { UNITS } from '../../../engine/engine/data/races';
import { cellIndex, getMap } from '../../../engine/engine/grid';
import type { Highlight } from '../../../battle/battle-renderer';
import { PixiBattleRenderer } from '../../../battle/pixi/pixi-battle-renderer';
import type { Cell, Placement, StackView, UnitId } from '../../../models';
import { PocketLegions } from '../../../session/actions';
import { autoDeploy } from '../../../session/local-presets';
import { SessionConnection } from '../../../session/session-connection';
import { SessionStore } from '../../../session/session.store';
import { seatColor } from '../../../ui/colors';
import { UnitPortrait } from '../../../ui/unit-portrait';
import { SeatsBar } from '../seats-bar';

/**
 * Deploy phase (plan §7): the map with your zone, tap a stack then a cell (or a placed stack to
 * pick it up again), ready. Nobody else's stacks are on this map — the view has none.
 */
@Component({
  selector: 'app-deploy-view',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [SeatsBar, UnitPortrait],
  template: `
    <main class="deploy" [style.--seat]="color()">
      <header class="head">
        <div>
          <span class="eyebrow">Розстановка</span>
          <h1>{{ store.me()?.nickname }}</h1>
        </div>
        <app-seats-bar phase="deploy" />
      </header>

      <div class="layout">
        <div class="scene-wrap">
          <div class="scene" #scene aria-label="Карта: ваша зона підсвічена"></div>
          @if (!mounted()) {
            <p class="scene-msg muted">Завантаження…</p>
          }
        </div>

        <section class="side">
          @if (ready()) {
            <div class="card waiting" aria-live="polite">
              <h2>Загони на місцях</h2>
              <p class="muted">Чекаємо на інших гравців.</p>
              <button class="btn" type="button" (click)="unready()" [disabled]="busy()">Переставити</button>
            </div>
          } @else {
            <p class="muted small">Оберіть загін, потім клітинку у своїй зоні. Торкніться поставленого загону, щоб пересунути.</p>
            <ol class="list">
              @for (s of roster(); track s.index) {
                <li>
                  <button
                    class="stack"
                    type="button"
                    [class.placed]="s.placed"
                    [attr.aria-pressed]="selected() === s.index"
                    (click)="selected.set(s.index)"
                  >
                    <app-unit-portrait class="mini" [raceId]="raceId()!" [unitId]="s.unitId" [px]="80" />
                    <span>{{ s.name }} <span class="mono muted">×{{ s.count }}</span></span>
                    <span class="state">{{ s.placed ? '✓' : '' }}</span>
                  </button>
                </li>
              }
            </ol>
            <div class="row">
              <button class="btn" type="button" (click)="auto()">Розставити автоматично</button>
              <button class="btn ghost" type="button" (click)="placements.set([])">Скинути</button>
            </div>
            @if (error()) {
              <p class="error-text" role="alert">{{ error() }}</p>
            }
            <button class="btn primary" type="button" (click)="submit()" [disabled]="busy() || !allPlaced()">
              {{ allPlaced() ? 'Готово' : 'Розставте всі загони' }}
            </button>
          }
        </section>
      </div>
    </main>
  `,
  styles: `
    .deploy { max-width: 1100px; margin: 0 auto; padding: 12px var(--gutter) 24px; display: grid; gap: 12px; }
    .head { display: grid; gap: 8px; }
    h1 { font-size: 30px; color: var(--seat); }
    h2 { font-size: 20px; }
    .small { font-size: 13px; }
    .layout { display: grid; gap: 12px; }
    .scene-wrap { position: relative; width: 100%; aspect-ratio: 1 / 1; max-height: 70dvh; margin: 0 auto; }
    .scene { position: absolute; inset: 0; border-radius: 10px; overflow: hidden; background: var(--cloth); }
    .scene-msg { position: absolute; inset: 0; display: grid; place-items: center; }
    .side { display: grid; gap: 10px; align-content: start; }
    .list { list-style: none; margin: 0; padding: 0; display: grid; gap: 6px; }
    .stack {
      width: 100%; min-height: var(--tap); display: grid; grid-template-columns: 40px 1fr auto; gap: 10px; align-items: center;
      border-radius: 8px; border: 1px solid var(--line); background: var(--cloth); padding: 4px 10px; text-align: left;
    }
    .stack[aria-pressed='true'] { border-color: var(--brass); background: color-mix(in srgb, var(--brass) 14%, var(--cloth)); }
    .stack.placed { opacity: 0.8; }
    .mini { width: 40px; height: 40px; }
    .state { color: var(--ok); font-weight: 700; }
    .row { display: flex; gap: 8px; flex-wrap: wrap; }
    .waiting { display: grid; gap: 10px; }
    @media (min-width: 820px) {
      .layout { grid-template-columns: minmax(0, 1fr) 320px; align-items: start; }
      .scene-wrap { max-height: calc(100dvh - 140px); }
    }
  `,
})
export class DeployView {
  protected readonly store = inject(SessionStore);
  private readonly connection = inject(SessionConnection);
  private readonly sceneRef = viewChild.required<ElementRef<HTMLElement>>('scene');
  private readonly renderer = new PixiBattleRenderer();

  protected readonly mounted = signal(false);
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly placements = signal<Placement[]>([]);
  protected readonly selected = signal(0);

  private readonly mine = computed(() => this.store.game()?.mine ?? null);
  protected readonly raceId = computed(() => this.store.mySeat()?.raceId ?? null);
  protected readonly ready = computed(() => this.store.mySeat()?.deployReady ?? false);
  protected readonly color = computed(() => seatColor(this.store.mySeat()?.seat));
  private readonly zone = computed(() => this.mine()?.zone ?? []);
  private readonly map = computed(() => getMap(this.store.game()!.mapId));
  private readonly armyStacks = computed(() => this.mine()?.army?.stacks ?? []);

  protected readonly roster = computed(() =>
    this.armyStacks().map((stack, index) => ({
      index,
      unitId: stack.unitId as UnitId,
      name: UNITS[stack.unitId as UnitId].name,
      count: stack.count,
      placed: this.placements().some((placement) => placement.stackIndex === index),
    })),
  );

  protected readonly allPlaced = computed(() => this.armyStacks().length > 0 && this.placements().length === this.armyStacks().length);

  /** Fake stack views for the scene: only mine, only placed. */
  private readonly sceneStacks = computed<StackView[]>(() => {
    const seat = this.store.mySeat()?.seat ?? 0;
    return this.placements().map((placement) => {
      const stack = this.armyStacks()[placement.stackIndex];
      return {
        id: `d${placement.stackIndex}`,
        seat,
        unitId: stack.unitId,
        count: stack.count,
        hpTop: UNITS[stack.unitId as UnitId].hp,
        startCount: stack.count,
        x: placement.x,
        y: placement.y,
        shots: 0,
        retaliationsLeft: 0,
        activated: false,
        statuses: [],
        rage: 0,
        resurrectUsed: false,
      } as StackView;
    });
  });

  private readonly highlights = computed<Highlight[]>(() => {
    const groups: Highlight[] = [{ kind: 'zone', cells: this.zone(), color: this.color() }];
    if (this.ready()) return groups;
    const chosen = this.placements().find((placement) => placement.stackIndex === this.selected());
    if (chosen) groups.push({ kind: 'selected', cells: [chosen] });
    return groups;
  });

  constructor() {
    // start from the server's placements (after an unready), once
    let loaded = false;
    effect(() => {
      const deployment = this.mine()?.deployment;
      if (loaded || !this.mine()) return;
      loaded = true;
      untracked(() => this.placements.set(deployment ? deployment.map((p) => ({ ...p })) : []));
    });

    afterNextRender(() => void this.mount());

    effect(() => {
      const stacks = this.sceneStacks();
      if (this.mounted()) untracked(() => this.renderer.setStacks(stacks));
    });
    effect(() => {
      const groups = this.highlights();
      if (this.mounted()) untracked(() => this.renderer.highlight(groups));
    });

    inject(DestroyRef).onDestroy(() => this.renderer.destroy());
  }

  private async mount(): Promise<void> {
    const raceId = this.raceId();
    const seat = this.store.mySeat()?.seat ?? 0;
    if (!raceId) return;
    try {
      await this.renderer.mount(this.sceneRef().nativeElement, this.map(), [{ seat, raceId }]);
      this.renderer.onCellTap((cell) => this.tap(cell));
      this.mounted.set(true);
    } catch (error) {
      console.error(error);
      this.error.set('Не вдалося завантажити карту. Оновіть сторінку.');
    }
  }

  protected tap(cell: Cell): void {
    if (this.ready()) return;
    this.error.set(null);
    const here = this.placements().find((placement) => placement.x === cell.x && placement.y === cell.y);
    const selected = this.selected();
    if (here && here.stackIndex !== selected) {
      // a placed stack: pick it up
      this.selected.set(here.stackIndex);
      return;
    }
    if (!this.zone().some((zoneCell) => zoneCell.x === cell.x && zoneCell.y === cell.y)) return;
    const map = this.map();
    if (map.blocked[cellIndex(map, cell)]) return;
    this.placements.update((placements) => [
      ...placements.filter((placement) => placement.stackIndex !== selected),
      { stackIndex: selected, x: cell.x, y: cell.y },
    ]);
    // on to the next stack still waiting for a cell
    const next = this.roster().find((stack) => !stack.placed);
    if (next) this.selected.set(next.index);
  }

  protected auto(): void {
    this.error.set(null);
    this.placements.set(autoDeploy(this.store.game()!.mapId, this.zone(), this.armyStacks().length));
  }

  protected async submit(): Promise<void> {
    await this.send(PocketLegions.submitDeploy(this.placements()));
  }

  protected async unready(): Promise<void> {
    await this.send(PocketLegions.unready());
  }

  private async send(action: Parameters<SessionConnection['dispatch']>[0]): Promise<void> {
    if (this.busy()) return;
    this.busy.set(true);
    this.error.set(null);
    try {
      const result = await this.connection.dispatch(action);
      if (!result.ok) this.error.set(errorMessage(result.error));
    } finally {
      this.busy.set(false);
    }
  }
}
