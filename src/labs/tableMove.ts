import type { Editor } from '../editor/editor';
import type { Item } from '../model/types';
import type { Point } from '../canvas/geometry';
import { cellText, colsOf, rowsOf } from '../model/table';
import { LINES_FROM_Z } from '../editor/tables';
import { isLocked } from './labs';
import { PICK_FRAME } from '../canvas/renderer';

/**
 * "Перестановка в таблице": on the selected table, a pill on its top edge over each column and on its
 * left edge by each row; one dragged along takes its column or row there, the others making room.
 */

/** A pill: of which table, a column's or a row's, which one. */
export interface Grip { id: string; axis: 'col' | 'row'; index: number }

/** A pill's size on the screen, and how far past it it still answers the pointer. */
const LONG = 16, THICK = 6, REACH = 4;
/** How much bigger one is under the pointer or dragged. */
const HOT = 1.68;

const sum = (a: number[]) => a.reduce((s, v) => s + v, 0);
const moved = <T>(a: T[], from: number, to: number): T[] => { const b = [...a], [x] = b.splice(from, 1); b.splice(to, 0, x); return b; };

/** Fields after column (or row) `from` is moved to `to`: its size, cells' text and formatting along. */
export function withMoved(it: Item, axis: 'col' | 'row', from: number, to: number): Partial<Item> {
  const cols = colsOf(it), rows = rowsOf(it), n = cols.length, size = n * rows.length;
  const order = moved(Array.from({ length: axis === 'col' ? n : rows.length }, (_, i) => i), from, to);
  const take = <T>(all: T[]) => Array.from({ length: size }, (_, i) => {
    const r = Math.floor(i / n), c = i % n;
    return axis === 'col' ? all[r * n + order[c]] : all[order[r] * n + c];
  });
  const fmt = Array.from({ length: size }, (_, i) => it.cellFmt?.[i] ?? null);
  return {
    ...(axis === 'col' ? { cols: moved(cols, from, to) } : { rows: moved(rows, from, to) }),
    cells: take(Array.from({ length: size }, (_, i) => cellText(it, i))),
    cellFmt: fmt.some(Boolean) ? take(fmt) : undefined,
  };
}

/** The table whose pills are out: the one selected alone, not locked, typed in or turned, close enough. */
function tableOf(ed: Editor): Item | null {
  if (ed.selection.size !== 1 || ed.cam.z < LINES_FROM_Z) return null;
  const it = ed.selectedItems()[0];
  return it?.type === 'table' && !isLocked(it) && !it.rot && ed.editingId !== it.id ? it : null;
}

/** Each pill's middle, on the board: over the middle of its column, by the middle of its row. */
function grips(it: Item): Array<Grip & Point> {
  const cols = colsOf(it), rows = rowsOf(it);
  return [
    ...cols.map((w, i) => ({ id: it.id, axis: 'col' as const, index: i, x: it.x + sum(cols.slice(0, i)) + w / 2, y: it.y })),
    ...rows.map((h, i) => ({ id: it.id, axis: 'row' as const, index: i, x: it.x, y: it.y + sum(rows.slice(0, i)) + h / 2 })),
  ];
}

/** The pill under a point on the canvas. */
export function gripAt(ed: Editor, sp: Point): Grip | null {
  const it = tableOf(ed);
  if (!it || drag) return null;
  for (const g of grips(it)) {
    const p = ed.toScreen(g), [w, h] = g.axis === 'col' ? [LONG, THICK] : [THICK, LONG];
    if (Math.abs(sp.x - p.x) <= w / 2 + REACH && Math.abs(sp.y - p.y) <= h / 2 + REACH) return { id: g.id, axis: g.axis, index: g.index };
  }
  return null;
}

let hot: Grip | null = null;
/** The pill under the pointer, drawn stronger. */
export const setHotGrip = (ed: Editor, g: Grip | null) => {
  if (g?.id === hot?.id && g?.axis === hot?.axis && g?.index === hot?.index) return;
  hot = g;
  ed.requestRender();
};

/** A pill being dragged: which, and from and to where the pointer's gone (on the board). */
let drag: { grip: Grip; from: Point; at: Point } | null = null;
export const gripDragging = () => !!drag;

export function startGrip(ed: Editor, grip: Grip, w: Point): void {
  drag = { grip, from: w, at: w };
  hot = grip;
  ed.requestRender();
}

export function moveGrip(ed: Editor, w: Point): void {
  if (!drag) return;
  drag.at = w;
  ed.requestRender();
}

/** Where the column or row being dragged would go: the one under the pointer. */
function target(it: Item): number {
  if (!drag) return -1;
  const { axis } = drag.grip, sizes = axis === 'col' ? colsOf(it) : rowsOf(it);
  const v = axis === 'col' ? drag.at.x - it.x : drag.at.y - it.y;
  let to = 0;
  for (let i = 0, s = 0; i < sizes.length; s += sizes[i], i++) if (v >= s) to = i;
  return to;
}

export function endGrip(ed: Editor): void {
  if (!drag) return;
  const it = ed.board.get(drag.grip.id), { axis, index } = drag.grip;
  const to = it ? target(it) : -1;
  drag = null;
  hot = null;
  if (it && to >= 0 && to !== index) {
    ed.board.update(it.id, withMoved(it, axis, index, to));
    ed.cells = [];
    ed.cellAnchor = null;
    ed.pickedLines = [];
    ed.emit();
  }
  ed.requestRender();
}

const pick = () => getComputedStyle(document.documentElement).getPropertyValue('--fmt-on-ink').trim() || '#0080FF';

/** The pills, at screen scale; while one's dragged, its column or row going along with the pointer
 *  and a line where it would go. */
export function drawGrips(ctx: CanvasRenderingContext2D, ed: Editor): void {
  const it = tableOf(ed);
  if (!it) return;
  const color = pick(), z = ed.cam.z;
  ctx.save();
  ctx.fillStyle = color;
  if (drag && drag.grip.id === it.id) {
    const { axis, index } = drag.grip, sizes = axis === 'col' ? colsOf(it) : rowsOf(it);
    const d = axis === 'col' ? drag.at.x - drag.from.x : drag.at.y - drag.from.y, start = sum(sizes.slice(0, index));
    const band = axis === 'col'
      ? { x: it.x + start + d, y: it.y, w: sizes[index], h: it.h }
      : { x: it.x, y: it.y + start + d, w: it.w, h: sizes[index] };
    const a = ed.toScreen(band);
    ctx.globalAlpha = 0.12;
    ctx.fillRect(a.x, a.y, band.w * z, band.h * z);
    const to = target(it);
    if (to !== index) {
      // Past the one under the pointer when going on, before it when going back.
      const at = sum(sizes.slice(0, to + (to > index ? 1 : 0)));
      const p = ed.toScreen(axis === 'col' ? { x: it.x + at, y: it.y } : { x: it.x, y: it.y + at });
      ctx.globalAlpha = 0.8;
      if (axis === 'col') ctx.fillRect(Math.round(p.x) - 1, p.y, 2, it.h * z);
      else ctx.fillRect(p.x, Math.round(p.y) - 1, it.w * z, 2);
    }
  }
  for (const g of grips(it)) {
    const dragged = drag?.grip.axis === g.axis && drag.grip.index === g.index;
    const shift = dragged && drag ? (g.axis === 'col' ? { x: (drag.at.x - drag.from.x) * z, y: 0 } : { x: 0, y: (drag.at.y - drag.from.y) * z }) : { x: 0, y: 0 };
    const p = ed.toScreen(g), on = dragged || (hot?.axis === g.axis && hot.index === g.index);
    // Under the pointer or dragged: 1.2 × 1.4 times as big, in the selection frame's blue.
    const k = on ? HOT : 1, [w, h] = g.axis === 'col' ? [LONG * k, THICK * k] : [THICK * k, LONG * k];
    const cx = p.x + shift.x, cy = p.y + shift.y;
    ctx.beginPath();
    ctx.roundRect(cx - w / 2, cy - h / 2, w, h, (THICK * k) / 2);
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#fff';
    ctx.fill();
    ctx.globalAlpha = on ? PICK_FRAME : 0.3;
    ctx.fillStyle = color;
    ctx.fill();
    // Three white dots along it: a thing to take hold of.
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#fff';
    const step = 3.5 * k, r = 0.75 * k;
    ctx.beginPath();
    for (const d of [-step, 0, step]) {
      const [x, y] = g.axis === 'col' ? [cx + d, cy] : [cx, cy + d];
      ctx.moveTo(x + r, y);
      ctx.arc(x, y, r, 0, Math.PI * 2);
    }
    ctx.fill();
  }
  ctx.restore();
}
