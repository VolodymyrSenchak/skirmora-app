import { ChangeDetectionStrategy, Component, effect, ElementRef, Injectable, input, viewChild } from '@angular/core';
import { DEFAULT_ATLAS_BASE } from '../battle/pixi/atlas-loader';
import type { RaceId } from '../models';

interface FrameData {
  frame: { x: number; y: number; w: number; h: number };
  spriteSourceSize: { x: number; y: number; w: number; h: number };
  sourceSize: { w: number; h: number };
}

interface PortraitSheet {
  image: HTMLImageElement;
  frames: Record<string, FrameData>;
}

/**
 * Reads a race atlas with plain fetch + <img>, for the shop and the HUD (plan §3 `ui/unit-portrait`):
 * a still frame doesn't need WebGL, and the browser caches the same files the battle loads.
 */
@Injectable({ providedIn: 'root' })
export class PortraitAtlas {
  private readonly sheets = new Map<RaceId, Promise<PortraitSheet>>();

  sheet(raceId: RaceId): Promise<PortraitSheet> {
    let promise = this.sheets.get(raceId);
    if (!promise) {
      promise = this.load(raceId);
      this.sheets.set(raceId, promise);
    }
    return promise;
  }

  private async load(raceId: RaceId): Promise<PortraitSheet> {
    const json = (await (await fetch(`${DEFAULT_ATLAS_BASE}${raceId}.json`)).json()) as {
      frames: Record<string, FrameData>;
      meta: { image: string };
    };
    const image = new Image();
    image.src = DEFAULT_ATLAS_BASE + json.meta.image;
    await image.decode();
    return { image, frames: json.frames };
  }
}

/** The part of the 224 px canvas a portrait shows: the unit and its wings, not the empty margins. */
const CROP = { x: 32, y: 22, size: 160 };

/** `<unit>/idle/0` (or any frame) drawn into a canvas. */
@Component({
  selector: 'app-unit-portrait',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<canvas #canvas [attr.width]="px()" [attr.height]="px()" [attr.aria-label]="label()" role="img"></canvas>`,
  styles: `
    :host { display: block; }
    canvas { width: 100%; height: 100%; display: block; }
  `,
})
export class UnitPortrait {
  readonly raceId = input.required<RaceId>();
  readonly unitId = input.required<string>();
  readonly frame = input('idle/0');
  readonly label = input('');
  /** Backing size in device px. */
  readonly px = input(160);
  private readonly canvas = viewChild.required<ElementRef<HTMLCanvasElement>>('canvas');

  constructor(atlas: PortraitAtlas) {
    effect(() => {
      const key = `${this.unitId()}/${this.frame()}`;
      const canvas = this.canvas().nativeElement;
      const size = this.px();
      void atlas
        .sheet(this.raceId())
        .then(({ image, frames }) => {
          const data = frames[key];
          const ctx = canvas.getContext('2d');
          if (!data || !ctx) return;
          const scale = size / CROP.size;
          ctx.clearRect(0, 0, size, size);
          ctx.drawImage(
            image,
            data.frame.x,
            data.frame.y,
            data.frame.w,
            data.frame.h,
            (data.spriteSourceSize.x - CROP.x) * scale,
            (data.spriteSourceSize.y - CROP.y) * scale,
            data.frame.w * scale,
            data.frame.h * scale,
          );
        })
        .catch(() => undefined);
    });
  }
}
