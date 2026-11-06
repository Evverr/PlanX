import type { Editor } from '../editor/editor';
import type { Item } from '../model/types';
import type { Point } from '../canvas/geometry';
import { cellText, colsOf, rowsOf, withCount } from '../model/table';
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
/** How far off the table (on the screen) a dragged column or row is let go to be taken away: off its
 *  side, across the way it moves; along that way, just past the table's edge is enough. */
const OFF = 44;
/** How much bigger than that the place it answers the pointer in is. */
const HIT = 1.5;
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

/** Fields with an empty column (or row) put in at `at` (0 before the first): as wide (or tall) as the one
 *  before it; a new column's top cell formatted as the one before it (the header going on). */
export function withInserted(it: Item, axis: 'col' | 'row', at: number): Partial<Item> {
  const cols = colsOf(it), rows = rowsOf(it), n = cols.length, size = n * rows.length;
  const cells = Array.from({ length: size }, (_, i) => cellText(it, i)), fmt = Array.from({ length: size }, (_, i) => it.cellFmt?.[i] ?? null);
  const keepFmt = (f: typeof fmt) => (f.some(Boolean) ? f : undefined);
  if (axis === 'col') {
    const next = [...cols.slice(0, at), cols[Math.max(0, at - 1)], ...cols.slice(at)];
    const regrid = <T>(all: T[], blank: (r: number, row: T[]) => T) => rows.flatMap((_, r) => { const row = all.slice(r * n, r * n + n); return [...row.slice(0, at), blank(r, row), ...row.slice(at)]; });
    return { cols: next, w: sum(next), cells: regrid(cells, () => ''), cellFmt: keepFmt(regrid(fmt, (r, row) => (r === 0 ? row[Math.max(0, at - 1)] : null))) };
  }
  const next = [...rows.slice(0, at), rows[Math.max(0, at - 1)], ...rows.slice(at)];
  return { rows: next, h: sum(next), cells: [...cells.slice(0, at * n), ...Array<string>(n).fill(''), ...cells.slice(at * n)],
    cellFmt: keepFmt([...fmt.slice(0, at * n), ...Array<null>(n).fill(null), ...fmt.slice(at * n)]) };
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

/** The table the pills are out for: put out by a double click on it (on a cell or a line), a second
 *  click on it, or by the gear on its panel; put away as something else is picked. Typing in one of its cells, they're out too. */
let shownFor: string | null = null;
const fns = new Set<() => void>();
export const subscribeGrips = (fn: () => void) => { fns.add(fn); return () => { fns.delete(fn); }; };
export const gripsOn = (id: string | undefined): boolean => !!id && shownFor === id;
function show(ed: Editor, id: string | null): void {
  if (shownFor === id) return;
  shownFor = id;
  delete held.row;
  delete held.col;
  fns.forEach((f) => f());
  ed.requestRender();
}
/** A new table put on the board: its pills out at once. */
export const showGrips = (ed: Editor, id: string) => show(ed, id);

/** The gear: the selected table's pills out, or away. */
export function toggleGrips(ed: Editor): void {
  const it = ed.selectedItems()[0];
  if (it?.type === 'table') show(ed, shownFor === it.id ? null : it.id);
}
/** A press on the board (at `w` on it, `sp` on the screen): the second of a double click on a table
 *  (anywhere on it, its lines and edges too) puts its pills out; so does a click on it picked already,
 *  let go where it was pressed (a drag only moves it). */
const DOUBLE_MS = 400, DOUBLE_PX = 6, EDGE_PX = 6;
let lastPress: { id: string; t: number; x: number; y: number } | null = null;
let clicked: { id: string; x: number; y: number } | null = null;
export function pressedForGrips(ed: Editor, w: Point, sp: Point): void {
  const m = EDGE_PX / ed.cam.z;
  const it = ed.shown().filter((i) => i.type === 'table' && !i.rot && w.x >= i.x - m && w.x <= i.x + i.w + m && w.y >= i.y - m && w.y <= i.y + i.h + m).pop();
  const now = performance.now(), l = lastPress;
  clicked = it && ed.selection.size === 1 && ed.selection.has(it.id) ? { id: it.id, ...sp } : null;
  if (it && l && l.id === it.id && now - l.t < DOUBLE_MS && Math.hypot(sp.x - l.x, sp.y - l.y) < DOUBLE_PX) { lastPress = null; show(ed, it.id); return; }
  lastPress = it ? { id: it.id, t: now, ...sp } : null;
}
/** Let go: where it was pressed, on the table picked already, its pills come out. */
export function releasedForGrips(ed: Editor, sp: Point): void {
  const c = clicked;
  clicked = null;
  if (c && Math.hypot(sp.x - c.x, sp.y - c.y) < DOUBLE_PX && ed.selection.size === 1 && ed.selection.has(c.id)) show(ed, c.id);
}

/** The table whose pills are out: the one selected alone (with them put out, or typed in), not locked
 *  or turned, close enough. */
function tableOf(ed: Editor): Item | null {
  const one = ed.selection.size === 1 ? [...ed.selection][0] : null;
  if (shownFor && one !== shownFor) show(ed, null);
  if ((!shownFor && (!one || ed.editingId !== one)) || ed.cam.z < GRIPS_FROM_Z) return null;
  const it = ed.selectedItems()[0];
  return it?.type === 'table' && !isLocked(it) && !it.rot ? it : null;
}

/** Where the pointer is on the screen, over the board or the text being typed (none elsewhere): only the
 *  pills of the column and the row it's in show. */
let pointer: Point | null = null;
export function tablePointer(ed: Editor, sp: Point | null): void {
  if (pointer?.x === sp?.x && pointer?.y === sp?.y) return;
  pointer = sp;
  if (shownFor || ed.editingId) ed.requestRender();
}
/** The column and the row the pointer's in: in the table, or out past its top (for the column) or its
 *  left (for the row) as far as their pills. */
function pointedAt(ed: Editor, it: Item): { col: number; row: number } {
  if (!pointer) return { col: -1, row: -1 };
  const p = ed.toWorld(pointer.x, pointer.y), out = (OUT + THICK * HOT + REACH * HIT + 4) / ed.cam.z;
  const find = (sizes: number[], d: number) => { let s = 0; for (let i = 0; i < sizes.length; i++) { s += sizes[i]; if (d <= s) return i; } return -1; };
  const inX = p.x >= it.x && p.x <= it.x + it.w, inY = p.y >= it.y && p.y <= it.y + it.h;
  return {
    col: inX && p.y >= it.y - out && p.y <= it.y + it.h ? find(colsOf(it), p.x - it.x) : -1,
    row: inY && p.x >= it.x - out && p.x <= it.x + it.w ? find(rowsOf(it), p.y - it.y) : -1,
  };
}
/** Whether a pill shows: its column's or row's under the pointer, or it's being dragged. */
function seen(ed: Editor, it: Item, g: Grip): boolean {
  if (drag?.grip.axis === g.axis && drag.grip.index === g.index) return true;
  const at = pointedAt(ed, it);
  return g.axis === 'col' ? at.col === g.index : at.row === g.index;
}

/** Zoomed out further than this, the pills and pluses aren't out: 25% (a table's lines are taken to
 *  LINES_FROM_Z). */
const GRIPS_FROM_Z = 0.25;

/** How far past the table's edge a pill stands, on the screen: clear of the selection frame by 5. */
const OUT = 5.75;

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

/** The pluses inside the table with its pills out, as a mind map node's: by its bottom edge in the
 *  middle (a row more) and by its right edge in the middle (a column more); radius and how far in
 *  from the edge, on the screen. */
const PLUS_R = 9, PLUS_IN = 14;
/** A plus: at the end ('row', 'col'), or on a line between two (or on an edge), to put one in there:
 *  'col@2' before the third column. */
type EndPlus = 'row' | 'col';
export type TablePlus = EndPlus | `${EndPlus}@${number}`;
function plusAt(ed: Editor, it: Item, which: EndPlus): Point {
  const h = held[which];
  if (h) return ed.toScreen(h);
  const p = ed.toScreen(which === 'row' ? { x: it.x + it.w / 2, y: it.y + it.h } : { x: it.x + it.w, y: it.y + it.h / 2 });
  return which === 'row' ? { x: p.x, y: p.y - PLUS_IN } : { x: p.x - PLUS_IN, y: p.y };
}
/** The pluses on the lines (and edges) by the column and the row the pointer's in, smaller, just inside
 *  the table: on its top edge after the column, on its left edge under the row, by their pills. All of
 *  them, each with whether it shows. */
const INS_R = PLUS_R * 0.56;
function insertPluses(ed: Editor, it: Item): Array<{ key: TablePlus; p: Point; seen: boolean }> {
  const at = drag ? { col: -1, row: -1 } : pointedAt(ed, it), out: Array<{ key: TablePlus; p: Point; seen: boolean }> = [];
  const cols = colsOf(it), rows = rowsOf(it);
  for (let b = 0; b <= cols.length; b++) {
    const s = ed.toScreen({ x: it.x + sum(cols.slice(0, b)), y: it.y });
    out.push({ key: `col@${b}`, p: { x: s.x, y: s.y + PLUS_IN }, seen: at.col === b - 1 });
  }
  for (let b = 0; b <= rows.length; b++) {
    const s = ed.toScreen({ x: it.x, y: it.y + sum(rows.slice(0, b)) });
    out.push({ key: `row@${b}`, p: { x: s.x + PLUS_IN, y: s.y }, seen: at.row === b - 1 });
  }
  return out;
}
/** The plus under a point on the canvas. */
export function tablePlusAt(ed: Editor, sp: Point): TablePlus | null {
  const it = tableOf(ed);
  if (!it || drag) return null;
  for (const w of ['row', 'col'] as const) { const c = plusAt(ed, it, w); if (Math.hypot(sp.x - c.x, sp.y - c.y) <= PLUS_R + 2) return w; }
  return insertPluses(ed, it).find((q) => q.seen && Math.hypot(sp.x - q.p.x, sp.y - q.p.y) <= INS_R + 2)?.key ?? null;
}
let hotPlus: TablePlus | null = null;
/** A pressed plus stays where it was (on the board) while the pointer's on it, to be pressed again;
 *  left, it comes in at the table's new edge. */
const held: Partial<Record<EndPlus, Point>> = {}, cameIn: Partial<Record<EndPlus, number>> = {};
const PLUS_IN_MS = 160;
export const setHotPlus = (ed: Editor, w: TablePlus | null) => {
  if (hotPlus === w) return;
  for (const k of ['row', 'col'] as const) if (held[k] && w !== k) { delete held[k]; cameIn[k] = performance.now(); }
  hotPlus = w;
  ed.requestRender();
};
/** A plus pressed: a row or column more, at the end, or put in where it is. */
export function pressPlus(ed: Editor, w: TablePlus): void {
  const it = tableOf(ed);
  if (!it) return;
  // (Typing in it, the typing's done first: the cells move.)
  if (ed.editingId === it.id) ed.stopEditing();
  if (w.includes('@')) {
    const [axis, at] = w.split('@');
    ed.board.update(it.id, withInserted(it, axis as EndPlus, Number(at)));
    ed.requestRender();
    return;
  }
  const end = w as EndPlus, c = plusAt(ed, it, end);
  held[end] = ed.toWorld(c.x, c.y);
  ed.board.update(it.id, withCount(it, end, 1));
  ed.requestRender();
}

/** The pill under a point on the canvas. */
export function gripAt(ed: Editor, sp: Point): Grip | null {
  const it = tableOf(ed);
  if (!it || drag) return null;
  for (const g of grips(it)) {
    if (!seen(ed, it, g)) continue;
    const p = gripScreen(ed, g), [w, h] = g.axis === 'col' ? [LONG, THICK] : [THICK, LONG];
    if (Math.abs(sp.x - p.x) <= (w / 2 + REACH) * HIT && Math.abs(sp.y - p.y) <= (h / 2 + REACH) * HIT) return { id: g.id, axis: g.axis, index: g.index };
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
  if (ed.editingId === grip.id) ed.stopEditing();
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
  const m = OFF / ed.cam.z, p = drag.at, col = drag.grip.axis === 'col', mx = col ? 0 : m, my = col ? m : 0;
  return p.x < it.x - mx || p.x > it.x + it.w + mx || p.y < it.y - my || p.y > it.y + it.h + my;
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

/** How long a pill takes to grow and take its colour, or go back, in ms; a plus, a little quicker. */
const PILL_TURN = 75, PLUS_TURN = 50;
/** How far each pill is on its way to lit (1) or not (0), and since when. */
const turns = new Map<string, { on: boolean; from: number; at: number }>();
function litNow(ed: Editor, key: string, on: boolean, ms = PILL_TURN): number {
  const now = performance.now(), at = (t: { on: boolean; from: number; at: number }) => {
    const k = Math.min(1, (now - t.at) / ms), e = 1 - (1 - k) * (1 - k);
    return t.from + ((t.on ? 1 : 0) - t.from) * e;
  };
  let t = turns.get(key);
  if (!t) { if (!on) return 0; turns.set(key, (t = { on, from: 0, at: now })); }
  else if (t.on !== on) turns.set(key, (t = { on, from: at(t), at: now }));
  if (now - t.at < ms) ed.requestRender();
  else if (!t.on) turns.delete(key);
  return at(t);
}

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
    // Coming in and going as the pointer comes into its column or row and leaves it.
    const shown = litNow(ed, `${it.id}:${g.axis}:${g.index}:seen`, seen(ed, it, g));
    if (!shown) continue;
    const dragged = drag?.grip.axis === g.axis && drag.grip.index === g.index;
    const shift = dragged && drag ? (g.axis === 'col' ? { x: (drag.at.x - drag.from.x) * z, y: 0 } : { x: 0, y: (drag.at.y - drag.from.y) * z }) : { x: 0, y: 0 };
    const on = dragged || (hot?.axis === g.axis && hot.index === g.index), lit = litNow(ed, `${it.id}:${g.axis}:${g.index}`, on);
    // Under the pointer or dragged: 1.2 × 1.4 times as big, in the selection frame's blue, going there
    // and back smoothly.
    const k = 1 + (HOT - 1) * lit, p = gripScreen(ed, g, k), [w, h] = g.axis === 'col' ? [LONG * k, THICK * k] : [THICK * k, LONG * k];
    const cx = p.x + shift.x, cy = p.y + shift.y;
    ctx.beginPath();
    ctx.roundRect(cx - w / 2, cy - h / 2, w, h, (THICK * k) / 2);
    ctx.globalAlpha = shown;
    ctx.fillStyle = '#fff';
    ctx.fill();
    ctx.globalAlpha = (0.3 + (PICK_FRAME - 0.3) * lit) * shown;
    ctx.fillStyle = color;
    ctx.fill();
    // Three white dots along it: a thing to take hold of.
    ctx.globalAlpha = shown;
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
  // The pluses, faint and a tenth smaller till the pointer's on one.
  if (!drag) for (const w of ['row', 'col'] as const) {
    // Under the pointer: full size and strength, growing there and back smoothly.
    const c = plusAt(ed, it, w), on = litNow(ed, `${it.id}:${w}:hot`, hotPlus === w, PLUS_TURN), r = PLUS_R * (0.9 + 0.1 * on);
    // Coming in at the new edge.
    const t = cameIn[w], k = t === undefined ? 1 : Math.min(1, (performance.now() - t) / PLUS_IN_MS);
    if (k < 1) ed.requestRender(); else delete cameIn[w];
    ctx.globalAlpha = (0.5 + 0.5 * on) * k;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(c.x, c.y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = (0.75 + 0.25 * on) * k;
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1.5 + 0.5 * on;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(c.x - r * 0.45, c.y); ctx.lineTo(c.x + r * 0.45, c.y);
    ctx.moveTo(c.x, c.y - r * 0.45); ctx.lineTo(c.x, c.y + r * 0.45);
    ctx.stroke();
  }
  // Those on the lines by the column and row under the pointer, coming in and going with them.
  for (const q of insertPluses(ed, it)) {
    const shown = litNow(ed, `${it.id}:${q.key}:seen`, q.seen);
    if (!shown) continue;
    const on = litNow(ed, `${it.id}:${q.key}:hot`, hotPlus === q.key, PLUS_TURN), r = INS_R * (0.9 + 0.1 * on);
    ctx.globalAlpha = (0.5 + 0.5 * on) * shown;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(q.p.x, q.p.y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = (0.75 + 0.25 * on) * shown;
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = (1.5 + 0.5 * on) * 0.8;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(q.p.x - r * 0.45, q.p.y); ctx.lineTo(q.p.x + r * 0.45, q.p.y);
    ctx.moveTo(q.p.x, q.p.y - r * 0.45); ctx.lineTo(q.p.x, q.p.y + r * 0.45);
    ctx.stroke();
  }
  ctx.restore();
}

/** The puffs, as when something's dropped off the macOS Dock: a few white clouds swelling and fading. */
function drawPuffs(ctx: CanvasRenderingContext2D, ed: Editor): void {
  const now = performance.now();
  while (puffs.length && now - puffs[0].t > PUFF) puffs.shift();
  if (!puffs.length) return;
  ctx.save();
  ctx.fillStyle = '#fff';
  // (A faint shadow, for white on white.)
  ctx.shadowColor = 'rgba(0, 0, 0, .12)';
  ctx.shadowBlur = 4;
  for (const p of puffs) {
    const k = (now - p.t) / PUFF, e = 1 - (1 - k) ** 2;
    ctx.globalAlpha = 0.9 * (1 - k);
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
