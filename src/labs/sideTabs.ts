import type { Item, Side } from '../model/types';
import type { Point } from '../canvas/geometry';
import { SIDES, sidePoint } from '../canvas/geometry';
import type { Editor } from '../editor/editor';
import { isLocked, labOn } from './labs';

/**
 * «Полукруги на рамке»: on the selection frame of what's picked alone, at the middle of each side, a ball
 * showing past the frame as much as the pointer's near it: a little at rest, more with the pointer nearer
 * that side, half of it with the pointer by it, all of it (a ball just outside) with the pointer on it.
 * A click on it, a copy of what's picked that way; pressed and dragged, a link from that side, as from a
 * link dot.
 */

/** The ball's radius in screen pixels at 100%: bigger or smaller with the zoom, but less than the board
 *  (as the square root of it). */
const BALL_R = 7.5;
/** How much of the ball shows past the frame (of its width): at rest, the pointer nearer that side, by it,
 *  on it (a whole ball, a little off the frame). */
const REST = 0.15, CLOSER = 0.3, BY = 0.5, ON = 1.2;
/** How far off the item the pointer still counts as on it, and how near the ball it's by it, on screen. */
const OFF = 10, NEAR = 28;
/** How long the ball takes to grow or shrink to its new size, in ms. */
const EASE = 120;
/** How far the frame stands off the item's side (as the renderer's outline), on screen. */
const FRAME_OFF = 3;

/** The ball's radius on the board at this zoom. */
const radius = (zoom: number) => (BALL_R * Math.sqrt(zoom)) / zoom;
/** How near the ball takes the pointer (on it), on the board. */
const reach = (zoom: number) => radius(zoom) * 1.6;

/** Whether what's picked gets them: on trial, not typed in, not a mind map node (its own "+"), an
 *  instance or what's in one, nor turned, nor locked. */
export const tabsFor = (it: Item | undefined, editing: string | null): it is Item =>
  !!it && labOn('sideTabs') && !editing && it.type !== 'mind' && !it.inst && !it.host && !it.rot && !isLocked(it);

/** The middle of a side on the frame. */
const framePoint = (it: Item, side: Side, zoom: number): Point => sidePoint(it, side, FRAME_OFF / zoom);

/** The side whose ball is under the point, if any: by it on the frame, or on it wholly out. */
export function tabAt(ed: Editor, it: Item, w: Point): Side | null {
  const z = ed.cam.z, r = radius(z);
  for (const side of SIDES) {
    const by = framePoint(it, side, z), out = sidePoint(it, side, FRAME_OFF / z + r * (2 * ON - 1));
    if (Math.hypot(w.x - by.x, w.y - by.y) <= reach(z) || Math.hypot(w.x - out.x, w.y - out.y) <= r * 1.3) return side;
  }
  return null;
}

export type TabAims = Record<Side, number>;
const resting = (): TabAims => ({ top: REST, right: REST, bottom: REST, left: REST });

/** How much each side's ball should show, by where the pointer is: off the item (further than OFF) all at
 *  rest; on or by it, the side it's nearest more, half by its ball, all of it on it. */
export function tabAims(ed: Editor, it: Item, w: Point | null): TabAims {
  const out = resting(), z = ed.cam.z, pad = OFF / z;
  // (On a ball, wholly out past OFF too: it stays.)
  const on = w && tabAt(ed, it, w);
  if (on) { out[on] = ON; return out; }
  if (!w || w.x < it.x - pad || w.x > it.x + it.w + pad || w.y < it.y - pad || w.y > it.y + it.h + pad) return out;
  const d: TabAims = { left: Math.abs(w.x - it.x), right: Math.abs(it.x + it.w - w.x), top: Math.abs(w.y - it.y), bottom: Math.abs(it.y + it.h - w.y) };
  const side = SIDES.reduce((a, b) => (d[b] < d[a] ? b : a));
  const p = framePoint(it, side, z), far = Math.hypot(w.x - p.x, w.y - p.y);
  out[side] = far <= NEAR / z ? BY : CLOSER;
  return out;
}

export const sameAims = (a: TabAims | null, b: TabAims | null): boolean => (!a || !b ? a === b : SIDES.every((s) => a[s] === b[s]));

/** Each ball's size as it eases there (by "item:side"): from, to, since. */
const shown = new Map<string, { from: number; to: number; at: number }>();
let redraw: () => void = () => {};
/** What draws the board again while they ease (the editor's). */
export const setTabsRedraw = (fn: () => void): void => { redraw = fn; };

function easeTo(key: string, to: number, now: number): number {
  const at = (t: { from: number; to: number; at: number }) => {
    const k = Math.min(1, (now - t.at) / EASE), e = 1 - (1 - k) * (1 - k);
    return t.from + (t.to - t.from) * e;
  };
  let t = shown.get(key);
  if (!t) shown.set(key, (t = { from: to, to, at: now }));
  else if (t.to !== to) shown.set(key, (t = { from: at(t), to, at: now }));
  if (now - t.at < EASE) redraw();
  return at(t);
}

/** The balls on the picked one's frame (on the board, as the frame is drawn): each showing past it as
 *  much as `aims` says, easing there; the one wholly out (the pointer on it) with a white edge. */
export function drawTabs(ctx: CanvasRenderingContext2D, it: Item, zoom: number, color: string, alpha: number, aims: TabAims | null): void {
  const r = radius(zoom), now = performance.now(), want = aims ?? resting();
  ctx.save();
  ctx.fillStyle = color;
  for (const side of SIDES) {
    const v = easeTo(`${it.id}:${side}`, want[side], now);
    // Its middle as far past the frame as it shows (v of its width), only what's past the frame drawn.
    const f = framePoint(it, side, zoom), c = sidePoint(it, side, FRAME_OFF / zoom + r * (2 * v - 1));
    const out = Math.max(0, Math.min(1, (v - BY) / (ON - BY)));
    ctx.save();
    ctx.beginPath();
    const big = 1e4;
    if (side === 'right') ctx.rect(f.x, f.y - big, big, 2 * big);
    else if (side === 'left') ctx.rect(f.x - big, f.y - big, big, 2 * big);
    else if (side === 'bottom') ctx.rect(f.x - big, f.y, 2 * big, big);
    else ctx.rect(f.x - big, f.y - big, 2 * big, big);
    ctx.clip();
    ctx.beginPath();
    ctx.arc(c.x, c.y, r, 0, Math.PI * 2);
    ctx.globalAlpha = alpha + (0.8 - alpha) * out;
    ctx.fill();
    if (out > 0) {
      ctx.globalAlpha = out;
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 2 / zoom;
      ctx.stroke();
    }
    ctx.restore();
  }
  ctx.restore();
}
