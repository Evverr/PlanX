import type { Editor } from '../editor/editor';
import type { Point } from '../canvas/geometry';

/** How long a pill takes to grow or go back, in ms. */
const MS = 140;
/** How far each pill has grown (0…1), by its handle, and when that was. */
const grown = new Map<string, { v: number; t: number }>();

/**
 * A gap's pill ("Авторасположение"), at screen scale, 4 across and 16 along: under the pointer or being
 * dragged it takes its colour and grows, twice as thick and 1.3 times as long; both come and go smoothly.
 */
export function drawGapPill(ctx: CanvasRenderingContext2D, ed: Editor, key: string, m: Point, axis: 'col' | 'row', on: boolean, color: string): void {
  // (No frames while nothing moved: the time since is held short, or a pill at rest would jump.)
  const now = performance.now(), was = grown.get(key), dt = was ? Math.min(now - was.t, 34) : 0;
  const v = on ? Math.min(1, (was?.v ?? 0) + dt / MS) : Math.max(0, (was?.v ?? 0) - dt / MS);
  if (on || v > 0) grown.set(key, { v, t: now }); else grown.delete(key);
  if (v !== (on ? 1 : 0)) ed.requestRender();
  const k = v * v * (3 - 2 * v), across = 4 * (1 + k), along = 16 * (1 + 0.3 * k), [w, h] = axis === 'col' ? [across, along] : [along, across];
  ctx.beginPath();
  ctx.roundRect(m.x - w / 2, m.y - h / 2, w, h, across / 2);
  ctx.globalAlpha = 1;
  ctx.fillStyle = '#fff';
  ctx.fill();
  ctx.globalAlpha = k;
  ctx.fillStyle = color;
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.5;
  ctx.stroke();
}
