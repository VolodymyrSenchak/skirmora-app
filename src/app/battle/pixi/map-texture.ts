import { Texture } from 'pixi.js';
import type { BuiltMap, PlacedObject } from '../../engine/engine/grid';
import type { Cell } from '../../models';

// Port of design/art/maps-render.js: ground, grid and obstacles as one SVG. The battle rasterises it
// once into a texture (plan §8); previews (create, lobby, deploy) use the SVG as is.

const OUT = '#1d1622';
const THEMES: Record<string, [string, string]> = {
  sand: ['#d6bd88', '#cfb47f'],
  grass: ['#86b45e', '#7dab57'],
  farm: ['#a9bb66', '#a0b25e'],
  dead: ['#7a8267', '#737a60'],
  ash: ['#4e4442', '#473d3b'],
  snow: ['#e6edf1', '#dce5eb'],
  village: ['#93b866', '#8aaf5f'],
};

const st = (f: string, w = 1.6) => `fill="${f}" stroke="${OUT}" stroke-width="${w}" stroke-linejoin="round"`;

function obstacle(o: PlacedObject, C: number, theme: string): string {
  const X = o.x * C,
    Y = o.y * C,
    w = o.w * C,
    h = o.h * C,
    cx = X + w / 2,
    cy = Y + h / 2;
  const k = C / 24;
  const sh = (rx: number, ry: number, dy = 0) =>
    `<ellipse cx="${cx}" cy="${Y + h - 3 * k + dy}" rx="${rx}" ry="${ry}" fill="#000" opacity="0.22"/>`;
  switch (o.t) {
    case 'rock':
      return sh(9 * k, 3 * k) + `<path d="M${X + 4 * k},${Y + h - 5 * k} L${X + 6 * k},${Y + 9 * k} L${X + 12 * k},${Y + 4 * k} L${X + 19 * k},${Y + 8 * k} L${X + 21 * k},${Y + h - 5 * k} Z" ${st('#8f8b85')}/><path d="M${X + 8 * k},${Y + 9 * k} L${X + 12 * k},${Y + 6 * k} L${X + 15 * k},${Y + 9 * k}" fill="none" stroke="#c9c5bd" stroke-width="${1.6 * k}"/>`;
    case 'obsidian':
      return sh(9 * k, 3 * k) + `<path d="M${X + 4 * k},${Y + h - 4 * k} L${X + 7 * k},${Y + 6 * k} L${X + 11 * k},${Y + 12 * k} L${X + 15 * k},${Y + 2 * k} L${X + 20 * k},${Y + h - 4 * k} Z" ${st('#3a2a4a')}/><path d="M${X + 15 * k},${Y + 3 * k} L${X + 14 * k},${Y + 16 * k}" stroke="#8a6ab0" stroke-width="${1.4 * k}"/>`;
    case 'tree':
      return (
        sh(10 * k, 3.5 * k) +
        `<rect x="${cx - 2.5 * k}" y="${Y + 12 * k}" width="${5 * k}" height="${9 * k}" ${st('#6b4423')}/>` +
        `<circle cx="${cx - 4 * k}" cy="${Y + 10 * k}" r="${6.5 * k}" ${st('#3f8a3a')}/><circle cx="${cx + 4 * k}" cy="${Y + 10 * k}" r="${6.5 * k}" ${st('#3a7f35')}/><circle cx="${cx}" cy="${Y + 5.5 * k}" r="${6.5 * k}" ${st('#4a9a42')}/><circle cx="${cx - 2 * k}" cy="${Y + 4 * k}" r="${2 * k}" fill="#8fd06a"/>`
      );
    case 'pine':
      return (
        sh(9 * k, 3 * k) +
        `<rect x="${cx - 2 * k}" y="${Y + 17 * k}" width="${4 * k}" height="${5 * k}" ${st('#5a3a1a')}/>` +
        [0, 1, 2]
          .map(
            (i) =>
              `<path d="M${cx},${Y + (1 + i * 5) * k} L${cx + (6 + i * 2.5) * k},${Y + (9 + i * 5) * k} L${cx - (6 + i * 2.5) * k},${Y + (9 + i * 5) * k} Z" ${st('#2f6a45')}/>`,
          )
          .join('') +
        (theme === 'snow'
          ? `<path d="M${cx},${Y + 1 * k} L${cx + 3 * k},${Y + 5 * k} L${cx - 3 * k},${Y + 5 * k} Z" fill="#fff"/>`
          : '')
      );
    case 'deadtree': {
      const d = `M${cx},${Y + h - 3 * k} L${cx},${Y + 8 * k} M${cx},${Y + 13 * k} L${cx - 7 * k},${Y + 5 * k} M${cx},${Y + 10 * k} L${cx + 7 * k},${Y + 3 * k} M${cx - 4 * k},${Y + 9 * k} L${cx - 8 * k},${Y + 9 * k}`;
      return (
        sh(8 * k, 3 * k) +
        `<path d="${d}" fill="none" stroke="${OUT}" stroke-width="${4 * k}" stroke-linecap="round"/>` +
        `<path d="${d}" fill="none" stroke="#6a5a4a" stroke-width="${2 * k}" stroke-linecap="round"/>`
      );
    }
    case 'bush':
      return (
        sh(9 * k, 2.5 * k) +
        `<circle cx="${cx - 5 * k}" cy="${cy + 3 * k}" r="${5 * k}" ${st('#4f9a3a')}/><circle cx="${cx + 5 * k}" cy="${cy + 3 * k}" r="${5 * k}" ${st('#468f34')}/><circle cx="${cx}" cy="${cy - 1 * k}" r="${5.5 * k}" ${st('#58a842')}/>` +
        `<circle cx="${cx + 2 * k}" cy="${cy - 2 * k}" r="${1.4 * k}" fill="#d9534a"/><circle cx="${cx - 5 * k}" cy="${cy + 2 * k}" r="${1.4 * k}" fill="#d9534a"/>`
      );
    case 'grave':
      return (
        sh(7 * k, 2.5 * k) +
        `<path d="M${cx - 6 * k},${Y + h - 3 * k} L${cx - 6 * k},${Y + 9 * k} Q${cx},${Y + 2 * k} ${cx + 6 * k},${Y + 9 * k} L${cx + 6 * k},${Y + h - 3 * k} Z" ${st('#a9a8a0')}/>` +
        `<path d="M${cx},${Y + 8 * k} L${cx},${Y + 16 * k} M${cx - 3 * k},${Y + 11 * k} L${cx + 3 * k},${Y + 11 * k}" stroke="#5a5a55" stroke-width="${1.6 * k}"/>`
      );
    case 'water':
      return (
        `<rect x="${X}" y="${Y}" width="${w}" height="${h}" fill="#4a8fd0"/><g class="water">` +
        Array.from({ length: o.w * o.h }, (_, i) => {
          const xx = X + (i % o.w) * C,
            yy = Y + Math.floor(i / o.w) * C;
          return `<path d="M${xx + 3 * k},${yy + 9 * k} q3,-3 6,0 t6,0 M${xx + 6 * k},${yy + 17 * k} q3,-3 6,0 t6,0" fill="none" stroke="#a9d6ff" stroke-width="${1.3 * k}" stroke-linecap="round"/>`;
        }).join('') +
        '</g>'
      );
    case 'lava':
      return (
        `<rect x="${X}" y="${Y}" width="${w}" height="${h}" fill="#e8541a"/><g class="lava"><rect x="${X}" y="${Y}" width="${w}" height="${h}" fill="#ffb03a" opacity="0.5"/></g>` +
        Array.from({ length: o.w * o.h }, (_, i) => {
          const xx = X + (i % o.w) * C,
            yy = Y + Math.floor(i / o.w) * C;
          return `<path d="M${xx + 3 * k},${yy + 5 * k} l5,2 l2,5 l-6,1 Z M${xx + 15 * k},${yy + 14 * k} l5,1 l1,5 l-5,0 Z" fill="#5a1a0a" opacity="0.75"/>`;
        }).join('')
      );
    case 'hay':
      return (
        sh(10 * k, 3 * k) +
        `<path d="M${X + 3 * k},${Y + h - 4 * k} Q${X + 4 * k},${Y + 5 * k} ${cx},${Y + 4 * k} Q${X + w - 4 * k},${Y + 5 * k} ${X + w - 3 * k},${Y + h - 4 * k} Z" ${st('#e2c25a')}/>` +
        `<path d="M${cx - 5 * k},${Y + 9 * k} l-1,9 M${cx},${Y + 7 * k} l0,11 M${cx + 5 * k},${Y + 9 * k} l1,9" stroke="#b08a30" stroke-width="${1.2 * k}"/>`
      );
    case 'well': {
      const r = Math.min(w, h) / 2 - 3 * k;
      return (
        sh(r, r / 3, 2 * k) +
        `<circle cx="${cx}" cy="${cy + 2 * k}" r="${r}" ${st('#a8a49a')}/><circle cx="${cx}" cy="${cy + 2 * k}" r="${r * 0.62}" fill="#3a78b8" stroke="${OUT}" stroke-width="1.2"/>` +
        `<path d="M${cx - r},${cy - r * 0.6} L${cx},${cy - r * 1.3} L${cx + r},${cy - r * 0.6} Z" ${st('#a0442a')}/><path d="M${cx - r * 0.8},${cy - r * 0.6} L${cx - r * 0.8},${cy + 2 * k} M${cx + r * 0.8},${cy - r * 0.6} L${cx + r * 0.8},${cy + 2 * k}" stroke="${OUT}" stroke-width="${2 * k}"/>`
      );
    }
    case 'fence':
      return (
        `<path d="M${X + 1 * k},${cy - 3 * k} L${X + w - 1 * k},${cy - 3 * k} M${X + 1 * k},${cy + 3 * k} L${X + w - 1 * k},${cy + 3 * k}" stroke="${OUT}" stroke-width="${3.4 * k}"/><path d="M${X + 1 * k},${cy - 3 * k} L${X + w - 1 * k},${cy - 3 * k} M${X + 1 * k},${cy + 3 * k} L${X + w - 1 * k},${cy + 3 * k}" stroke="#a07040" stroke-width="${1.8 * k}"/>` +
        [4, 12, 20]
          .map((d) => `<rect x="${X + d * k - 1.5 * k}" y="${cy - 8 * k}" width="${3 * k}" height="${15 * k}" ${st('#8a5a2b', 1.2)}/>`)
          .join('')
      );
    case 'pillar':
      return (
        `<ellipse cx="${cx + 3 * k}" cy="${Y + h - 3 * k}" rx="${10 * k}" ry="${3.5 * k}" fill="#000" opacity="0.3"/><rect x="${X + 4 * k}" y="${Y + h - 6 * k}" width="${w - 8 * k}" height="${4 * k}" ${st('#cfc6b0')}/>` +
        `<rect x="${X + 7 * k}" y="${Y - 6 * k}" width="${w - 14 * k}" height="${h}" ${st('#e2dac4')}/><path d="M${X + 10 * k},${Y - 4 * k} L${X + 10 * k},${Y + h - 7 * k} M${X + 14 * k},${Y - 4 * k} L${X + 14 * k},${Y + h - 7 * k}" stroke="#b8ae96" stroke-width="${1.2 * k}"/>` +
        `<rect x="${X + 4 * k}" y="${Y - 9 * k}" width="${w - 8 * k}" height="${4 * k}" ${st('#cfc6b0')}/>`
      );
    case 'house':
    case 'mill': {
      let s =
        `<rect x="${X + 3 * k}" y="${Y + h * 0.45}" width="${w - 6 * k}" height="${h * 0.5}" ${st('#dccaa2')}/>` +
        `<path d="M${X},${Y + h * 0.5} L${X + w * 0.5},${Y + 2 * k} L${X + w},${Y + h * 0.5} Z" ${st(o.t === 'mill' ? '#8a5a3a' : '#a8452a')}/>` +
        `<path d="M${X + w * 0.5},${Y + 2 * k} L${X + w * 0.5},${Y + h * 0.5}" stroke="${OUT}" stroke-width="${0.8 * k}" opacity="0.4"/>` +
        `<rect x="${cx - 4 * k}" y="${Y + h - 14 * k}" width="${8 * k}" height="${11 * k}" ${st('#6b4423', 1.2)}/>` +
        `<rect x="${X + 7 * k}" y="${Y + h * 0.58}" width="${7 * k}" height="${6 * k}" ${st('#f4d36a', 1.2)}/><rect x="${X + w - 14 * k}" y="${Y + h * 0.58}" width="${7 * k}" height="${6 * k}" ${st('#f4d36a', 1.2)}/>`;
      if (o.t === 'mill')
        s +=
          `<g transform="translate(${cx} ${Y + h * 0.36})"><g class="mill-blades">` +
          [0, 90, 180, 270]
            .map((a) => `<rect x="${-4 * k}" y="${-h * 0.55}" width="${8 * k}" height="${h * 0.5}" transform="rotate(${a})" ${st('#e8dcc0', 1.2)}/>`)
            .join('') +
          `<circle r="${3 * k}" ${st('#6b4423', 1.2)}/></g></g>`;
      return s;
    }
    case 'crypt':
      return (
        `<rect x="${X + 3 * k}" y="${Y + h * 0.3}" width="${w - 6 * k}" height="${h * 0.66}" ${st('#8f8f96')}/><path d="M${X},${Y + h * 0.34} L${cx},${Y + 3 * k} L${X + w},${Y + h * 0.34} Z" ${st('#6f6f78')}/>` +
        `<path d="M${cx - 7 * k},${Y + h - 3 * k} L${cx - 7 * k},${Y + h * 0.62} Q${cx},${Y + h * 0.48} ${cx + 7 * k},${Y + h * 0.62} L${cx + 7 * k},${Y + h - 3 * k} Z" fill="#1a1520" stroke="${OUT}" stroke-width="1.2"/>` +
        `<path d="M${cx},${Y - 4 * k} L${cx},${Y + 8 * k} M${cx - 4 * k},${Y} L${cx + 4 * k},${Y}" stroke="#c9c5bd" stroke-width="${2.2 * k}"/><g class="glow"><circle cx="${cx}" cy="${Y + h * 0.75}" r="${3 * k}" fill="#6cf09a" opacity="0.7"/></g>`
      );
    case 'mountain': {
      const peaks: [number, number][] = [];
      for (let i = 0; i < o.w; i++) for (let j = 0; j < o.h; j++) peaks.push([X + i * C + C / 2, Y + j * C + C / 2]);
      return (
        `<rect x="${X + 1}" y="${Y + 1}" width="${w - 2}" height="${h - 2}" rx="${6 * k}" fill="#6f6a66" opacity="0.55"/>` +
        peaks
          .map(
            ([px, py], i) =>
              `<path d="M${px - 13 * k},${py + 11 * k} L${px - 1 * k},${py - 14 * k - (i % 2) * 3 * k} L${px + 13 * k},${py + 11 * k} Z" ${st(i % 2 ? '#8a847e' : '#7b756f')}/>` +
              `<path d="M${px - 5 * k},${py - 5 * k - (i % 2) * 2 * k} L${px - 1 * k},${py - 14 * k - (i % 2) * 3 * k} L${px + 4 * k},${py - 5 * k - (i % 2) * 2 * k} L${px},${py - 7 * k} Z" fill="#f4f8fa"/>`,
          )
          .join('')
      );
    }
    case 'ruin':
      return (
        sh(10 * k, 3 * k) +
        `<rect x="${X + 3 * k}" y="${Y + 6 * k}" width="${7 * k}" height="${15 * k}" ${st('#c9bfa6')}/><path d="M${X + 3 * k},${Y + 6 * k} l3,-3 l4,3" ${st('#c9bfa6', 1.2)}/>` +
        `<rect x="${X + 13 * k}" y="${Y + 12 * k}" width="${7 * k}" height="${9 * k}" ${st('#bdb39a')}/><circle cx="${X + 19 * k}" cy="${Y + 21 * k}" r="${2 * k}" ${st('#a8a08a', 1)}/>`
      );
    case 'bridge':
      return (
        `<rect x="${X}" y="${Y + 3 * k}" width="${w}" height="${h - 6 * k}" ${st('#a07040')}/>` +
        Array.from(
          { length: o.w * 4 },
          (_, i) => `<path d="M${X + ((i + 0.5) * C) / 4},${Y + 3 * k} L${X + ((i + 0.5) * C) / 4},${Y + h - 3 * k}" stroke="#6b4423" stroke-width="${0.9 * k}"/>`,
        ).join('') +
        `<path d="M${X},${Y + 3 * k} L${X + w},${Y + 3 * k} M${X},${Y + h - 3 * k} L${X + w},${Y + h - 3 * k}" stroke="${OUT}" stroke-width="${2.4 * k}"/>`
      );
    default:
      return `<rect x="${X}" y="${Y}" width="${w}" height="${h}" fill="#888"/>`;
  }
}

export interface MapZone {
  cells: readonly Cell[];
  color: string;
}

export interface MapSvgOptions {
  /** px per cell in the SVG's coordinate system. */
  cell?: number;
  zones?: readonly MapZone[];
}

/** The map as an SVG string (maps-render.js `renderMap`, over the engine's `BuiltMap`). */
export function mapSvg(map: BuiltMap, options: MapSvgOptions = {}): string {
  const C = options.cell ?? 24;
  const n = map.size,
    S = n * C;
  const theme = map.def.theme;
  const [g1, g2] = THEMES[theme] ?? THEMES['grass'];
  let s = `<svg class="map" viewBox="0 0 ${S} ${S}" width="${S}" height="${S}" xmlns="http://www.w3.org/2000/svg"><rect width="${S}" height="${S}" fill="${g1}"/>`;
  for (let x = 0; x < n; x++)
    for (let y = 0; y < n; y++) if ((x + y) % 2) s += `<rect x="${x * C}" y="${y * C}" width="${C}" height="${C}" fill="${g2}"/>`;
  // water under the bridges
  for (const o of map.objects)
    if (o.t === 'bridge') s += `<rect x="${o.x * C}" y="${o.y * C}" width="${o.w * C}" height="${C}" fill="#4a8fd0"/>`;
  for (const zone of options.zones ?? []) {
    for (const { x, y } of zone.cells)
      s += `<rect x="${x * C + 1}" y="${y * C + 1}" width="${C - 2}" height="${C - 2}" rx="${C * 0.15}" fill="${zone.color}" opacity="0.38"/>`;
  }
  const grid: string[] = [];
  for (let i = 1; i < n; i++) grid.push(`M${i * C},0 V${S} M0,${i * C} H${S}`);
  s += `<path d="${grid.join(' ')}" stroke="#000" stroke-opacity="0.13" stroke-width="1"/>`;
  // flat obstacles first, then the rest by their bottom row, so lower ones cover upper ones
  const flat = new Set(['water', 'lava', 'bridge']);
  for (const o of map.objects.filter((o) => flat.has(o.t))) s += obstacle(o, C, theme);
  for (const o of map.objects.filter((o) => !flat.has(o.t)).sort((a, b) => a.y + a.h - (b.y + b.h))) s += obstacle(o, C, theme);
  return s + '</svg>';
}

/** Draws the map onto a canvas of `size × cellPx` (64 px per cell in the battle). */
export async function rasterizeMap(map: BuiltMap, cellPx = 64, options: Omit<MapSvgOptions, 'cell'> = {}): Promise<HTMLCanvasElement> {
  const svg = mapSvg(map, { ...options, cell: cellPx });
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = map.size * cellPx;
    canvas.getContext('2d')!.drawImage(image, 0, 0);
    return canvas;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** The map rasterised once into a texture (plan §8). */
export async function mapTexture(map: BuiltMap, cellPx = 64): Promise<Texture> {
  return Texture.from(await rasterizeMap(map, cellPx));
}
