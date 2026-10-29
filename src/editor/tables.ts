import type { Item } from '../model/types';
import type { Point } from '../canvas/geometry';
import { colsOf, lineAt, rowsOf, withCellFormat, type TableLine } from '../model/table';
import type { Editor } from './editor';

/** How long the mouse rests on a table line before it can be dragged, in ms. */
const LINE_REST = 500;

export const sameLine = (a: TableLine | null, b: TableLine | null): boolean =>
  a === b || (!!a && !!b && a.id === b.id && a.axis === b.axis && a.index === b.index);

/** Picks a cell of the selected table: on its own (and as where a range starts), with `range` every
 *  cell in the box from there to it (a row, a column, a corner), with `toggle` adding or dropping it. */
export function pickCell(ed: Editor, i: number, how: 'one' | 'range' | 'toggle'): void {
  const it = ed.selectedItems()[0];
  if (how === 'range' && it?.type === 'table' && ed.cellAnchor !== null) {
    const n = colsOf(it).length, a = ed.cellAnchor;
    const [r1, r2] = [Math.floor(a / n), Math.floor(i / n)].sort((x, y) => x - y), [c1, c2] = [a % n, i % n].sort((x, y) => x - y);
    const box: number[] = [];
    for (let r = r1; r <= r2; r++) for (let c = c1; c <= c2; c++) box.push(r * n + c);
    ed.cells = box;
  } else if (how === 'toggle') {
    ed.cells = ed.cells.includes(i) ? ed.cells.filter((c) => c !== i) : [...ed.cells, i];
    ed.cellAnchor = i;
  } else {
    ed.cells = [i];
    ed.cellAnchor = i;
  }
  ed.emit();
  ed.requestRender();
}

/** Sets a cell field on the picked cells of the selected table, or on every cell when none is. */
export function formatCells(ed: Editor, fields: Record<string, unknown>): void {
  const it = ed.selectedItems()[0];
  if (it?.type !== 'table') return;
  const all = Array.from({ length: colsOf(it).length * rowsOf(it).length }, (_, i) => i);
  let patch: Partial<Item> = {};
  for (const i of ed.cells.length ? ed.cells : all) patch = withCellFormat({ ...it, ...patch }, i, fields as Partial<Item>);
  ed.board.update(it.id, patch);
}

/** The selected table's lines: their colour ('gray' the usual, 'none' none) and opacity. */
export function setTableLines(ed: Editor, patch: { sc?: string; so?: number }): void {
  const it = ed.selectedItems()[0];
  if (it?.type !== 'table') return;
  const next: Partial<Item> = {};
  if ('sc' in patch) next.sc = patch.sc === 'gray' ? undefined : patch.sc;
  if ('so' in patch) next.so = patch.so! >= 1 ? undefined : Math.round(patch.so! * 100) / 100;
  ed.board.update(it.id, next);
}

/** Starts (or stops) waiting for the mouse to rest on a table line; a picked line is ready at once. */
export function restOn(ed: Editor, line: TableLine | null): void {
  if (sameLine(line, ed.lineRest?.line ?? null)) return;
  clearTimeout(ed.lineRest?.timer);
  ed.lineRest = null;
  if (!line) return;
  // Once one of a table's lines has been waited for, the others of it are taken at once, till the
  // pointer's been off the table a second (see warmTable).
  const warm = ed.tableWarm?.id === line.id && performance.now() - ed.tableWarm.last < WARM_FOR;
  const rest = { line, armed: warm || ed.pickedLines.some((l) => sameLine(l, line)), timer: 0 };
  if (rest.armed && !ed.gesture) {
    ed.hotLine = line;
    if (ed.canvas) ed.canvas.style.cursor = line.axis === 'col' ? 'col-resize' : 'row-resize';
    ed.requestRender();
  }
  if (!rest.armed) {
    rest.timer = window.setTimeout(() => {
      rest.armed = true;
      ed.tableWarm = { id: line.id, last: performance.now() };
      if (ed.lineRest !== rest || ed.gesture) return;
      ed.hotLine = line;
      if (ed.canvas) ed.canvas.style.cursor = line.axis === 'col' ? 'col-resize' : 'row-resize';
      ed.requestRender();
    }, LINE_REST);
  }
  ed.lineRest = rest;
}

/** How long a table stays ready (its lines taken at once) with the pointer off it. */
const WARM_FOR = 1000;

/** The pointer's over table `id` (or one of its lines): it stays ready. */
export function warmTable(ed: Editor, id: string | undefined): void {
  if (id && ed.tableWarm?.id === id) ed.tableWarm.last = performance.now();
}

/** The table line a press here takes hold of: one picked already; with the mouse, one it has rested
 *  on; with a finger, one of the table that's selected. */
export function grabbableLine(ed: Editor, w: Point, hit: Item | null, pointer: string): TableLine | null {
  const tl = tableLineAt(ed, w, hit);
  if (!tl) return null;
  if (ed.pickedLines.some((l) => sameLine(l, tl))) return tl;
  if (pointer === 'touch') return ed.selection.size === 1 && ed.selection.has(tl.id) ? tl : null;
  return ed.lineRest?.armed && sameLine(ed.lineRest.line, tl) ? tl : null;
}

/** The table line under the point: of the table there, or just past a table's right or bottom edge. */
export function tableLineAt(ed: Editor, w: Point, hit: Item | null): TableLine | null {
  if (hit && hit.type !== 'table' && hit.type !== 'frame') return null;
  // A finger gets a wider band, but not so wide a small cell is all lines.
  const tol = (ed.byFinger ? 10 : 5) / ed.cam.z, items = ed.shown();
  for (let i = items.length - 1; i >= 0; i--) {
    const it = items[i];
    if (it.type !== 'table') continue;
    const l = lineAt(it, w, tol);
    if (l) return { id: it.id, ...l };
  }
  return null;
}
