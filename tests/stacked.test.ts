import { describe, expect, it } from 'vitest';
import type { Board } from '../src/model/board';
import type { Item } from '../src/model/types';
import { stacked } from '../src/editor/frames';

const item = (id: string, z: number, extra: Partial<Item> = {}): Item => ({ id, type: 'sticky', x: 0, y: 0, w: 10, h: 10, z, ...extra });
const order = (items: Item[]) => {
  const byId = new Map(items.map((i) => [i.id, i])), board = { get: (id: string) => byId.get(id) } as unknown as Board;
  return stacked(board, items.sort((a, b) => a.z - b.z)).map((i) => i.id);
};

describe('frames in the stack', () => {
  it('a frame higher up than what it holds goes under it; what it doesn\'t hold keeps its place', () => {
    expect(order([item('a', 1), item('b', 2), item('f', 3, { type: 'frame', members: ['b'] })])).toEqual(['a', 'f', 'b']);
  });

  it('a frame in a frame stands over it, and what it holds over both, wherever they were', () => {
    const outer = item('outer', 5, { type: 'frame', members: ['inner', 's'] }), inner = item('inner', 0, { type: 'frame', members: ['t'] });
    expect(order([item('t', 1), item('s', 2), outer, inner])).toEqual(['outer', 'inner', 't', 's']);
  });

  it('a frame already under what it holds stays where it is', () => {
    expect(order([item('f', 0, { type: 'frame', members: ['a'] }), item('x', 1), item('a', 2)])).toEqual(['f', 'x', 'a']);
  });
});
