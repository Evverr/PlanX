import type { Editor } from '../editor/editor';
import type { Item } from '../model/types';
import { CELL_FORMAT, cellText, withCellFormat } from '../model/table';

/**
 * "Таблица помнит формат": the text formatting last set in a table's cell (its alignment, weight,
 * size…) is remembered for that table, and an empty cell of it opened for typing, without formatting
 * of its own, takes it on: the next cell goes on as the last one was set, the text panel showing it.
 */

/** Each table's formatting as last set in a cell of it. */
const last = new Map<string, Record<string, unknown>>();

/** A cell of table `id` given `patch`: what of it is a cell's formatting, remembered. */
export function noteCellFormat(id: string, patch: Partial<Item>): void {
  const own = Object.fromEntries(Object.entries(patch).filter(([k]) => (CELL_FORMAT as readonly string[]).includes(k) && k !== 'bg' && k !== 'bgo'));
  if (Object.keys(own).length) last.set(id, { ...last.get(id), ...own });
}

/** Cell `cell` of table `it` opened for typing: empty and plain, it takes on what was last set. */
export function carryCellFormat(ed: Editor, it: Item, cell: number): void {
  const look = last.get(it.id);
  if (!look || cellText(it, cell) || Object.keys(it.cellFmt?.[cell] ?? {}).some((k) => k in look)) return;
  ed.board.update(it.id, withCellFormat(it, cell, look as Partial<Item>));
}
