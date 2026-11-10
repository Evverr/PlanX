import type { Item, Side } from '../model/types';
import type { Point } from '../canvas/geometry';
import { SIDES, sidePoint } from '../canvas/geometry';
import type { Editor } from '../editor/editor';
import { isLocked, labOn } from './labs';

/**
 * «Полукруги на рамке»: on the selection frame of what's picked alone, at the middle of each side, a ball
 * showing past the frame a quarter at rest, all of it (a ball just outside) with the pointer near it past
 * the frame; taken (a click, a drag) only there.
 * A click on it, a copy of what's picked that way; pressed and dragged, a link from that side, as from a
 * link dot.
 */

/** The ball's radius in screen pixels at 100%: bigger or smaller with the zoom, but less than the board
 *  (as the square root of it). */
const BALL_R = 7.5;
/** How much of the ball shows past the frame (of its width): at rest, and with the pointer near it or on it
 *  (a whole ball, a little off the frame); BY, where it's caught on the frame. */
const REST = 0.25, BY = 0.5, ON = 1.2;
/** How far off the item the pointer still counts as on it, and how near the ball it's by it, on screen. */
const OFF = 10, NEAR = 28;
/** Out whole (the pointer by it), the ball this many times bigger, and this much further off the frame's middle (px
 *  on screen): two pixels clear of its line. */
const BIG = 1.4, AWAY = 3;
/** Out whole, it keeps the pointer over this many times the room (area) it took to come out, that room
 *  stretched ALONG times more along the frame. */
const HOLD = 1.5, ALONG = 1.5;
/** For now: where the pointer brings the ball out (green) and keeps it (blue) shown on the board. */
const SHOW_ZONES = true;
/** How near the ball on the frame a side doesn't stretch (no resize cursor there), on screen. */
const NO_STRETCH = 20;
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

/** Whether the point is past the item's frame on that side (`off`: how far the frame stands off it). */
const past = (it: Item, side: Side, w: Point, off: number) =>
  side === 'right' ? w.x > it.x + it.w + off : side === 'left' ? w.x < it.x - off : side === 'bottom' ? w.y > it.y + it.h + off : w.y < it.y - off;

/** The side whose ball is under the point, if any: past the item's frame, by it on the frame or on it
 *  wholly out (inside the frame, the item's). */
export const tabAt = (ed: Editor, it: Item, w: Point): Side | null => tabAtZ(it, w, ed.cam.z, ed.tabAims);

/** The same at zoom `z`, the balls out as `was` has them. */
function tabAtZ(it: Item, w: Point, z: number, was: TabAims | null): Side | null {
  const r = radius(z);
  for (const side of SIDES) {
    if (!past(it, side, w, FRAME_OFF / z)) continue;
    // (The ball out whole has its middle `mid` past the frame.)
    const by = framePoint(it, side, z), mid = AWAY / z + r * (2 * ON - 1);
    // How far out past the frame the point is, and how far along it from the middle.
    const n = side === 'right' ? { x: 1, y: 0 } : side === 'left' ? { x: -1, y: 0 } : side === 'bottom' ? { x: 0, y: 1 } : { x: 0, y: -1 };
    const off = (w.x - by.x) * n.x + (w.y - by.y) * n.y, along = Math.abs((w.x - by.x) * n.y - (w.y - by.y) * n.x);
    // Out already: more room round it (longer along the frame), so it isn't lost by a slip of the hand.
    const k = was?.[side] === ON ? Math.sqrt(HOLD) : 1, ra = r * BIG * k, rl = was?.[side] === ON ? ra * ALONG : ra;
    // Round it, as an oval; and from the frame to its middle as wide (no notches where it meets the frame).
    if (((off - mid) / ra) ** 2 + (along / rl) ** 2 <= 1 || (off <= mid && along <= rl) || Math.hypot(w.x - by.x, w.y - by.y) <= reach(z) * k) return side;
  }
  return null;
}

export type TabAims = Record<Side, number>;
const resting = (): TabAims => ({ top: REST, right: REST, bottom: REST, left: REST });

/** How much each side's ball should show, by where the pointer is: off the item (further than OFF) all at
 *  rest; on or by it, the side it's nearest more, half by its ball, all of it on it. */
export const tabAims = (ed: Editor, it: Item, w: Point | null): TabAims => aimsZ(it, w, ed.cam.z, ed.tabAims);

function aimsZ(it: Item, w: Point | null, z: number, was: TabAims | null): TabAims {
  const out = resting(), pad = OFF / z;
  // (On a ball, wholly out past OFF too: it stays.)
  const on = w && tabAtZ(it, w, z, was);
  if (on) { out[on] = ON; return out; }
  if (!w || w.x < it.x - pad || w.x > it.x + it.w + pad || w.y < it.y - pad || w.y > it.y + it.h + pad) return out;
  const d: TabAims = { left: Math.abs(w.x - it.x), right: Math.abs(it.x + it.w - w.x), top: Math.abs(w.y - it.y), bottom: Math.abs(it.y + it.h - w.y) };
  const side = SIDES.reduce((a, b) => (d[b] < d[a] ? b : a));
  const p = framePoint(it, side, z), far = Math.hypot(w.x - p.x, w.y - p.y);
  // (Whole only with the pointer past the frame that side.)
  out[side] = far <= NEAR / z && past(it, side, w, FRAME_OFF / z) ? ON : REST;
  return out;
}

export const sameAims = (a: TabAims | null, b: TabAims | null): boolean => (!a || !b ? a === b : SIDES.every((s) => a[s] === b[s]));

/** Whether the point is by a ball on the frame (its middle, a side): no stretching there, the ball nearby. */
export const nearTab = (ed: Editor, it: Item, w: Point): boolean =>
  SIDES.some((side) => { const p = framePoint(it, side, ed.cam.z); return Math.hypot(w.x - p.x, w.y - p.y) <= NO_STRETCH / ed.cam.z; });

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
 *  much as `aims` says, easing there; the one wholly out (the pointer on it) bigger. */
export function drawTabs(ctx: CanvasRenderingContext2D, it: Item, zoom: number, color: string, alpha: number, aims: TabAims | null): void {
  const r = radius(zoom), now = performance.now(), want = aims ?? resting();
  if (SHOW_ZONES) drawZones(ctx, it, zoom);
  ctx.save();
  ctx.fillStyle = color;
  for (const side of SIDES) {
    const v = easeTo(`${it.id}:${side}`, want[side], now);
    // Its middle as far past the frame as it shows (v of its width), only what's past the frame drawn.
    const out = Math.max(0, Math.min(1, (v - BY) / (ON - BY))), grow = 1 + (BIG - 1) * out;
    const f = framePoint(it, side, zoom), c = sidePoint(it, side, (FRAME_OFF + AWAY * out) / zoom + r * (2 * v - 1));
    ctx.save();
    ctx.beginPath();
    const big = 1e4;
    if (side === 'right') ctx.rect(f.x, f.y - big, big, 2 * big);
    else if (side === 'left') ctx.rect(f.x - big, f.y - big, big, 2 * big);
    else if (side === 'bottom') ctx.rect(f.x - big, f.y, 2 * big, big);
    else ctx.rect(f.x - big, f.y - big, 2 * big, big);
    ctx.clip();
    ctx.beginPath();
    ctx.arc(c.x, c.y, r * grow, 0, Math.PI * 2);
    ctx.globalAlpha = alpha + (0.8 - alpha) * out;
    ctx.fill();
    ctx.restore();
  }
  ctx.restore();
}

/** Where the pointer brings each ball out (green), and, once out, keeps it (blue), sampled every 2 px. */
function drawZones(ctx: CanvasRenderingContext2D, it: Item, zoom: number): void {
  const step = 2 / zoom, span = 60 / zoom;
  ctx.save();
  for (const side of SIDES) {
    const c = framePoint(it, side, zoom), held = { ...resting(), [side]: ON };
    for (let x = c.x - span; x <= c.x + span; x += step) for (let y = c.y - span; y <= c.y + span; y += step) {
      const w = { x: x + step / 2, y: y + step / 2 };
      const comes = aimsZ(it, w, zoom, null)[side] === ON, keeps = aimsZ(it, w, zoom, held)[side] === ON;
      if (!comes && !keeps) continue;
      ctx.fillStyle = comes ? 'rgba(0,190,90,0.35)' : 'rgba(0,120,255,0.2)';
      ctx.fillRect(x, y, step, step);
    }
  }
  ctx.restore();
}

/** How far the copy a click makes stands off it that way (see Editor.duplicateToward): room for the
 *  copy's own ball between them, to make another. */
export const TAB_GAP = 72;
/** Where the copy goes from it that way, its size and the gap off it; none if something's there already
 *  (a copy made before, say): nothing made that way, nor shown. (`items`: what's on the board.) */
export function towardOffset(it: Item, side: Side, items: Item[] = []): Point | null {
  const d = side === 'right' ? { x: it.w + TAB_GAP, y: 0 } : side === 'left' ? { x: -it.w - TAB_GAP, y: 0 } : side === 'bottom' ? { x: 0, y: it.h + TAB_GAP } : { x: 0, y: -it.h - TAB_GAP };
  const taken = items.some((o) => o.id !== it.id && !o.host && o.type !== 'frame' && o.type !== 'ink'
    && o.x < it.x + d.x + it.w && it.x + d.x < o.x + o.w && o.y < it.y + d.y + it.h && it.y + d.y < o.y + o.h);
  return taken ? null : d;
}

/** The side whose ball is out whole (the pointer by it), if any. */
export const outSide = (aims: TabAims | null): Side | null => (aims ? SIDES.find((s) => aims[s] === ON) ?? null : null);

/** The copy a click would make, seen faintly: of which item, which way, coming in or going (in GHOST ms). */
const GHOST = 150;
let ghost: { id: string; side: Side | null; from: number; to: number; at: number } = { id: '', side: null, from: 0, to: 0, at: 0 };

/** How far in it is now (0…1) with what's wanted (an item and a side, or none: it goes); null when gone. */
export function ghostNow(id: string | null, side: Side | null): { id: string; side: Side; k: number } | null {
  const now = performance.now(), value = () => {
    const k = Math.min(1, (now - ghost.at) / GHOST), e = 1 - (1 - k) * (1 - k);
    return ghost.from + (ghost.to - ghost.from) * e;
  };
  if (id && side) {
    if (ghost.id !== id || ghost.side !== side) ghost = { id, side, from: 0, to: 1, at: now };
    else if (ghost.to !== 1) ghost = { ...ghost, from: value(), to: 1, at: now };
  } else if (ghost.to !== 0) ghost = { ...ghost, from: value(), to: 0, at: now };
  const k = value();
  if (now - ghost.at < GHOST) redraw();
  return ghost.side && k > 0 ? { id: ghost.id, side: ghost.side, k } : null;
}
