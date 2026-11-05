import type { Editor } from '../editor/editor';
import type { Item } from '../model/types';
import { angleOf, center, fromLocal, toLocal, type Point } from '../canvas/geometry';
import { croppedPicture, setPlainPicture } from '../canvas/pictures';
import { isLocked } from './labs';

/**
 * "Кроп картинки": the crop button on a picture's panel. Each of its edges moves in (and back, till it's
 * done), the ball at its lower left corner rounds its corners. Nothing changes on the board till it's
 * done (Enter, the button again, a press off it; Esc drops it all). Then what's cut off is gone for
 * good, not to be undone, so a board doesn't keep the pictures' cut-off parts; the rounding is only how
 * it's drawn, and can be set anew.
 */

/** The smallest a picture can be cut to, on the board. */
const MIN = 16;
/** On the screen: how near an edge takes it, the ball's radius, how near the ball takes it. */
const EDGE = 6, BALL = 6, BALL_NEAR = 10;
/** An edge's mark: how long and how thick. */
const MARK_LONG = 20, MARK_THICK = 5;

/** The picture being cut: how much is off each of its sides (on the board), its rounding. */
interface Crop { id: string; l: number; t: number; r: number; b: number; rad: number }
let crop: Crop | null = null;

/** What's under a point: the ball, or which edges (a corner's two). */
type Part = { ball: true } | { ball?: false; x: 'l' | 'r' | null; y: 't' | 'b' | null };
/** What's being dragged, and how far from it it was taken. */
let held: { part: Part; dx: number; dy: number } | null = null;

const fns = new Set<() => void>();
export const subscribeCrop = (fn: () => void) => { fns.add(fn); return () => { fns.delete(fn); }; };
const changed = (ed: Editor) => { fns.forEach((fn) => fn()); ed.requestRender(); };

export const croppingId = (): string | null => crop?.id ?? null;
export const cropDragging = (): boolean => !!held;
/** Whether it's a picture of someone's own that can be cut (not a game sticker, nor in a component). */
export const canCrop = (it: Item): boolean => it.type === 'image' && !!it.src && !it.doodle && !it.host && !it.inst && !isLocked(it);

/** What's left of the picture, on the board, as if it weren't turned. */
const kept = (it: Item, c: Crop) => ({ x: it.x + c.l, y: it.y + c.t, w: Math.max(1, it.w - c.l - c.r), h: Math.max(1, it.h - c.t - c.b) });

let keys: ((e: KeyboardEvent) => void) | null = null;

function leave(): void {
  crop = null;
  held = null;
  setPlainPicture(null);
  if (keys) window.removeEventListener('keydown', keys, true);
  keys = null;
}

/** The button: the picture picked alone starts being cut, or is done with. */
export function toggleCrop(ed: Editor): void {
  if (crop) { finishCrop(ed); return; }
  const it = ed.selectedItems()[0];
  if (ed.selection.size !== 1 || !it || !canCrop(it)) return;
  ed.stopEditing();
  crop = { id: it.id, l: 0, t: 0, r: 0, b: 0, rad: it.rad ?? 0 };
  setPlainPicture(it.id);
  keys = (e) => {
    if (e.key !== 'Enter' && e.key !== 'Escape') return;
    e.preventDefault();
    e.stopPropagation();
    if (e.key === 'Enter') finishCrop(ed); else cancelCrop(ed);
  };
  window.addEventListener('keydown', keys, true);
  changed(ed);
}

/** Done: what's cut off is gone for good; the rounding as any other change. */
export function finishCrop(ed: Editor): void {
  const c = crop;
  if (!c) return;
  const it = ed.board.get(c.id);
  if (it) {
    const rad = c.rad || undefined, b = kept(it, c);
    const src = c.l || c.t || c.r || c.b ? croppedPicture(it, { x: c.l / it.w, y: c.t / it.h, w: b.w / it.w, h: b.h / it.h }) : null;
    if (src) {
      // (About its new middle, if it's turned.)
      const m = fromLocal(it, center(b));
      ed.board.updateForGood(it.id, { src, x: m.x - b.w / 2, y: m.y - b.h / 2, w: b.w, h: b.h, rad });
    } else if (rad !== it.rad) ed.board.update(it.id, { rad });
  }
  leave();
  changed(ed);
}

/** Esc: all as it was. */
export function cancelCrop(ed: Editor): void {
  if (!crop) return;
  leave();
  changed(ed);
}

/** What's under a screen point, on what's left of the picture. */
function partAt(ed: Editor, it: Item, c: Crop, sp: Point): Part | null {
  const p = toLocal(it, ed.toWorld(sp.x, sp.y)), b = kept(it, c), z = ed.cam.z, reach = EDGE / z, r = Math.min(c.rad, Math.min(b.w, b.h) / 2);
  if (Math.hypot(p.x - (b.x + r), p.y - (b.y + b.h - r)) <= BALL_NEAR / z) return { ball: true };
  if (p.x < b.x - reach || p.x > b.x + b.w + reach || p.y < b.y - reach || p.y > b.y + b.h + reach) return null;
  const x = Math.abs(p.x - b.x) <= reach ? 'l' : Math.abs(p.x - b.x - b.w) <= reach ? 'r' : null;
  const y = Math.abs(p.y - b.y) <= reach ? 't' : Math.abs(p.y - b.y - b.h) <= reach ? 'b' : null;
  return x || y ? { x, y } : null;
}

/** How far the point is along what's taken: from each side in, from the corner along the ball's way. */
const edgeAt = (it: Item, p: Point, side: 'l' | 'r' | 't' | 'b') => (side === 'l' ? p.x - it.x : side === 'r' ? it.x + it.w - p.x : side === 't' ? p.y - it.y : it.y + it.h - p.y);
const ballAt = (it: Item, c: Crop, p: Point) => { const b = kept(it, c); return (p.x - b.x + (b.y + b.h - p.y)) / 2; };

/** A press on the board while cutting: whether it's for the cutting (an edge, the ball, or anywhere on
 *  the picture, which stays where it is). Off it, it's done with, and the press goes on as usual. */
export function pressCrop(ed: Editor, sp: Point): boolean {
  const c = crop, it = c && ed.board.get(c.id);
  if (!c || !it) return false;
  const part = partAt(ed, it, c, sp), p = toLocal(it, ed.toWorld(sp.x, sp.y));
  if (part) {
    held = part.ball
      ? { part, dx: ballAt(it, c, p) - Math.min(c.rad, Math.min(kept(it, c).w, kept(it, c).h) / 2), dy: 0 }
      : { part, dx: part.x ? edgeAt(it, p, part.x) - c[part.x] : 0, dy: part.y ? edgeAt(it, p, part.y) - c[part.y] : 0 };
    return true;
  }
  if (p.x >= it.x && p.x <= it.x + it.w && p.y >= it.y && p.y <= it.y + it.h) return true;
  finishCrop(ed);
  return false;
}

export function moveCrop(ed: Editor, sp: Point): void {
  const c = crop, it = c && ed.board.get(c.id);
  if (!c || !it || !held) return;
  const p = toLocal(it, ed.toWorld(sp.x, sp.y)), { part, dx, dy } = held;
  if (part.ball) {
    const b = kept(it, c);
    c.rad = Math.round(Math.max(0, Math.min(ballAt(it, c, p) - dx, Math.min(b.w, b.h) / 2)));
  } else {
    if (part.x) c[part.x] = Math.round(Math.max(0, Math.min(edgeAt(it, p, part.x) - dx, it.w - MIN - c[part.x === 'l' ? 'r' : 'l'])));
    if (part.y) c[part.y] = Math.round(Math.max(0, Math.min(edgeAt(it, p, part.y) - dy, it.h - MIN - c[part.y === 't' ? 'b' : 't'])));
  }
  ed.requestRender();
}

export function endCropDrag(): void {
  held = null;
}

/** The pointer over it, while cutting; none where it does nothing special. */
export function cropCursor(ed: Editor, sp: Point): string | null {
  const it = crop && ed.board.get(crop.id);
  if (!crop || !it) return null;
  const part = partAt(ed, it, crop, sp);
  if (!part) return 'default';
  if (part.ball) return 'nesw-resize';
  if (part.x && part.y) return (part.x === 'l') === (part.y === 't') ? 'nwse-resize' : 'nesw-resize';
  return part.x ? 'ew-resize' : 'ns-resize';
}

/** Over the board: what'll be cut off dimmed, what's left framed, a mark on each edge, the ball. */
export function drawCrop(ctx: CanvasRenderingContext2D, ed: Editor): void {
  const c = crop;
  if (!c) return;
  const it = ed.board.get(c.id);
  // Deleted, something else picked, typing begun: done with.
  if (!it || ed.selection.size !== 1 || !ed.selection.has(c.id)) { queueMicrotask(() => finishCrop(ed)); return; }
  const z = ed.cam.z, s = ed.toScreen(center(it)), css = getComputedStyle(document.documentElement);
  const blue = css.getPropertyValue('--fmt-on-ink').trim() || '#0080FF', surface = css.getPropertyValue('--surface').trim() || '#fff';
  const W = it.w * z, H = it.h * z, x = -W / 2 + c.l * z, y = -H / 2 + c.t * z, w = Math.max(1, W - (c.l + c.r) * z), h = Math.max(1, H - (c.t + c.b) * z);
  const r = Math.min(c.rad * z, Math.min(w, h) / 2);
  ctx.save();
  ctx.translate(s.x, s.y);
  ctx.rotate(angleOf(it));
  ctx.fillStyle = surface;
  ctx.globalAlpha = 0.7;
  ctx.beginPath();
  ctx.rect(-W / 2, -H / 2, W, H);
  ctx.roundRect(x, y, w, h, r);
  ctx.fill('evenodd');
  ctx.globalAlpha = 1;
  ctx.strokeStyle = blue;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
  ctx.stroke();
  const mark = (cx: number, cy: number, across: boolean) => {
    const mw = across ? MARK_LONG : MARK_THICK, mh = across ? MARK_THICK : MARK_LONG;
    ctx.beginPath();
    ctx.roundRect(cx - mw / 2, cy - mh / 2, mw, mh, MARK_THICK / 2);
    ctx.fill();
    ctx.stroke();
  };
  mark(x + w / 2, y, true);
  mark(x + w / 2, y + h, true);
  mark(x, y + h / 2, false);
  mark(x + w, y + h / 2, false);
  ctx.beginPath();
  ctx.arc(x + r, y + h - r, BALL, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}
