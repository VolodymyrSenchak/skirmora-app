import { Application, Container, FederatedPointerEvent, Graphics, Sprite } from 'pixi.js';
import type { BuiltMap } from '../../engine/engine/grid';
import type { Cell, GameEvent, RaceId, StackView } from '../../models';
import { seatColor } from '../../ui/colors';
import { floatText as floatCopy } from '../../ui/copy';
import { BattleRenderer, Highlight, HighlightKind, SceneSide, SceneWall } from '../battle-renderer';
import { AtlasLoader, ProjectileAtlas, RaceAtlas } from './atlas-loader';
import { flyProjectile, floatText, FloatKind, tween, wait } from './effects';
import { mapTexture } from './map-texture';
import { UnitView } from './unit-view';

/** The map texture and the world are 64 px per cell (plan §8). */
const CELL = 64;
const MOVE_MS_PER_CELL = 220;
const PROJECTILE_CELLS_PER_S = 12;
const CORPSE_FADE_AFTER_MS = 2000;
const INSTANT_FLOAT_MS = 600;
const FLOAT_MS = 1100;
/** From this size the map can be pinch-zoomed and panned. */
const ZOOM_FROM_SIZE = 16;
const TAP_SLOP_PX = 10;

const HIGHLIGHT_STYLE: Record<HighlightKind, { fill?: number; alpha?: number; stroke?: number; width?: number; strokeAlpha?: number }> = {
  zone: { alpha: 0.38 },
  move: { fill: 0xffffff, alpha: 0.3, stroke: 0xffffff, width: 2, strokeAlpha: 0.75 },
  attack: { fill: 0xe2574c, alpha: 0.4, stroke: 0xb8241a, width: 4 },
  shoot: { fill: 0xf39a3c, alpha: 0.4, stroke: 0xc0620c, width: 4 },
  ability: { fill: 0x5fbf7a, alpha: 0.4, stroke: 0x2f8a4a, width: 4 },
  from: { fill: 0xd9a64b, alpha: 0.45, stroke: 0x8a6a33, width: 2 },
  chosen: { stroke: 0xffffff, width: 6 },
  selected: { stroke: 0xd9a64b, width: 6 },
  actable: { stroke: 0xd9a64b, width: 3, strokeAlpha: 0.85 },
};

/**
 * PixiJS v8 battle scene (plan §8): map layer, highlight overlay, walls, units sorted by row,
 * effects on top. One `Application` per battle screen.
 */
export class PixiBattleRenderer implements BattleRenderer {
  private app: Application | null = null;
  private map!: BuiltMap;
  private readonly world = new Container();
  private readonly overlay = new Graphics();
  private readonly wallLayer = new Graphics();
  private readonly units = new Container({ sortableChildren: true });
  private readonly effects = new Container({ sortableChildren: true });
  private readonly views = new Map<string, UnitView>();
  private readonly atlases = new Map<RaceId, RaceAtlas>();
  private projectiles: ProjectileAtlas = { animations: {} };
  private readonly raceOfSeat = new Map<number, RaceId>();
  private readonly facingOfSeat = new Map<number, 1 | -1>();
  private tapCallback: ((cell: Cell) => void) | null = null;
  private speed = 1;
  private instant = false;
  private destroyed = false;
  private resizeObserver: ResizeObserver | null = null;
  private host: HTMLElement | null = null;
  private zoom = 1;
  private pan = { x: 0, y: 0 };
  private readonly pointers = new Map<number, { x: number; y: number; startX: number; startY: number }>();
  private pinchStart: { distance: number; zoom: number } | null = null;

  constructor(private readonly loader = new AtlasLoader()) {}

  async mount(host: HTMLElement, map: BuiltMap, sides: readonly SceneSide[]): Promise<void> {
    this.map = map;
    this.host = host;
    for (const side of sides) this.raceOfSeat.set(side.seat, side.raceId);
    const races = [...new Set(sides.map((side) => side.raceId))];
    const app = new Application();
    const [texture, atlases, projectiles] = await Promise.all([
      mapTexture(map, CELL),
      Promise.all(races.map((raceId) => this.loader.race(raceId))),
      this.loader.projectiles(),
      app.init({
        resizeTo: host,
        backgroundAlpha: 0,
        antialias: true,
        autoDensity: true,
        resolution: Math.min(2, globalThis.devicePixelRatio || 1),
      }),
    ]);
    if (this.destroyed) {
      app.destroy(true, { children: true });
      return;
    }
    this.app = app;
    for (const atlas of atlases) this.atlases.set(atlas.raceId, atlas);
    this.projectiles = projectiles;

    this.world.addChild(new Sprite(texture), this.overlay, this.wallLayer, this.units, this.effects);
    app.stage.addChild(this.world);
    app.canvas.style.touchAction = 'none';
    app.canvas.style.display = 'block';
    host.appendChild(app.canvas);

    app.stage.eventMode = 'static';
    app.stage.hitArea = app.screen;
    app.stage.on('pointerdown', (event) => this.onPointerDown(event));
    app.stage.on('globalpointermove', (event) => this.onPointerMove(event));
    app.stage.on('pointerup', (event) => this.onPointerUp(event));
    app.stage.on('pointerupoutside', (event) => this.onPointerUp(event, false));
    app.canvas.addEventListener('wheel', this.onWheel, { passive: false });

    this.resizeObserver = new ResizeObserver(() => this.layout());
    this.resizeObserver.observe(host);
    this.layout();
  }

  setStacks(stacks: readonly StackView[], walls: readonly SceneWall[] = []): void {
    if (!this.app) return;
    this.learnFacing(stacks);
    const seen = new Set<string>();
    for (const stack of stacks) {
      seen.add(stack.id);
      let view = this.views.get(stack.id);
      if (!view) {
        const atlas = this.atlases.get(this.raceOfSeat.get(stack.seat)!);
        if (!atlas) continue;
        view = new UnitView(atlas, stack, CELL, seatColor(stack.seat));
        view.speed = this.speed;
        this.views.set(stack.id, view);
        this.units.addChild(view);
      }
      if (stack.count > 0) {
        view.alpha = 1;
        view.placeAt(stack.x, stack.y);
        view.face(this.facingOfSeat.get(stack.seat) ?? 1);
        view.visible = true;
        view.setCount(stack.count);
        if (view.animation !== 'idle') view.play('idle');
      } else if (view.animation !== 'death') {
        // corpses stay in the data; on screen they are gone after the fade (plan §9),
        // so a stack still playing its death is left to finish it
        view.visible = false;
        view.setCount(0);
      }
    }
    for (const [id, view] of this.views) {
      if (!seen.has(id)) {
        view.destroy({ children: true });
        this.views.delete(id);
      }
    }
    this.drawWalls(walls);
  }

  highlight(groups: readonly Highlight[]): void {
    const g = this.overlay.clear();
    for (const group of groups) {
      const style = HIGHLIGHT_STYLE[group.kind];
      const fill = group.color ? parseInt(group.color.slice(1), 16) : style.fill;
      for (const { x, y } of group.cells) {
        const inset = group.kind === 'actable' ? 4 : 2;
        g.roundRect(x * CELL + inset, y * CELL + inset, CELL - inset * 2, CELL - inset * 2, 8);
        if (fill !== undefined) g.fill({ color: fill, alpha: style.alpha ?? 0.3 });
        if (style.stroke !== undefined) g.stroke({ color: style.stroke, width: style.width ?? 2, alpha: style.strokeAlpha ?? 1 });
      }
    }
  }

  onCellTap(callback: (cell: Cell) => void): void {
    this.tapCallback = callback;
  }

  setSpeed(speed: number): void {
    this.speed = speed;
    for (const view of this.views.values()) view.speed = speed;
  }

  setInstant(instant: boolean): void {
    this.instant = instant;
  }

  async play(event: GameEvent): Promise<void> {
    if (!this.app) return;
    const ticker = this.app.ticker;
    const actor = event.stackId ? this.views.get(event.stackId) : undefined;
    const target = event.targetId ? this.views.get(event.targetId) : undefined;
    switch (event.type) {
      case 'moved':
        if (actor && event.path) await this.walk(actor, event.path);
        return;
      case 'attacked':
      case 'retaliated':
        if (actor && target) await this.attack(actor, target);
        return;
      case 'shot':
        if (actor && target) await this.shoot(actor, target);
        return;
      case 'damaged':
        if (actor) await this.damaged(actor, event);
        return;
      case 'stackDied':
        if (actor) await this.die(actor);
        return;
      case 'healed':
      case 'resurrected':
        if (actor) {
          this.float(actor, `+${event.amount}`, 'heal');
          await this.pause(350);
        }
        return;
      case 'raised':
        if (actor) {
          actor.visible = true;
          actor.setCount(actor.count + (event.amount ?? 0));
          this.float(actor, `+${event.amount}`, 'heal');
          await this.pause(350);
        }
        return;
      case 'heroAbility':
        await this.heroFlash(event);
        return;
      case 'wallBuilt':
        if (event.cells) this.drawWalls(event.cells, true);
        await this.pause(300);
        return;
      default: {
        const text = floatCopy(event);
        if (actor && text) {
          this.float(actor, text, 'note');
          await this.pause(event.type === 'abilityUsed' ? 450 : 300);
        }
      }
    }
  }

  destroy(): void {
    this.destroyed = true;
    this.resizeObserver?.disconnect();
    if (this.app) {
      this.app.canvas.removeEventListener('wheel', this.onWheel);
      this.app.destroy(true, { children: true });
      this.app = null;
    }
    this.views.clear();
  }

  // ---------- animations ----------

  private async walk(view: UnitView, path: readonly Cell[]): Promise<void> {
    const steps = path.slice(1);
    const last = path[path.length - 1];
    if (this.instant || !steps.length) {
      view.placeAt(last.x, last.y);
      return;
    }
    view.play('walk');
    let from = path[0];
    for (const step of steps) {
      if (step.x !== from.x) view.face(step.x > from.x ? 1 : -1);
      const start = { x: view.x, y: view.y };
      const end = { x: (step.x + 0.5) * CELL, y: (step.y + 0.86) * CELL };
      view.zIndex = Math.max(from.y, step.y) * 10 + 1;
      await tween(this.ticker, MOVE_MS_PER_CELL / this.speed, (t) => {
        view.position.set(start.x + (end.x - start.x) * t, start.y + (end.y - start.y) * t);
      });
      from = step;
    }
    view.placeAt(last.x, last.y);
    view.play('idle');
  }

  /** Resolves on the hit frame; the attack animation finishes on its own. */
  private attack(attacker: UnitView, target: UnitView): Promise<void> {
    this.faceTowards(attacker, target);
    if (this.instant) return Promise.resolve();
    return new Promise((resolve) => {
      const hitFrame = attacker.meta('attack').hitFrame ?? Math.floor(attacker.frameCount('attack') / 2);
      attacker.play('attack', { frame: hitFrame, onFrame: resolve });
    });
  }

  /** Resolves on impact. */
  private shoot(shooter: UnitView, target: UnitView): Promise<void> {
    this.faceTowards(shooter, target);
    if (this.instant) return Promise.resolve();
    const meta = shooter.meta('shoot');
    const anim = shooter.frameCount('shoot') > 0 && meta.releaseFrame !== undefined ? 'shoot' : 'attack';
    return new Promise((resolve) => {
      shooter.play(anim, {
        frame: meta.releaseFrame ?? 2,
        onFrame: () => {
          const origin = meta.projectileOrigin ? shooter.canvasPoint(meta.projectileOrigin) : shooter.centre;
          void flyProjectile(this.effects, this.ticker, this.projectiles, meta.projectile, origin, target.centre, CELL, PROJECTILE_CELLS_PER_S * this.speed).then(resolve);
        },
      });
    });
  }

  private async damaged(view: UnitView, event: GameEvent): Promise<void> {
    const remaining = Math.max(0, view.count - (event.kills ?? 0));
    this.float(view, `−${event.amount}`, 'damage');
    view.setCount(remaining);
    if (this.instant) return;
    if (remaining > 0) {
      view.play('hit');
      await this.pause(Math.min(view.duration('hit') * this.speed, 350));
    } else {
      await this.pause(120);
    }
  }

  private async die(view: UnitView): Promise<void> {
    view.setCount(0);
    if (this.instant) {
      view.visible = false;
      return;
    }
    await new Promise<void>((resolve) => view.play('death', { onComplete: resolve }));
    // the corpse fades out after 2 s, without holding the queue
    void wait(this.ticker, CORPSE_FADE_AFTER_MS / this.speed)
      .then(() => tween(this.ticker, 400, (t) => (view.alpha = 1 - t)))
      .then(() => {
        if (view.count === 0 && !view.destroyed) view.visible = false;
      });
  }

  private async heroFlash(event: GameEvent): Promise<void> {
    const cells: Cell[] = [];
    if (event.cell) {
      for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) cells.push({ x: event.cell.x + dx, y: event.cell.y + dy });
    }
    const target = event.targetId ? this.views.get(event.targetId) : undefined;
    if (target) cells.push(this.cellOf(target));
    if (!cells.length) return this.pause(250);
    const flash = new Graphics();
    for (const { x, y } of cells) flash.rect(x * CELL, y * CELL, CELL, CELL).fill({ color: 0xc58bff, alpha: 0.55 });
    flash.zIndex = 99_999;
    this.effects.addChild(flash);
    await tween(this.ticker, this.instant ? 0 : 600 / this.speed, (t) => (flash.alpha = 1 - t));
    flash.destroy();
  }

  private float(view: UnitView, text: string, kind: FloatKind): void {
    const at = { x: view.x, y: view.y - CELL * 0.75 };
    floatText(this.effects, this.ticker, text, at, kind, CELL, this.instant ? INSTANT_FLOAT_MS : FLOAT_MS / this.speed);
  }

  private pause(ms: number): Promise<void> {
    return this.instant ? Promise.resolve() : wait(this.ticker, ms / this.speed);
  }

  private faceTowards(view: UnitView, target: UnitView): void {
    if (Math.abs(target.x - view.x) > 1) view.face(target.x > view.x ? 1 : -1);
  }

  private cellOf(view: UnitView): Cell {
    return { x: Math.floor(view.x / CELL), y: Math.floor(view.y / CELL) };
  }

  private get ticker() {
    return this.app!.ticker;
  }

  /** Seats on the right half of the map face left (plan §8); learnt from where they first stand. */
  private learnFacing(stacks: readonly StackView[]): void {
    const bySeat = new Map<number, number[]>();
    for (const stack of stacks) {
      if (this.facingOfSeat.has(stack.seat)) continue;
      bySeat.set(stack.seat, [...(bySeat.get(stack.seat) ?? []), stack.x]);
    }
    for (const [seat, xs] of bySeat) {
      const mean = xs.reduce((sum, x) => sum + x, 0) / xs.length;
      this.facingOfSeat.set(seat, mean > (this.map.size - 1) / 2 ? -1 : 1);
    }
  }

  private drawWalls(walls: readonly Cell[], add = false): void {
    const g = add ? this.wallLayer : this.wallLayer.clear();
    for (const { x, y } of walls) {
      g.roundRect(x * CELL + 4, y * CELL + 6, CELL - 8, CELL - 10, 6)
        .fill({ color: 0x8f8b85 })
        .stroke({ color: 0x1d1622, width: 2 });
      g.moveTo(x * CELL + 8, y * CELL + CELL / 2).lineTo(x * CELL + CELL - 8, y * CELL + CELL / 2).stroke({ color: 0x5f5b55, width: 2 });
    }
  }

  // ---------- fit, zoom, input ----------

  private layout(): void {
    if (!this.app || !this.host) return;
    const { width, height } = this.app.screen;
    const worldSize = this.map.size * CELL;
    const fit = Math.min(width, height) / worldSize;
    const scale = fit * this.zoom;
    const scaled = worldSize * scale;
    // keep the map on screen: centred when it fits, clamped when zoomed in
    const clamp = (value: number, size: number, view: number) =>
      size <= view ? (view - size) / 2 : Math.min(0, Math.max(view - size, value));
    this.pan.x = clamp(this.pan.x, scaled, width);
    this.pan.y = clamp(this.pan.y, scaled, height);
    this.world.scale.set(scale);
    this.world.position.set(this.pan.x, this.pan.y);
  }

  private get canZoom(): boolean {
    return this.map.size >= ZOOM_FROM_SIZE;
  }

  private onPointerDown(event: FederatedPointerEvent): void {
    this.pointers.set(event.pointerId, { x: event.global.x, y: event.global.y, startX: event.global.x, startY: event.global.y });
    if (this.pointers.size === 2 && this.canZoom) {
      const [a, b] = [...this.pointers.values()];
      this.pinchStart = { distance: Math.hypot(a.x - b.x, a.y - b.y), zoom: this.zoom };
    }
  }

  private onPointerMove(event: FederatedPointerEvent): void {
    const pointer = this.pointers.get(event.pointerId);
    if (!pointer) return;
    const dx = event.global.x - pointer.x;
    const dy = event.global.y - pointer.y;
    pointer.x = event.global.x;
    pointer.y = event.global.y;
    if (this.pointers.size === 2 && this.pinchStart) {
      const [a, b] = [...this.pointers.values()];
      const distance = Math.hypot(a.x - b.x, a.y - b.y);
      this.zoomAt((a.x + b.x) / 2, (a.y + b.y) / 2, (this.pinchStart.zoom * distance) / this.pinchStart.distance);
    } else if (this.pointers.size === 1 && this.zoom > 1) {
      this.pan.x += dx;
      this.pan.y += dy;
      this.layout();
    }
  }

  private onPointerUp(event: FederatedPointerEvent, inside = true): void {
    const pointer = this.pointers.get(event.pointerId);
    this.pointers.delete(event.pointerId);
    if (this.pointers.size < 2) this.pinchStart = null;
    if (!pointer || !inside || this.pointers.size > 0) return;
    const moved = Math.hypot(event.global.x - pointer.startX, event.global.y - pointer.startY);
    if (moved > TAP_SLOP_PX) return;
    const local = this.world.toLocal(event.global);
    const cell = { x: Math.floor(local.x / CELL), y: Math.floor(local.y / CELL) };
    if (cell.x >= 0 && cell.y >= 0 && cell.x < this.map.size && cell.y < this.map.size) this.tapCallback?.(cell);
  }

  private readonly onWheel = (event: WheelEvent): void => {
    if (!this.canZoom || !this.app) return;
    event.preventDefault();
    const rect = this.app.canvas.getBoundingClientRect();
    this.zoomAt(event.clientX - rect.left, event.clientY - rect.top, this.zoom * (event.deltaY < 0 ? 1.15 : 1 / 1.15));
  };

  private zoomAt(screenX: number, screenY: number, zoom: number): void {
    const next = Math.min(3, Math.max(1, zoom));
    const before = this.world.toLocal({ x: screenX, y: screenY });
    this.zoom = next;
    this.layout();
    const after = this.world.toGlobal(before);
    this.pan.x += screenX - after.x;
    this.pan.y += screenY - after.y;
    this.layout();
  }
}
