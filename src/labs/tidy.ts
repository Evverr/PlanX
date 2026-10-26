import type { Editor } from '../editor/editor';
import type { Item } from '../model/types';
import type { Point } from '../canvas/geometry';

/**
 * "Авторасположение": what's selected laid out in an even grid, a little apart, rows and columns as
 * near square as they come; while it's on (its button lit), the gaps between rows and between columns
 * have a handle each, dragged to set them, as in Figma.
 */

/** The grid now: what's in it in order (row by row), how many columns, the gaps across and down. */
export interface Tidy { ids: string[]; cols: number; gx: number; gy: number }
let tidy: Tidy | null = null;
const listeners = new Set<() => void>();
export const tidyNow = () => tidy;
export const subscribeTidy = (fn: () => void) => { listeners.add(fn); return () => listeners.delete(fn); };
const set = (t: Tidy | null) => { tidy = t; listeners.forEach((fn) => fn()); };

/** The gap a grid starts with. */
export const TIDY_GAP = 24;

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

/** The grid's items as they are now, in its order. */
export const tidyItems = (ed: Editor, t: Tidy) => t.ids.map((id) => ed.board.get(id)).filter((i): i is Item => !!i);

/** Moves each to its place, with what goes with it (what a frame holds, a mind map node's branches). */
function place(ed: Editor, items: Item[], places: Map<string, Point>): void {
  const moves = new Map<string, Point>();
  for (const it of items) {
    const to = places.get(it.id)!, dx = to.x - it.x, dy = to.y - it.y;
    if (!dx && !dy) continue;
    for (const [id, o] of ed.carried([it])) moves.set(id, { x: o.x + dx, y: o.y + dy });
  }
  ed.board.transact(() => moves.forEach((p, id) => ed.board.update(id, p)));
}

/** Lays out the selected in a grid, a little apart, and turns the gap handles on. */
export function startTidy(ed: Editor): void {
  const sel = ed.selectedItems().filter((i) => !i.lock && !i.host);
  if (sel.length < 2) return;
  const cols = Math.ceil(Math.sqrt(sel.length)), items = gridOrder(sel, cols);
  const origin = { x: Math.min(...sel.map((i) => i.x)), y: Math.min(...sel.map((i) => i.y)) };
  ed.board.beginGesture();
  place(ed, items, gridPlaces(items, cols, TIDY_GAP, TIDY_GAP, origin));
  ed.board.endGesture();
  set({ ids: items.map((i) => i.id), cols, gx: TIDY_GAP, gy: TIDY_GAP });
}

/** The gaps changed: the grid laid out again from where its top left is now. */
export function setGaps(ed: Editor, gx: number, gy: number): void {
  if (!tidy) return;
  const items = tidyItems(ed, tidy);
  if (!items.length) return;
  const origin = { x: Math.min(...items.map((i) => i.x)), y: Math.min(...items.map((i) => i.y)) };
  set({ ...tidy, gx, gy });
  place(ed, items, gridPlaces(items, tidy.cols, gx, gy, origin));
}

export const stopTidy = () => set(null);

/** Whether the grid is what's selected. */
export const tidyMatches = (ed: Editor): boolean => !!tidy && tidy.ids.length === ed.selection.size && tidy.ids.every((id) => ed.selection.has(id));

/** The same, the grid turned off when it isn't (anything else picked). */
export function tidyHolds(ed: Editor): boolean {
  const holds = tidyMatches(ed);
  if (tidy && !holds) set(null);
  return holds;
}

/** The gap handle being dragged or under the pointer, drawn stronger. */
let hot: 'col' | 'row' | null = null;
export const setHotGap = (h: 'col' | 'row' | null) => { hot = h; };

/** The gap line near a screen point (6px either side, along the grid), and which way it runs. */
export function gapAt(ed: Editor, sp: Point): 'col' | 'row' | null {
  if (!tidy || !tidyHolds(ed)) return null;
  const w = ed.toWorld(sp.x, sp.y), near = 6 / ed.cam.z;
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
    const strong = hot === g.axis;
    ctx.strokeStyle = '#E5484D';
    ctx.globalAlpha = strong ? 0.7 : 0.35;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
    // The pill, 4 across and 16 along, in the middle.
    const m = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, [pw, ph] = g.axis === 'col' ? [4, 16] : [16, 4];
    ctx.globalAlpha = 1;
    ctx.fillStyle = strong ? '#E5484D' : '#fff';
    ctx.strokeStyle = '#E5484D';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(m.x - pw / 2, m.y - ph / 2, pw, ph, 2);
    ctx.fill();
    ctx.stroke();
  }
  ctx.restore();
}
