import type { Item } from './types';
import type { Point, Rect } from '../canvas/geometry';

/**
 * Tables: column widths (`cols`) and row heights (`rows`) in board units, and the cells' text row by
 * row (`cells`). The item's w and h are always the sums of the widths and heights.
 */
export const COL_W = 120, ROW_H = 40, MIN_COL = 24, MIN_ROW = 24;

export const colsOf = (it: Item): number[] => (it.cols?.length ? it.cols : [COL_W, COL_W, COL_W]);
export const rowsOf = (it: Item): number[] => (it.rows?.length ? it.rows : [ROW_H, ROW_H, ROW_H]);
export const cellText = (it: Item, i: number): string => it.cells?.[i] ?? '';

const sum = (a: number[]) => a.reduce((s, v) => s + v, 0);
const starts = (a: number[]) => a.map((_, i) => sum(a.slice(0, i)));
/** Index of the last start at or before v, -1 if none. */
const lastAtOrBefore = (a: number[], v: number) => a.reduce((found, s, i) => (v >= s ? i : found), -1);

/** A new table's fields: `n` columns and `m` rows of the default size. */
export const newTable = (n = 3, m = 3): Partial<Item> => ({
  cols: Array(n).fill(COL_W), rows: Array(m).fill(ROW_H), cells: Array(n * m).fill(''), w: n * COL_W, h: m * ROW_H,
});

/** The box of cell i (row by row) on the board. */
export function cellRect(it: Item, i: number): Rect {
  const cols = colsOf(it), rows = rowsOf(it), c = i % cols.length, r = Math.floor(i / cols.length);
  return { x: it.x + starts(cols)[c], y: it.y + starts(rows)[r], w: cols[c], h: rows[r] };
}

/** The cell under a point, or null outside the table. */
export function cellAt(it: Item, p: Point): number | null {
  const cols = colsOf(it), rows = rowsOf(it);
  const c = lastAtOrBefore(starts(cols), p.x - it.x), r = lastAtOrBefore(starts(rows), p.y - it.y);
  if (c < 0 || r < 0 || p.x > it.x + it.w || p.y > it.y + it.h) return null;
  return r * cols.length + c;
}

/** A line of a table: the right edge of a column or the bottom edge of a row. */
export interface TableLine { id: string; axis: 'col' | 'row'; index: number }

/** The column's right edge or the row's bottom edge within `tol` of the point (the outer right and
 *  bottom edges included), as the line to drag to resize that column or row. */
export function lineAt(it: Item, p: Point, tol: number): { axis: 'col' | 'row'; index: number } | null {
  if (p.x < it.x - tol || p.x > it.x + it.w + tol || p.y < it.y - tol || p.y > it.y + it.h + tol) return null;
  const cols = colsOf(it), rows = rowsOf(it);
  const col = cols.findIndex((_, i) => Math.abs(it.x + sum(cols.slice(0, i + 1)) - p.x) <= tol);
  if (col >= 0) return { axis: 'col', index: col };
  const row = rows.findIndex((_, i) => Math.abs(it.y + sum(rows.slice(0, i + 1)) - p.y) <= tol);
  return row >= 0 ? { axis: 'row', index: row } : null;
}

/** Fields after setting one column's width or one row's height. */
export function withSize(it: Item, axis: 'col' | 'row', index: number, size: number): Partial<Item> {
  if (axis === 'col') {
    const cols = colsOf(it).map((v, i) => (i === index ? Math.max(MIN_COL, Math.round(size)) : v));
    return { cols, w: sum(cols) };
  }
  const rows = rowsOf(it).map((v, i) => (i === index ? Math.max(MIN_ROW, Math.round(size)) : v));
  return { rows, h: sum(rows) };
}

/**
 * Sizes after moving the picked lines (line i ends column or row i) by d together, the gaps between
 * them kept: the lines past the last picked one go along, those before the first stay put, and an
 * unpicked line between picked ones stays put too. d is held back so nothing gets under `min`.
 */
export function movedLines(sizes: number[], picked: number[], d: number, min: number): number[] {
  const last = Math.max(...picked), moves = (j: number) => j >= 0 && (picked.includes(j) || j > last);
  const coef = sizes.map((_, j) => Number(moves(j)) - Number(moves(j - 1)));
  let lo = -Infinity, hi = Infinity;
  sizes.forEach((s, j) => { if (coef[j] > 0) lo = Math.max(lo, min - s); if (coef[j] < 0) hi = Math.min(hi, s - min); });
  const k = Math.min(hi, Math.max(lo, d));
  return sizes.map((s, j) => Math.round(s + coef[j] * k));
}

/** Fields after adding (+1) or removing (-1) the last column or row; a table keeps at least one of each.
 *  A new column or row is as big as the last one. */
export function withCount(it: Item, axis: 'col' | 'row', delta: 1 | -1): Partial<Item> {
  const cols = colsOf(it), rows = rowsOf(it), n = cols.length, size = n * rows.length;
  const cells = Array.from({ length: size }, (_, i) => cellText(it, i));
  const fmt = Array.from({ length: size }, (_, i) => it.cellFmt?.[i] ?? null);
  // A cell's text and formatting move as one.
  const regrid = <T>(all: T[], blank: T): T[] => axis === 'col'
    ? rows.flatMap((_, r) => { const row = all.slice(r * n, r * n + n); return delta > 0 ? [...row, blank] : row.slice(0, -1); })
    : delta > 0 ? [...all, ...Array<T>(n).fill(blank)] : all.slice(0, -n);
  const keepFmt = (f: typeof fmt) => (f.some(Boolean) ? f : undefined);
  if (axis === 'col') {
    if (delta < 0 && n === 1) return {};
    const next = delta > 0 ? [...cols, cols[n - 1]] : cols.slice(0, -1);
    return { cols: next, cells: regrid(cells, ''), cellFmt: keepFmt(regrid(fmt, null)), w: sum(next) };
  }
  if (delta < 0 && rows.length === 1) return {};
  const next = delta > 0 ? [...rows, rows[rows.length - 1]] : rows.slice(0, -1);
  return { rows: next, cells: regrid(cells, ''), cellFmt: keepFmt(regrid(fmt, null)), h: sum(next) };
}

/** The text formatting a cell can have of its own, over the table's. A null in a cell's formatting
 *  means the usual look there, whatever the table's. */
export const CELL_FORMAT = ['fs', 'ff', 'fw', 'fi', 'fu', 'fx', 'tc', 'mk', 'ta', 'ls'] as const;

/** Cell i as an item of its own: its box and text, in the table's formatting with its own over it. */
export function cellItem(it: Item, i: number): Item {
  const own = Object.entries(it.cellFmt?.[i] ?? {}).map(([k, v]) => [k, v ?? undefined]);
  return { ...it, ...cellRect(it, i), text: cellText(it, i), ls: undefined, ...Object.fromEntries(own) };
}

/** Fields for formatting cell i by `patch`; a field set back to the usual (undefined) is a null when
 *  the table has formatting of its own there, so the cell keeps the usual look. */
export function withCellFormat(it: Item, i: number, patch: Partial<Item>): Partial<Item> {
  const size = colsOf(it).length * rowsOf(it).length;
  const fmt = Array.from({ length: size }, (_, k) => it.cellFmt?.[k] ?? null);
  const own: Record<string, unknown> = { ...(fmt[i] ?? {}) };
  for (const [k, v] of Object.entries(patch)) {
    if (!(CELL_FORMAT as readonly string[]).includes(k)) continue;
    if (v !== undefined) own[k] = v;
    else if ((it as unknown as Record<string, unknown>)[k] !== undefined) own[k] = null;
    else delete own[k];
  }
  fmt[i] = Object.keys(own).length ? own : null;
  return { cellFmt: fmt.some(Boolean) ? fmt : undefined };
}

/** Fields for formatting the whole table by `patch`: every cell takes it, dropping its own there. */
export function withTableFormat(it: Item, patch: Partial<Item>): Partial<Item> {
  const fmt = it.cellFmt?.map((f) => {
    if (!f) return null;
    const own = { ...f };
    for (const k of Object.keys(patch)) delete own[k];
    return Object.keys(own).length ? own : null;
  });
  return { ...patch, cellFmt: fmt?.some(Boolean) ? fmt : undefined };
}

/** Fields after resizing the whole table to w × h: every column and row scales alike. */
export function withScale(it: Item, w: number, h: number): Partial<Item> {
  const kx = w / it.w, ky = h / it.h, r = (v: number) => Math.round(v * 10) / 10;
  const cols = colsOf(it).map((v) => r(v * kx)), rows = rowsOf(it).map((v) => r(v * ky));
  return { cols, rows, w: sum(cols), h: sum(rows) };
}
