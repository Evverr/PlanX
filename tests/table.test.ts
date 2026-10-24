import { describe, expect, it } from 'vitest';
import { cellAt, cellItem, cellRect, lineAt, movedLines, newTable, withCellFormat, withCount, withScale, withTableFormat } from '../src/model/table';
import type { Item } from '../src/model/types';

const table = (extra: Partial<Item> = {}): Item => ({ id: 't', type: 'table', x: 0, y: 0, z: 0, ...newTable(), ...extra } as Item);

describe('table', () => {
  it('finds cells and their boxes row by row', () => {
    const t = table();
    expect(cellAt(t, { x: 130, y: 45 })).toBe(4);
    expect(cellRect(t, 5)).toEqual({ x: 240, y: 40, w: 120, h: 40 });
    expect(cellAt(t, { x: 400, y: 10 })).toBeNull();
  });

  it('grabs the line after a column or row, outer ones included', () => {
    const t = table();
    expect(lineAt(t, { x: 121, y: 60 }, 4)).toEqual({ axis: 'col', index: 0 });
    expect(lineAt(t, { x: 359, y: 60 }, 4)).toEqual({ axis: 'col', index: 2 });
    expect(lineAt(t, { x: 60, y: 80 }, 4)).toEqual({ axis: 'row', index: 1 });
    expect(lineAt(t, { x: 60, y: 60 }, 4)).toBeNull();
  });

  it('keeps the size in step with the columns and rows', () => {
    const t = table();
    expect(withScale(t, 720, 60)).toEqual({ cols: [240, 240, 240], rows: [20, 20, 20], w: 720, h: 60 });
  });

  it('adds and removes the last column or row, keeping the text in its cells', () => {
    const t = table({ cells: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i'] });
    expect(withCount(t, 'col', 1).cells).toEqual(['a', 'b', 'c', '', 'd', 'e', 'f', '', 'g', 'h', 'i', '']);
    expect(withCount(t, 'col', -1).cells).toEqual(['a', 'b', 'd', 'e', 'g', 'h']);
    expect(withCount(t, 'row', 1)).toMatchObject({ rows: [40, 40, 40, 40], h: 160 });
    expect(withCount(t, 'row', -1).cells).toEqual(['a', 'b', 'c', 'd', 'e', 'f']);
    expect(withCount(table({ cols: [100], cells: ['x', 'y', 'z'] }), 'col', -1)).toEqual({});
  });
  it('moves picked lines together, keeping the gaps between them', () => {
    // Lines 0 and 2 move right by 30: the column between keeps its size, the one after line 0 shrinks.
    expect(movedLines([100, 100, 100, 100], [0, 2], 30, 24)).toEqual([130, 70, 130, 100]);
    // Lines 0 and 1 together: the second column keeps its width.
    expect(movedLines([100, 100, 100], [0, 1], 30, 24)).toEqual([130, 100, 100]);
    // Held back so the shrinking column stays at least the minimum.
    expect(movedLines([100, 50, 100], [0, 2], 40, 24)).toEqual([126, 24, 126]);
  });
  it('keeps each cell its own formatting', () => {
    const t = { id: 't', type: 'table', x: 0, y: 0, z: 0, ...newTable(2, 2) } as Item;
    const bold = { ...t, ...withCellFormat(t, 1, { fw: 700 }) } as Item;
    expect(cellItem(bold, 1).fw).toBe(700);
    expect(cellItem(bold, 0).fw).toBeUndefined();
    // A new column keeps cell 1's formatting with its text (it's now the second cell of three).
    const wider = { ...bold, ...withCount(bold, 'col', 1) } as Item;
    expect(wider.cellFmt?.[1]).toEqual({ fw: 700 });
    expect(wider.cellFmt?.[2]).toBeNull();
    // Formatting the whole table takes the field off every cell.
    expect(withTableFormat(bold, { fw: 400 })).toEqual({ fw: 400, cellFmt: undefined });
    // On an italic table, a cell set back to upright keeps upright.
    const italic = { ...t, fi: true } as Item;
    expect(cellItem({ ...italic, ...withCellFormat(italic, 0, { fi: undefined }) } as Item, 0).fi).toBeUndefined();
  });
});
