import type { Editor } from '../editor/editor';
import type { Item } from '../model/types';
import { instanceBounds, type Point } from '../canvas/geometry';
import { drawGapHandle, gapReach } from './gapPill';
import type { AlignTo } from './align';

/**
 * "Авторасположение": what's selected laid out in an even grid, a little apart, rows and columns as
 * near square as they come; while it's on (its button lit), the gaps between rows and between columns
 * have a handle each, dragged to set them, as in Figma.
 */

/** The grid now: what's in it in order (row by row), how many columns, the gaps across and down. */
/** `ax`, `ay`: how they were lined up meanwhile («Выравнивание»), kept as the grid's laid out again. */
export interface Tidy { ids: string[]; cols: number; gx: number; gy: number; ax?: AlignTo; ay?: AlignTo }
let tidy: Tidy | null = null;
/** The last grid laid out, and where each of it was then: picked again untouched, it's taken up as it is. */
let last: (Tidy & { at: Map<string, Point> }) | null = null;
const listeners = new Set<() => void>();
export const tidyNow = () => tidy;
export const subscribeTidy = (fn: () => void) => { listeners.add(fn); return () => listeners.delete(fn); };
const set = (t: Tidy | null) => { tidy = t; listeners.forEach((fn) => fn()); };
/** Notes the grid as it's laid out now, to be taken up again (see startTidy). */
function remember(ed: Editor, t: Tidy): void {
  last = { ...t, at: new Map(tidyItems(ed, t).map((i) => [i.id, { x: i.x, y: i.y }])) };
}

/** The gap a grid starts with. */
export const TIDY_GAP = 24;

/** How many columns a heap is laid out in: roughly in a row already (their middles less than 0.8 of
 *  their height apart up and down), one row; roughly in a column, one column; else as near square as
 *  they come. */
export function gridCols(items: Item[]): number {
  const n = items.length, mx = items.map((i) => i.x + i.w / 2), my = items.map((i) => i.y + i.h / 2);
  const h = items.reduce((s, i) => s + i.h, 0) / n, w = items.reduce((s, i) => s + i.w, 0) / n;
  const spreadX = Math.max(...mx) - Math.min(...mx), spreadY = Math.max(...my) - Math.min(...my);
  if (spreadY < h * 0.8 && spreadX >= spreadY) return n;
  if (spreadX < w * 0.8) return 1;
  return Math.ceil(Math.sqrt(n));
}

/** These items in reading order: by rows of `cols` top to bottom, each left to right. */
export function gridOrder(items: Item[], cols: number): Item[] {
  const byY = [...items].sort((a, b) => a.y + a.h / 2 - (b.y + b.h / 2) || a.x - b.x), out: Item[] = [];
  for (let i = 0; i < byY.length; i += cols) out.push(...byY.slice(i, i + cols).sort((a, b) => a.x - b.x));
  return out;
}

/** Where each goes in a grid of `cols` columns from `origin`: each column as wide as its widest, each
 *  row as tall as its tallest, `gx` and `gy` between them, each item at its cell's top left. */
export function gridPlaces(items: Item[], cols: number, gx: number, gy: number, origin: Point): Map<string, Point> {
  const rows = Math.ceil(items.length / cols), cw = Array(cols).fill(0), rh = Array(rows).fill(0);
  items.forEach((it, i) => { cw[i % cols] = Math.max(cw[i % cols], it.w); rh[Math.floor(i / cols)] = Math.max(rh[Math.floor(i / cols)], it.h); });
  const xs = cw.map((_, c) => origin.x + cw.slice(0, c).reduce((s, w) => s + w + gx, 0));
  const ys = rh.map((_, r) => origin.y + rh.slice(0, r).reduce((s, h) => s + h + gy, 0));
  return new Map(items.map((it, i) => [it.id, { x: Math.round(xs[i % cols]), y: Math.round(ys[Math.floor(i / cols)]) }]));
}

/** The gaps' lines: down the middle of each gap between columns, across that of each between rows,
 *  as long as the grid. */
export function gapLines(items: Item[], t: Tidy): Array<{ axis: 'col' | 'row'; at: number; from: number; to: number }> {
  if (!items.length) return [];
  const cols = t.cols, rows = Math.ceil(items.length / cols);
  const x0 = Math.min(...items.map((i) => i.x)), y0 = Math.min(...items.map((i) => i.y));
  const x1 = Math.max(...items.map((i) => i.x + i.w)), y1 = Math.max(...items.map((i) => i.y + i.h));
  const out: Array<{ axis: 'col' | 'row'; at: number; from: number; to: number }> = [];
  for (let c = 1; c < Math.min(cols, items.length); c++) {
    const right = Math.max(...items.filter((_, i) => i % cols === c - 1).map((i) => i.x + i.w));
    out.push({ axis: 'col', at: right + t.gx / 2, from: y0, to: y1 });
  }
  for (let r = 1; r < rows; r++) {
    const bottom = Math.max(...items.filter((_, i) => Math.floor(i / cols) === r - 1).map((i) => i.y + i.h));
    out.push({ axis: 'row', at: bottom + t.gy / 2, from: x0, to: x1 });
  }
  return out;
}

/** An item as it's seen: an instance by its contents, without its component's empty margins. */
const seen = (ed: Editor, it: Item): Item => (it.inst ? { ...it, ...instanceBounds(it, ed.board.list()) } : it);

/** The grid's items as they are now (as they're seen), in its order. */
export const tidyItems = (ed: Editor, t: Tidy) => t.ids.map((id) => ed.board.get(id)).filter((i): i is Item => !!i).map((i) => seen(ed, i));

/** What's picked, but for what's in instances (taken along with them). */
const picked = (ed: Editor) => [...ed.selection].filter((id) => !ed.board.get(id)?.host);

/** Moves each to its place, with what goes with it (what a frame holds, a mind map node's branches). */
function place(ed: Editor, items: Item[], places: Map<string, Point>): void {
  const moves = new Map<string, Point>();
  for (const it of items) {
    const to = places.get(it.id)!, dx = to.x - it.x, dy = to.y - it.y;
    if (!dx && !dy) continue;
    // Moved as it is on the board (an instance by its frame, not as it's seen).
    for (const [id, o] of ed.carried([ed.board.get(it.id) ?? it])) moves.set(id, { x: o.x + dx, y: o.y + dy });
  }
  ed.board.transact(() => moves.forEach((p, id) => ed.board.update(id, p)));
}

/** The ways to lay them out: in a grid as near square as they come, in a row, in a column (or, with
 *  none asked, as they lie: see gridCols). */
export type TidyShape = 'grid' | 'row' | 'col';

/** How many columns a shape takes for `n` of them. */
export const shapeCols = (shape: TidyShape, n: number): number => (shape === 'row' ? n : shape === 'col' ? 1 : Math.ceil(Math.sqrt(n)));

/** Lays out the selected in a grid, a little apart, and turns the gap handles on. */
export function startTidy(ed: Editor, shape?: TidyShape): void {
  const sel = ed.selectedItems().filter((i) => !i.lock && !i.host).map((i) => seen(ed, i));
  if (sel.length < 2) return;
  const cols = shape ? shapeCols(shape, sel.length) : gridCols(sel);
  // The last grid, picked again with nothing in it moved since: its handles back, as it is.
  if (last && last.ids.length === sel.length && (!shape || last.cols === cols) && sel.every((i) => { const p = last!.at.get(i.id); return p && p.x === i.x && p.y === i.y; })) {
    set({ ids: last.ids, cols: last.cols, gx: last.gx, gy: last.gy, ax: last.ax, ay: last.ay });
    return;
  }
  const items = gridOrder(sel, cols);
  const origin = { x: Math.min(...sel.map((i) => i.x)), y: Math.min(...sel.map((i) => i.y)) };
  ed.board.beginGesture();
  place(ed, items, gridPlaces(items, cols, TIDY_GAP, TIDY_GAP, origin));
  ed.board.endGesture();
  set({ ids: items.map((i) => i.id), cols, gx: TIDY_GAP, gy: TIDY_GAP });
  remember(ed, tidy!);
}

/** Places lined up as the grid was meanwhile (see alignItems): as they'd be lined up there. */
function aligned(items: Item[], places: Map<string, Point>, t: Tidy): Map<string, Point> {
  if (!t.ax && !t.ay) return places;
  const box = items.filter((i) => places.has(i.id)).map((i) => ({ i, ...places.get(i.id)! }));
  if (!box.length) return places;
  const x1 = Math.min(...box.map((b) => b.x)), x2 = Math.max(...box.map((b) => b.x + b.i.w));
  const y1 = Math.min(...box.map((b) => b.y)), y2 = Math.max(...box.map((b) => b.y + b.i.h));
  return new Map(box.map(({ i, x, y }) => [i.id, {
    x: Math.round(t.ax === 'left' ? x1 : t.ax === 'right' ? x2 - i.w : t.ax === 'center' ? (x1 + x2) / 2 - i.w / 2 : x),
    y: Math.round(t.ay === 'top' ? y1 : t.ay === 'bottom' ? y2 - i.h : t.ay === 'middle' ? (y1 + y2) / 2 - i.h / 2 : y),
  }]));
}

/** Lined up so («Выравнивание») while laid out: kept so as it's laid out again. */
export function noteAlign(ed: Editor, to: AlignTo): void {
  if (!tidy || !tidyMatches(ed)) return;
  set({ ...tidy, ...(['left', 'center', 'right'].includes(to) ? { ax: to } : { ay: to }) });
  remember(ed, tidy);
}

/** The gaps changed: the grid laid out again from where its top left is now. A gap may go below
 *  nothing, items overlapping (for those with empty margins of their own), but never more than the
 *  smallest of them less 8. */
export function setGaps(ed: Editor, gx: number, gy: number): void {
  if (!tidy) return;
  const items = tidyItems(ed, tidy);
  if (!items.length) return;
  gx = Math.max(8 - Math.min(...items.map((i) => i.w)), gx);
  gy = Math.max(8 - Math.min(...items.map((i) => i.h)), gy);
  const origin = { x: Math.min(...items.map((i) => i.x)), y: Math.min(...items.map((i) => i.y)) };
  set({ ...tidy, gx, gy });
  place(ed, items, aligned(items, gridPlaces(items, tidy.cols, gx, gy, origin), tidy));
  remember(ed, tidy!);
}

/**
 * Where a dragged item of the grid goes, by the cell the board point is in (cells as big as the
 * biggest, the gaps between, from `origin`): its order among the others and the columns then. Right
 * of the last column, the grid takes another; below the rows the others fill, it takes fewer, so the
 * item starts a row of its own.
 */
export function dropSlot(others: Item[], dragged: Item, cols: number, gx: number, gy: number, origin: Point, at: Point): { order: Item[]; cols: number } {
  const all = [...others, dragged], cw = Math.max(...all.map((i) => i.w)) + gx, ch = Math.max(...all.map((i) => i.h)) + gy;
  const m = others.length, rows = Math.max(1, Math.ceil(m / cols));
  const col = Math.max(0, Math.min(cols, Math.floor((at.x - origin.x) / cw))), row = Math.max(0, Math.min(rows, Math.floor((at.y - origin.y) / ch)));
  let n = cols;
  if (col >= cols) n = cols + 1;
  else if (row >= rows && m) n = Math.max(1, Math.ceil(m / row));
  const index = Math.min(row * n + Math.min(col, n - 1), m);
  return { order: [...others.slice(0, index), dragged, ...others.slice(index)], cols: n };
}

/** Dragging one of the grid's items: from where it was taken (its offset from the pointer), the
 *  grid's top left and the item's place in it as it's dragged. */
let drag: { id: string; dx: number; dy: number; origin: Point } | null = null;
export const tidyDragging = () => !!drag;

/** Whether an item of the grid is at this board point (picked up, it's dragged within the grid). */
export function tidyItemAt(ed: Editor, w: Point): Item | null {
  if (!tidy || !tidyHolds(ed)) return null;
  return [...tidyItems(ed, tidy)].reverse().find((i) => w.x >= i.x && w.x <= i.x + i.w && w.y >= i.y && w.y <= i.y + i.h) ?? null;
}

export function startTidyDrag(ed: Editor, it: Item, w: Point): void {
  if (!tidy) return;
  const items = tidyItems(ed, tidy);
  drag = { id: it.id, dx: w.x - it.x, dy: w.y - it.y, origin: { x: Math.min(...items.map((i) => i.x)), y: Math.min(...items.map((i) => i.y)) } };
  ed.board.beginGesture();
}

/** The dragged item follows the pointer; the others make room for it where it would go. */
export function moveTidyDrag(ed: Editor, w: Point): void {
  if (!tidy || !drag) return;
  const raw = ed.board.get(drag.id), it = raw && seen(ed, raw);
  if (!it) return;
  const others = tidyItems(ed, tidy).filter((i) => i.id !== it.id);
  const slot = dropSlot(others, it, tidy.cols, tidy.gx, tidy.gy, drag.origin, w);
  const places = aligned([...slot.order, it], gridPlaces(slot.order, slot.cols, tidy.gx, tidy.gy, drag.origin), tidy);
  places.set(it.id, { x: Math.round(w.x - drag.dx), y: Math.round(w.y - drag.dy) });
  place(ed, slot.order, places);
}

/** Let go: it takes its place in the grid, the grid kept so. */
export function endTidyDrag(ed: Editor, w: Point): void {
  if (!tidy || !drag) return;
  const raw = ed.board.get(drag.id), it = raw && seen(ed, raw), origin = drag.origin;
  drag = null;
  if (it) {
    const others = tidyItems(ed, tidy).filter((i) => i.id !== it.id), slot = dropSlot(others, it, tidy.cols, tidy.gx, tidy.gy, origin, w);
    place(ed, slot.order, aligned(slot.order, gridPlaces(slot.order, slot.cols, tidy.gx, tidy.gy, origin), tidy));
    set({ ...tidy, ids: slot.order.map((i) => i.id), cols: slot.cols });
    remember(ed, tidy!);
  }
  ed.board.endGesture();
}

export const stopTidy = () => set(null);

/** Whether the grid is what's selected. */
export const tidyMatches = (ed: Editor): boolean => !!tidy && tidy.ids.length === picked(ed).length && tidy.ids.every((id) => ed.selection.has(id));

/** The same, the grid turned off when it isn't (anything else picked). */
export function tidyHolds(ed: Editor): boolean {
  const holds = tidyMatches(ed);
  if (tidy && !holds) set(null);
  return holds;
}

/** The gap handle being dragged or under the pointer, drawn stronger. */
let hot: 'col' | 'row' | null = null;
export const setHotGap = (h: 'col' | 'row' | null) => { hot = h; };

/** The gap line near a screen point (see gapReach; along the grid), and which way it runs. */
export function gapAt(ed: Editor, sp: Point): 'col' | 'row' | null {
  if (!tidy || !tidyHolds(ed)) return null;
  const w = ed.toWorld(sp.x, sp.y), near = gapReach(ed, w);
  for (const g of gapLines(tidyItems(ed, tidy), tidy)) {
    const along = g.axis === 'col' ? w.y : w.x, across = g.axis === 'col' ? w.x : w.y;
    if (Math.abs(across - g.at) <= near && along >= g.from && along <= g.to) return g.axis;
  }
  return null;
}

/** The gaps' handles over the board, at screen scale: a faint line down each gap, a pill in its middle. */
export function drawTidy(ctx: CanvasRenderingContext2D, ed: Editor): void {
  if (!tidy || !tidyHolds(ed)) return;
  ctx.save();
  for (const g of gapLines(tidyItems(ed, tidy), tidy)) {
    const a = ed.toScreen(g.axis === 'col' ? { x: g.at, y: g.from } : { x: g.from, y: g.at });
    const b = ed.toScreen(g.axis === 'col' ? { x: g.at, y: g.to } : { x: g.to, y: g.at });
    drawGapHandle(ctx, ed, `grid:${g.axis}`, a, b, g.axis, hot === g.axis, '#E5484D');
  }
  ctx.restore();
}
