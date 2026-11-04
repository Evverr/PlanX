import type { Editor } from '../editor/editor';
import type { Item } from '../model/types';
import { cellText, colsOf, rowsOf } from '../model/table';
import { withRemoved } from './tableMove';

/**
 * "Удаление строк и столбцов": whole rows or columns of a table picked (one or more), Delete takes
 * their text first, and pressed again with them empty, the rows or columns themselves.
 */

/** The rows (or columns) the picked cells are, whole and nothing else; null when they aren't. */
export function wholeLines(it: Item, cells: number[]): { axis: 'col' | 'row'; lines: number[] } | null {
  const n = colsOf(it).length, m = rowsOf(it).length, picked = new Set(cells);
  for (const axis of ['row', 'col'] as const) {
    const lines = [...new Set(cells.map((i) => (axis === 'row' ? Math.floor(i / n) : i % n)))];
    const along = axis === 'row' ? n : m, count = axis === 'row' ? m : n;
    // All of them would leave none: not that way.
    if (lines.length >= count) continue;
    const whole = lines.every((l) => Array.from({ length: along }, (_, k) => (axis === 'row' ? l * n + k : k * n + l)).every((i) => picked.has(i)));
    if (whole && picked.size === lines.length * along) return { axis, lines };
  }
  return null;
}

/** Fields without the rows (or columns) `lines`. */
export function withoutLines(it: Item, axis: 'col' | 'row', lines: number[]): Partial<Item> {
  let cur = it, patch: Partial<Item> = {};
  for (const l of [...lines].sort((a, b) => b - a)) {
    patch = { ...patch, ...withRemoved(cur, axis, l) };
    cur = { ...cur, ...patch } as Item;
  }
  return patch;
}

/** Delete with cells of the selected table picked, empty: their rows or columns go, if they're whole
 *  ones. Whether they went. */
export function cutLines(ed: Editor): boolean {
  const it = ed.selectedItems()[0];
  if (it?.type !== 'table' || ed.cells.some((i) => cellText(it, i))) return false;
  const whole = wholeLines(it, ed.cells);
  if (!whole) return false;
  ed.board.update(it.id, withoutLines(it, whole.axis, whole.lines));
  ed.cells = [];
  ed.cellAnchor = null;
  ed.emit();
  ed.requestRender();
  return true;
}
