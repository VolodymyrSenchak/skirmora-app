import { AnimatedSprite, Container, Text, Ticker } from 'pixi.js';
import type { ProjectileAtlas } from './atlas-loader';

/** Runs `step(t)` with t from 0 to 1 over `ms`, on the app ticker. `ms <= 0` → one step at 1. */
export function tween(ticker: Ticker, ms: number, step: (t: number) => void): Promise<void> {
  if (ms <= 0) {
    step(1);
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    let elapsed = 0;
    const tick = (time: Ticker) => {
      elapsed += time.deltaMS;
      const t = Math.min(1, elapsed / ms);
      step(t);
      if (t >= 1) {
        ticker.remove(tick);
        resolve();
      }
    };
    ticker.add(tick);
  });
}

export function wait(ticker: Ticker, ms: number): Promise<void> {
  return tween(ticker, ms, () => undefined);
}

export type FloatKind = 'damage' | 'heal' | 'note';

const FLOAT_STYLE: Record<FloatKind, { fill: number; size: number }> = {
  damage: { fill: 0xffe27a, size: 0.36 },
  heal: { fill: 0x7dff9a, size: 0.32 },
  note: { fill: 0x9be0ff, size: 0.24 },
};

/**
 * A number or a word that rises and fades over the stack (plan §8). Not awaited: the queue moves
 * on while it floats. In instant mode it still shows for 0.6 s.
 */
export function floatText(
  layer: Container,
  ticker: Ticker,
  text: string,
  at: { x: number; y: number },
  kind: FloatKind,
  cellPx: number,
  durationMs: number,
): void {
  const style = FLOAT_STYLE[kind];
  const label = new Text({
    text,
    style: {
      fontFamily: kind === 'note' ? 'Golos Text, sans-serif' : 'JetBrains Mono, monospace',
      fontWeight: '800',
      fontSize: Math.round(cellPx * style.size),
      fill: style.fill,
      stroke: { color: 0x000000, width: 4 },
    },
  });
  label.anchor.set(0.5, 1);
  label.position.set(at.x, at.y);
  label.zIndex = 100_000;
  layer.addChild(label);
  const rise = cellPx * 0.6;
  void tween(ticker, durationMs, (t) => {
    label.y = at.y - rise * t;
    label.alpha = t < 0.15 ? t / 0.15 : 1 - Math.max(0, (t - 0.6) / 0.4);
  }).then(() => label.destroy());
}

/** Flies a projectile from `from` to `to` at `cellsPerSecond`; resolves on impact. */
export async function flyProjectile(
  layer: Container,
  ticker: Ticker,
  atlas: ProjectileAtlas,
  id: string | undefined,
  from: { x: number; y: number },
  to: { x: number; y: number },
  cellPx: number,
  cellsPerSecond: number,
): Promise<void> {
  const frames = (id && atlas.animations[`${id}/fly`]) || atlas.animations['arrow/fly'];
  if (!frames) return;
  const sprite = new AnimatedSprite(frames);
  sprite.anchor.set(0.5);
  sprite.scale.set(cellPx / 64);
  sprite.animationSpeed = 0.25;
  sprite.play();
  sprite.position.set(from.x, from.y);
  sprite.rotation = Math.atan2(to.y - from.y, to.x - from.x);
  sprite.zIndex = 100_000;
  layer.addChild(sprite);
  const distanceCells = Math.hypot(to.x - from.x, to.y - from.y) / cellPx;
  const arc = cellPx * 0.25 * Math.min(1, distanceCells / 4);
  await tween(ticker, (distanceCells / cellsPerSecond) * 1000, (t) => {
    sprite.x = from.x + (to.x - from.x) * t;
    sprite.y = from.y + (to.y - from.y) * t - Math.sin(Math.PI * t) * arc;
  });
  sprite.destroy();
}
