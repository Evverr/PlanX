import type { Editor } from '../editor/editor';
import type { Point } from '../canvas/geometry';

/**
 * "Перо" (src/labs): a figure drawn corner by corner. Each click puts a corner, a line following the
 * pointer from the last one; a click on the first (three corners or more) closes it into a figure
 * (filled and outlined as the others, text in it, stretched alike); a double click or Enter leaves it
 * a line through them, in the pen's ("Ручка") colour and width. Backspace takes the last corner off,
 * Esc lets it all go; with Shift a side runs at a multiple of 45°.
 */
let pts: Point[] | null = null;
let shiftDown = false;
if (typeof window !== 'undefined') for (const k of ['keydown', 'keyup'] as const) window.addEventListener(k, (e) => { shiftDown = e.shiftKey; });
let lastClick = { t: 0, x: 0, y: 0 };

export const nibPoints = () => pts;

/** How near the first corner (on screen) a click closes the figure. */
const CLOSE = 9;

/** Where a corner goes for the pointer at `w`: with Shift, along the nearest multiple of 45° from the last one. */
function snapped(w: Point, shift: boolean): Point {
  const last = pts?.[pts.length - 1];
  if (!shift || !last) return w;
  const dx = w.x - last.x, dy = w.y - last.y, len = Math.hypot(dx, dy), a = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * (Math.PI / 4);
  return { x: last.x + Math.cos(a) * len, y: last.y + Math.sin(a) * len };
}

const closing = (ed: Editor, sp: Point | null) => {
  if (!pts || pts.length < 3 || !sp) return false;
  const f = ed.toScreen(pts[0]);
  return Math.hypot(sp.x - f.x, sp.y - f.y) <= CLOSE;
};

/** A click on the board with the pen: a corner, the figure closed, or (the second click of a double) the line done. */
export function nibClick(ed: Editor, w: Point, sp: Point, shift: boolean): void {
  const now = performance.now(), twice = now - lastClick.t < 380 && Math.hypot(sp.x - lastClick.x, sp.y - lastClick.y) < 6;
  lastClick = { t: twice ? 0 : now, x: sp.x, y: sp.y };
  if (ed.selection.size) ed.setSelection([]);
  if (twice && pts) { finishNib(ed); return; }
  if (closing(ed, sp)) { finishNib(ed, true); return; }
  pts = [...(pts ?? []), snapped(w, shift)];
  ed.requestRender();
}

/** Done: a figure through the corners (closed), or a line through them (two corners or more); nothing else. */
export function finishNib(ed: Editor, close = false): void {
  const got = pts;
  pts = null;
  ed.requestRender();
  if (!got) return;
  // (A double click put its first click's corner twice.)
  const at = got.filter((p, i) => i === 0 || Math.hypot(p.x - got[i - 1].x, p.y - got[i - 1].y) * ed.cam.z > 2);
  if (close && at.length >= 3) ed.addFigure(at);
  else if (at.length >= 2) ed.addLine(at);
}

/** Backspace: the last corner off (the first one too: nothing then). */
export function undoNibCorner(ed: Editor): void {
  if (!pts) return;
  pts = pts.length > 1 ? pts.slice(0, -1) : null;
  ed.requestRender();
}

export function cancelNib(ed: Editor): void {
  pts = null;
  ed.requestRender();
}

/** The corners so far, the line on to the pointer, and the first corner larger where a click closes the figure. */
export function drawNib(ctx: CanvasRenderingContext2D, ed: Editor): void {
  if (!pts) return;
  const sp = ed.pointerAt, on = sp ? snapped(ed.toWorld(sp.x, sp.y), shiftDown) : null, shut = closing(ed, sp);
  const s = pts.map((p) => ed.toScreen(p)), to = shut ? s[0] : on && ed.toScreen(on);
  ctx.save();
  ctx.strokeStyle = '#4DA3FF';
  ctx.lineWidth = 1.5;
  ctx.lineJoin = 'round';
  ctx.beginPath();
  s.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
  if (to) ctx.lineTo(to.x, to.y);
  ctx.stroke();
  s.forEach((p, i) => {
    ctx.beginPath();
    ctx.arc(p.x, p.y, i === 0 && shut ? 6 : 3.5, 0, Math.PI * 2);
    ctx.fillStyle = i === 0 && shut ? '#4DA3FF' : '#fff';
    ctx.fill();
    ctx.stroke();
  });
  ctx.restore();
}
