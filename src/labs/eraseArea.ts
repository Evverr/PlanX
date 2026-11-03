import { zoomBoxHeld } from './zoomBox';
import type { Editor } from '../editor/editor';
import type { Item } from '../model/types';
import { uid } from '../model/types';
import { fromLocal, inkPoints, type Point } from '../canvas/geometry';
import { readJSON, writeJSON } from '../storage';
import { isLocked } from './labs';

/**
 * "Ластик кружком" (src/labs): the eraser takes off only what of a drawn line is under its circle (as
 * wide as set in the drawing panel), leaving the rest of it as lines of their own; or, set so, whole
 * lines it touches, as before.
 */
export interface EraserStyle { size: number; whole?: boolean }
const KEY = 'planx-eraser';
export const ERASER_SIZES = [8, 120];
let style: EraserStyle = { size: 32, ...readJSON<EraserStyle>(KEY) };
const listeners = new Set<() => void>();

export const eraserStyle = () => style;
export function setEraserStyle(patch: Partial<EraserStyle>): void {
  style = { ...style, ...patch };
  writeJSON(KEY, style);
  listeners.forEach((fn) => fn());
}
export function subscribeEraser(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

const distToSegment = (p: Point, a: Point, b: Point) => {
  const dx = b.x - a.x, dy = b.y - a.y, len = dx * dx + dy * dy;
  const t = len ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len)) : 0;
  return Math.hypot(p.x - a.x - dx * t, p.y - a.y - dy * t);
};

/** The line's points on the board (turned as it's turned), with more between them, `step` apart at most. */
function densePoints(it: Item, step: number): Point[] {
  const pts = inkPoints(it).map((p) => (it.rot ? fromLocal(it, p) : p)), out: Point[] = [];
  pts.forEach((p, i) => {
    const q = pts[i - 1];
    if (q) {
      const n = Math.ceil(Math.hypot(p.x - q.x, p.y - q.y) / step);
      for (let k = 1; k < n; k++) out.push({ x: q.x + ((p.x - q.x) * k) / n, y: q.y + ((p.y - q.y) * k) / n });
    }
    out.push(p);
  });
  return out;
}

/** The eraser moved from a to b: what of each drawn line its circle passes over goes; what's left of
 *  one is the lines between (each kept as the line was: colour, width, opacity). One undo step with
 *  the rest of the stroke (the gesture's). */
export function eraseArea(ed: Editor, a: Point, b: Point): void {
  const r = style.size / 2 / ed.cam.z;
  const x1 = Math.min(a.x, b.x) - r, y1 = Math.min(a.y, b.y) - r, x2 = Math.max(a.x, b.x) + r, y2 = Math.max(a.y, b.y) + r;
  const gone: string[] = [], added: Item[] = [];
  for (const it of ed.board.list()) {
    if (it.type !== 'ink' || it.host || isLocked(it)) continue;
    const reach = Math.max(it.w, it.h);
    if (it.x - reach > x2 || it.x + it.w + reach < x1 || it.y - reach > y2 || it.y + it.h + reach < y1) continue;
    const pts = densePoints(it, Math.max(0.5, r / 3)), cut = pts.map((p) => distToSegment(p, a, b) <= r);
    if (!cut.includes(true)) continue;
    gone.push(it.id);
    const k = it.w / (it.iw || it.w || 1), sw = (it.sw ?? 2) * k;
    let run: Point[] = [];
    const keep = () => {
      if (run.length >= 2) {
        const xs = run.map((p) => p.x), ys = run.map((p) => p.y);
        const x = Math.floor(Math.min(...xs) - sw / 2), y = Math.floor(Math.min(...ys) - sw / 2);
        const w = Math.max(1, Math.ceil(Math.max(...xs) + sw / 2) - x), h = Math.max(1, Math.ceil(Math.max(...ys) + sw / 2) - y);
        const q = (v: number) => Math.round(v * 10) / 10;
        added.push({ ...it, id: uid(), x, y, w, h, iw: w, sw: q(sw), rot: undefined, rx: undefined, ph: undefined, pts: run.flatMap((p) => [q(p.x - x), q(p.y - y)]) });
      }
      run = [];
    };
    pts.forEach((p, i) => { if (cut[i]) keep(); else run.push(p); });
    keep();
  }
  if (!gone.length) return;
  ed.board.transact(() => {
    ed.board.remove(gone);
    added.forEach((it) => ed.board.add(it));
  });
}

/** The eraser's circle around the pointer, while it's the tool. */
export function drawEraser(ctx: CanvasRenderingContext2D, ed: Editor): void {
  const at = ed.pointerAt;
  // (Z held, the pointer's for zooming: see zoomBox.ts.)
  if (ed.tool !== 'eraser' || !at || style.whole || zoomBoxHeld()) return;
  ctx.save();
  ctx.beginPath();
  ctx.arc(at.x, at.y, style.size / 2, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255, 255, 255, .45)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(0, 0, 0, .45)';
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.restore();
}
