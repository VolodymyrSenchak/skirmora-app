import { AnimatedSprite, Container, Graphics, Text } from 'pixi.js';
import type { StackView } from '../../models';
import { AnimMeta, AnimName, animMeta, RaceAtlas } from './atlas-loader';

export interface PlayOptions {
  /** Called once when `frame` is reached (hitFrame / releaseFrame). */
  frame?: number;
  onFrame?: () => void;
  onComplete?: () => void;
}

/**
 * One stack on the field (plan §8): the animated sprite on its anchor (0.5, 0.777), a seat-coloured
 * ring under the feet and a count badge. The atlas has no team colour, so the ring is what tells
 * two players of the same race apart.
 */
export class UnitView extends Container {
  readonly stackId: string;
  readonly unitId: string;
  private readonly sprite: AnimatedSprite;
  private readonly ring = new Graphics();
  private readonly badge = new Container();
  private readonly badgeBg = new Graphics();
  private readonly badgeText: Text;
  private current: AnimName = 'idle';
  private badgeColor = '#000000';
  private facing: 1 | -1 = 1;
  private readonly baseScale: number;
  count: number;
  speed = 1;

  constructor(
    private readonly atlas: RaceAtlas,
    stack: StackView,
    private readonly cellPx: number,
    color: string,
  ) {
    super();
    this.stackId = stack.id;
    this.unitId = stack.unitId;
    this.count = stack.count;
    // the atlas is drawn for a 128 px nominal frame; 128 px = 1.4 cells
    this.baseScale = (cellPx * 1.4) / atlas.meta.nominalSize;

    const rx = cellPx * 0.36;
    this.ring
      .ellipse(0, 0, rx, rx * 0.38)
      .fill({ color, alpha: 0.35 })
      .stroke({ color, width: 2.5, alpha: 0.95 });
    this.addChild(this.ring);

    this.sprite = new AnimatedSprite(this.frames('idle'));
    this.sprite.anchor.set(atlas.meta.anchor.x, atlas.meta.anchor.y);
    this.sprite.scale.set(this.baseScale);
    this.addChild(this.sprite);

    this.badgeText = new Text({
      text: String(stack.count),
      style: { fontFamily: 'JetBrains Mono, monospace', fontSize: Math.round(cellPx * 0.22), fontWeight: '700', fill: 0xffffff },
    });
    this.badgeText.anchor.set(0.5);
    this.badge.addChild(this.badgeBg, this.badgeText);
    this.badge.position.set(cellPx * 0.3, cellPx * 0.05);
    this.addChild(this.badge);
    this.badgeColor = color;
    this.setCount(stack.count);
    this.play('idle');
  }

  /** Bottom centre of the cell. */
  placeAt(x: number, y: number): void {
    this.position.set((x + 0.5) * this.cellPx, (y + 0.86) * this.cellPx);
    this.zIndex = y * 10 + 1;
  }

  face(direction: 1 | -1): void {
    this.facing = direction;
    this.sprite.scale.x = this.baseScale * direction;
  }

  get direction(): 1 | -1 {
    return this.facing;
  }

  setCount(count: number): void {
    this.count = count;
    this.badgeText.text = String(count);
    const w = Math.max(this.cellPx * 0.3, this.badgeText.width + 8);
    const h = this.badgeText.height + 2;
    this.badgeBg.clear().roundRect(-w / 2, -h / 2, w, h, 4).fill({ color: this.badgeColor }).stroke({ color: 0x000000, alpha: 0.5, width: 1 });
    this.badge.visible = count > 0;
    this.ring.visible = count > 0;
  }

  meta(anim: AnimName): AnimMeta {
    return animMeta(this.atlas, this.unitId, anim);
  }

  frameCount(anim: AnimName): number {
    return this.frames(anim).length;
  }

  /** Duration of one pass in ms at the current speed. */
  duration(anim: AnimName): number {
    return (this.frameCount(anim) / this.meta(anim).fps / this.speed) * 1000;
  }

  play(anim: AnimName, options: PlayOptions = {}): void {
    const meta = this.meta(anim);
    this.current = anim;
    this.sprite.textures = this.frames(anim);
    this.sprite.animationSpeed = (meta.fps / 60) * this.speed;
    this.sprite.loop = meta.loop;
    let fired = false;
    this.sprite.onFrameChange = (frame) => {
      if (!fired && options.frame !== undefined && frame >= options.frame) {
        fired = true;
        options.onFrame?.();
      }
    };
    this.sprite.onComplete = () => {
      if (!fired && options.frame !== undefined) {
        fired = true;
        options.onFrame?.();
      }
      if (meta.holdLast) {
        this.sprite.gotoAndStop(this.sprite.totalFrames - 1);
      } else if (this.current === anim) {
        this.play('idle');
      }
      options.onComplete?.();
    };
    this.sprite.gotoAndPlay(0);
  }

  /** Last frame of the death animation, no tween (after a gap). */
  showDead(): void {
    this.current = 'death';
    this.sprite.textures = this.frames('death');
    this.sprite.gotoAndStop(this.sprite.totalFrames - 1);
    this.setCount(0);
  }

  get animation(): AnimName {
    return this.current;
  }

  /** The 224-canvas point (projectileOrigin) in the parent's coordinates. */
  canvasPoint(point: { x: number; y: number }): { x: number; y: number } {
    const { frameSize, anchor } = this.atlas.meta;
    const scale = this.baseScale;
    return {
      x: this.x + (point.x - frameSize * anchor.x) * scale * this.facing,
      y: this.y + (point.y - frameSize * anchor.y) * scale,
    };
  }

  /** Roughly the middle of the body, for damage numbers and projectile impacts. */
  get centre(): { x: number; y: number } {
    return { x: this.x, y: this.y - this.cellPx * 0.4 };
  }

  private frames(anim: AnimName) {
    return (
      this.atlas.animations[`${this.unitId}/${anim}`] ??
      this.atlas.animations[`${this.unitId}/idle`] ??
      (() => {
        throw new Error(`Atlas ${this.atlas.raceId}: no ${this.unitId}/${anim}`);
      })()
    );
  }
}
