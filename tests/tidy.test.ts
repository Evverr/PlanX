import { describe, expect, it } from 'vitest';
import type { Item } from '../src/model/types';
import { dropSlot, gapLines, gridOrder, gridPlaces } from '../src/labs/tidy';

const s = (id: string, x: number, y: number, w = 100, h = 100): Item => ({ id, type: 'sticky', x, y, w, h, z: 0 });

describe('laying out in a grid', () => {
  it('reads a heap row by row, each left to right', () => {
    const heap = [s('c', 300, 0), s('a', 0, 10), s('e', 120, 260), s('b', 150, -20), s('d', 10, 240)];
    expect(gridOrder(heap, 3).map((i) => i.id).join('')).toBe('abcde');
  });

  it('each column as wide as its widest, each row as tall as its tallest, the gaps between', () => {
    const items = [s('a', 0, 0, 100, 50), s('b', 0, 0, 150, 80), s('c', 0, 0, 120, 60)];
    const at = gridPlaces(items, 2, 10, 20, { x: 0, y: 0 });
    expect([...at.values()]).toEqual([{ x: 0, y: 0 }, { x: 130, y: 0 }, { x: 0, y: 100 }]);
  });

  it('the gap lines down the middle of each gap, as long as the grid', () => {
    const items = [s('a', 0, 0), s('b', 124, 0), s('c', 0, 124)];
    expect(gapLines(items, { ids: ['a', 'b', 'c'], cols: 2, gx: 24, gy: 24 })).toEqual([
      { axis: 'col', at: 112, from: 0, to: 224 },
      { axis: 'row', at: 112, from: 0, to: 224 },
    ]);
  });

  it('an item dragged right of the last column makes another; below the rows, a row of its own', () => {
    const a = s('a', 0, 0), b = s('b', 124, 0), c = s('c', 0, 124);
    // Two over one: C taken right of B puts all three in a row.
    const right = dropSlot([a, b], c, 2, 24, 24, { x: 0, y: 0 }, { x: 300, y: 50 });
    expect([right.order.map((i) => i.id).join(''), right.cols]).toEqual(['abc', 3]);
    // Three in a row: C taken below them starts a row, the grid two across.
    const below = dropSlot([a, b], c, 3, 24, 24, { x: 0, y: 0 }, { x: 50, y: 160 });
    expect([below.order.map((i) => i.id).join(''), below.cols]).toEqual(['abc', 2]);
    // Taken to the front.
    expect(dropSlot([a, b], c, 2, 24, 24, { x: 0, y: 0 }, { x: 10, y: 10 }).order.map((i) => i.id).join('')).toBe('cab');
  });
});
