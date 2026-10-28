import type { Rng } from '../engine/engine/rng';

function pickWith<T>(int: (max: number) => number, items: readonly T[]): T {
  if (items.length === 0) {
    throw new Error('Cannot pick from an empty list');
  }
  return items[int(items.length)];
}

/** `crypto.getRandomValues`, uniform by rejection: the hot-seat `ctx.rng` (plan §6). */
export const cryptoRng: Rng = {
  int(maxExclusive) {
    if (maxExclusive <= 1) return 0;
    const limit = Math.floor(0x1_0000_0000 / maxExclusive) * maxExclusive;
    const buffer = new Uint32Array(1);
    do {
      crypto.getRandomValues(buffer);
    } while (buffer[0] >= limit);
    return buffer[0] % maxExclusive;
  },
  pick(items) {
    return pickWith((max) => this.int(max), items);
  },
};

/** Deterministic PRNG (mulberry32, as the API's tests use) for tests. */
export function createSeededRng(seed: number): Rng {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const int = (maxExclusive: number) => Math.floor(next() * maxExclusive);
  return { int, pick: (items) => pickWith(int, items) };
}
