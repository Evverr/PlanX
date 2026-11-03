import type { Editor } from '../editor/editor';
import type { Point } from '../canvas/geometry';

/** How long a pill takes to grow or go back, in ms. */
const MS = 140;
/** How far each pill has grown (0…1), by its handle, and when that was. */
const grown = new Map<string, { v: number; t: number }>();

/** How far a gap's handle has grown (0…1, smoothly), under the pointer or being dragged, or going back. */
function growth(ed: Editor, key: string, on: boolean): number {
  // (No frames while nothing moved: the time since is held short, or a pill at rest would jump.)
  const now = performance.now(), was = grown.get(key), dt = was ? Math.min(now - was.t, 34) : 0;
  const v = on ? Math.min(1, (was?.v ?? 0) + dt / MS) : Math.max(0, (was?.v ?? 0) - dt / MS);
  if (on || v > 0) grown.set(key, { v, t: now }); else grown.delete(key);
  if (v !== (on ? 1 : 0)) ed.requestRender();
  return v * v * (3 - 2 * v);
}

/**
 * A gap's handle ("Авторасположение"), at screen scale, from a to b: a faint line, and in its middle a
 * pill, 4 across and 16 along. Under the pointer or being dragged the line comes up and is a tenth longer,
 * the pill takes its colour, twice as thick and 1.3 times as long; all of it comes and goes smoothly.
 */
export function drawGapHandle(ctx: CanvasRenderingContext2D, ed: Editor, key: string, a: Point, b: Point, axis: 'col' | 'row', on: boolean, color: string): void {
  const k = growth(ed, key, on), m = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, out = 1 + 0.1 * k;
  ctx.strokeStyle = color;
  ctx.globalAlpha = 0.35 + 0.35 * k;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(m.x + (a.x - m.x) * out, m.y + (a.y - m.y) * out);
  ctx.lineTo(m.x + (b.x - m.x) * out, m.y + (b.y - m.y) * out);
  ctx.stroke();
  const across = 4 * (1 + k), along = 16 * (1 + 0.3 * k), [w, h] = axis === 'col' ? [across, along] : [along, across];
  ctx.beginPath();
  ctx.roundRect(m.x - w / 2, m.y - h / 2, w, h, across / 2);
  ctx.globalAlpha = 1;
  ctx.fillStyle = '#fff';
  ctx.fill();
  ctx.globalAlpha = k;
  ctx.fillStyle = color;
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.lineWidth = 1.5;
  ctx.stroke();
}
