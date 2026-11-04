import type { Editor } from '../editor/editor';
import type { Item } from '../model/types';
import type { Point } from '../canvas/geometry';
import { cellText, colsOf, rowsOf } from '../model/table';
import { LINES_FROM_Z } from '../editor/tables';
import { isLocked } from './labs';
import { PICK_FRAME } from '../canvas/renderer';

/**
 * "Перестановка в таблице": on the selected table (clicked a second time, or by the gear on its panel), a pill just out over its top edge by each column and
 * out left of its left edge by each row; one dragged along takes its column or row there, the others making room.
 */

/** A pill: of which table, a column's or a row's, which one. */
export interface Grip { id: string; axis: 'col' | 'row'; index: number }

/** A pill's size on the screen, and how far past it it still answers the pointer. */
const LONG = 16, THICK = 6, REACH = 4;
/** How far off the table (on the screen) a dragged column or row is let go to be taken away. */
const OFF = 44;
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

/** Fields without column (or row) `index`: its size, cells' text and formatting gone with it; a table
 *  keeps at least one of each. */
export function withRemoved(it: Item, axis: 'col' | 'row', index: number): Partial<Item> {
  const cols = colsOf(it), rows = rowsOf(it), n = cols.length, size = n * rows.length;
  if ((axis === 'col' ? n : rows.length) < 2) return {};
  const keep = (i: number) => (axis === 'col' ? i % n !== index : Math.floor(i / n) !== index);
  const all = Array.from({ length: size }, (_, i) => i).filter(keep);
  const fmt = all.map((i) => it.cellFmt?.[i] ?? null);
  const next = (axis === 'col' ? cols : rows).filter((_, i) => i !== index);
  return {
    ...(axis === 'col' ? { cols: next, w: sum(next) } : { rows: next, h: sum(next) }),
    cells: all.map((i) => cellText(it, i)),
    cellFmt: fmt.some(Boolean) ? fmt : undefined,
  };
}

/** The table the pills are out for: put out by a second click on it, or by the gear on its panel;
 *  put away as something else is picked. */
let shownFor: string | null = null;
const fns = new Set<() => void>();
export const subscribeGrips = (fn: () => void) => { fns.add(fn); return () => { fns.delete(fn); }; };
export const gripsOn = (id: string | undefined): boolean => !!id && shownFor === id;
function show(ed: Editor, id: string | null): void {
  if (shownFor === id) return;
  shownFor = id;
  fns.forEach((f) => f());
  ed.requestRender();
}
/** The gear: the selected table's pills out, or away. */
export function toggleGrips(ed: Editor): void {
  const it = ed.selectedItems()[0];
  if (it?.type === 'table') show(ed, shownFor === it.id ? null : it.id);
}
/** A press on the board at `w`: a second one on the table picked alone puts its pills out. */
export function pressedForGrips(ed: Editor, w: Point): void {
  const it = ed.selection.size === 1 ? ed.selectedItems()[0] : undefined;
  if (it?.type === 'table' && w.x >= it.x && w.x <= it.x + it.w && w.y >= it.y && w.y <= it.y + it.h) show(ed, it.id);
}

/** The table whose pills are out: the one selected alone (with them put out), not locked, typed in or
 *  turned, close enough. */
function tableOf(ed: Editor): Item | null {
  const one = ed.selection.size === 1 ? [...ed.selection][0] : null;
  if (shownFor && one !== shownFor) show(ed, null);
  if (!shownFor || ed.cam.z < LINES_FROM_Z) return null;
  const it = ed.selectedItems()[0];
  return it?.type === 'table' && !isLocked(it) && !it.rot && ed.editingId !== it.id ? it : null;
}

/** How far past the table's edge a pill stands, on the screen: clear of the selection frame by 3. */
const OUT = 3.75;

/** A pill's middle on the screen, `k` times its size: just out over its column's top, out left of its row. */
function gripScreen(ed: Editor, g: Grip & Point, k = 1): Point {
  const p = ed.toScreen(g), off = OUT + (THICK * k) / 2;
  return g.axis === 'col' ? { x: p.x, y: p.y - off } : { x: p.x - off, y: p.y };
}

/** Each pill's foot, on the board: on the top edge over the middle of its column, on the left edge by the middle of its row. */
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
    const p = gripScreen(ed, g), [w, h] = g.axis === 'col' ? [LONG, THICK] : [THICK, LONG];
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

/** Whether the column or row being dragged is off the table, to be taken away when let go. */
function off(ed: Editor, it: Item): boolean {
  if (!drag) return false;
  const m = OFF / ed.cam.z, p = drag.at;
  return p.x < it.x - m || p.x > it.x + it.w + m || p.y < it.y - m || p.y > it.y + it.h + m;
}

/** Puffs where columns or rows were taken away: at the screen point, since when. */
const puffs: Array<{ x: number; y: number; t: number }> = [];
/** How long a puff lasts, in ms. */
const PUFF = 420;

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
  const to = it ? target(it) : -1, gone = !!it && off(ed, it), at = drag.at;
  drag = null;
  hot = null;
  const patch = !it ? null : gone ? withRemoved(it, axis, index) : to >= 0 && to !== index ? withMoved(it, axis, index, to) : null;
  if (it && patch && Object.keys(patch).length) {
    ed.board.update(it.id, patch);
    if (gone) puffs.push({ ...ed.toScreen(at), t: performance.now() });
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
  drawPuffs(ctx, ed);
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
    const a = ed.toScreen(band), away = off(ed, it);
    // Off the table: red, to go when let go.
    ctx.globalAlpha = away ? 0.18 : 0.12;
    if (away) ctx.fillStyle = '#E5484D';
    ctx.fillRect(a.x, a.y, band.w * z, band.h * z);
    ctx.fillStyle = color;
    const to = target(it);
    if (to !== index && !away) {
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
    const on = dragged || (hot?.axis === g.axis && hot.index === g.index);
    // Under the pointer or dragged: 1.2 × 1.4 times as big, in the selection frame's blue.
    const k = on ? HOT : 1, p = gripScreen(ed, g, k), [w, h] = g.axis === 'col' ? [LONG * k, THICK * k] : [THICK * k, LONG * k];
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

/** The puffs, as when something's dropped off the macOS Dock: a few grey clouds swelling and fading. */
function drawPuffs(ctx: CanvasRenderingContext2D, ed: Editor): void {
  const now = performance.now();
  while (puffs.length && now - puffs[0].t > PUFF) puffs.shift();
  if (!puffs.length) return;
  ctx.save();
  ctx.fillStyle = document.documentElement.dataset.theme === 'dark' ? '#C9CED6' : '#9AA0AA';
  for (const p of puffs) {
    const k = (now - p.t) / PUFF, e = 1 - (1 - k) ** 2;
    ctx.globalAlpha = 0.55 * (1 - k);
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2 + 0.4, d = 6 + 22 * e, r = (4 + (i % 3) * 2) * (1 + 1.2 * e);
      ctx.beginPath();
      ctx.arc(p.x + Math.cos(a) * d, p.y + Math.sin(a) * d, r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.beginPath();
    ctx.arc(p.x, p.y, 8 * (1 + e), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
  ed.requestRender();
}
