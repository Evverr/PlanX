import type { Editor } from '../editor/editor';
import { flattenPath, samePoint, type PathNode, type Point } from '../canvas/geometry';
import { drawNodes } from './paths';

/**
 * "Перо" (src/labs): a figure drawn corner by corner. A click puts a sharp corner; pressed and dragged,
 * the corner is smooth, its handles (both ways, as far) following the pointer, the curve through it.
 * A line follows the pointer from the last corner; a click on the first (three corners or more) closes
 * it into a figure (filled and outlined as the others, text in it, stretched alike); a double click or
 * Enter leaves it a line through them, in the pen's ("Ручка") colour and width. Backspace takes the
 * last corner off, Esc lets it all go; with Shift a side runs at a multiple of 45°. Done, its corners
 * and handles can be changed again (see paths.ts).
 */
let nodes: PathNode[] | null = null;
// The corner being pressed (its handles dragged out), and whether that's closing the figure.
let pressing: { index: number; closing: boolean; from: Point; dragged: boolean } | null = null;
let lastClick = { t: 0, x: 0, y: 0 };
let shiftDown = false;
if (typeof window !== 'undefined') for (const k of ['keydown', 'keyup'] as const) window.addEventListener(k, (e) => { shiftDown = e.shiftKey; });

export const nibPoints = () => nodes;

/** How near the first corner (on screen) a click closes the figure. */
const CLOSE = 9;

/** Where a corner goes for the pointer at `w`: with Shift, along the nearest multiple of 45° from the last one. */
function snapped(w: Point, shift: boolean): Point {
  const last = nodes?.[nodes.length - 1]?.p;
  if (!shift || !last) return w;
  const dx = w.x - last.x, dy = w.y - last.y, len = Math.hypot(dx, dy), a = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * (Math.PI / 4);
  return { x: last.x + Math.cos(a) * len, y: last.y + Math.sin(a) * len };
}

const closing = (ed: Editor, sp: Point | null) => {
  if (!nodes || nodes.length < 3 || !sp) return false;
  const f = ed.toScreen(nodes[0].p);
  return Math.hypot(sp.x - f.x, sp.y - f.y) <= CLOSE;
};

/** A press on the board with the pen: a corner (or the first one, closing), its handles dragged out
 *  while held; the second press of a double click: the line done. */
export function nibPress(ed: Editor, w: Point, sp: Point, shift: boolean): void {
  const now = performance.now(), twice = now - lastClick.t < 380 && Math.hypot(sp.x - lastClick.x, sp.y - lastClick.y) < 6;
  lastClick = { t: twice ? 0 : now, x: sp.x, y: sp.y };
  if (ed.selection.size) ed.setSelection([]);
  if (twice && nodes) { finishNib(ed); return; }
  if (closing(ed, sp)) pressing = { index: 0, closing: true, from: sp, dragged: false };
  else {
    const p = snapped(w, shift);
    nodes = [...(nodes ?? []), { p, i: p, o: p }];
    pressing = { index: nodes.length - 1, closing: false, from: sp, dragged: false };
  }
  ed.gesture = { type: 'nib' };
  ed.requestRender();
}

/** Held and dragged: the pressed corner smooth, its handle out to the pointer and the other opposite. */
export function nibDrag(ed: Editor, w: Point, sp: Point): void {
  if (!pressing || !nodes) return;
  if (!pressing.dragged && Math.hypot(sp.x - pressing.from.x, sp.y - pressing.from.y) < 4) return;
  pressing.dragged = true;
  const n = nodes[pressing.index];
  nodes[pressing.index] = { p: n.p, o: w, i: { x: 2 * n.p.x - w.x, y: 2 * n.p.y - w.y } };
  ed.requestRender();
}

/** Let go: on the first corner, the figure is done. */
export function nibRelease(ed: Editor): void {
  const was = pressing;
  pressing = null;
  if (was?.closing) finishNib(ed, true);
}

/** Done: a figure through the corners (closed), or a line through them (two corners or more); nothing else. */
export function finishNib(ed: Editor, close = false): void {
  const got = nodes;
  nodes = null;
  pressing = null;
  ed.requestRender();
  if (!got) return;
  // (A double click put its first click's corner twice.)
  const at = got.filter((n, i) => i === 0 || Math.hypot(n.p.x - got[i - 1].p.x, n.p.y - got[i - 1].p.y) * ed.cam.z > 2 || !samePoint(n.o, n.p));
  if (close && at.length >= 3) ed.addFigure(at);
  else if (at.length >= 2) ed.addLine(at);
}

/** Backspace: the last corner off (the first one too: nothing then). */
export function undoNibCorner(ed: Editor): void {
  if (!nodes) return;
  nodes = nodes.length > 1 ? nodes.slice(0, -1) : null;
  ed.requestRender();
}

export function cancelNib(ed: Editor): void {
  nodes = null;
  pressing = null;
  ed.requestRender();
}

/** The path so far, on to the pointer (or, closing, back to the first corner), with its corners and handles. */
export function drawNib(ctx: CanvasRenderingContext2D, ed: Editor): void {
  if (!nodes) return;
  const sp = ed.pointerAt, shut = closing(ed, sp);
  const ahead = pressing ? null : shut ? nodes[0] : sp ? (() => { const p = snapped(ed.toWorld(sp.x, sp.y), shiftDown); return { p, i: p, o: p }; })() : null;
  const s = flattenPath(ahead ? [...nodes, ahead] : nodes, false).map((p) => ed.toScreen(p));
  ctx.save();
  ctx.strokeStyle = '#4DA3FF';
  ctx.lineWidth = 1.5;
  ctx.lineJoin = 'round';
  ctx.beginPath();
  s.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
  ctx.stroke();
  ctx.restore();
  drawNodes(ctx, ed, nodes, shut ? 0 : -1);
}
