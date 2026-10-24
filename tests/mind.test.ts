import { describe, expect, it } from 'vitest';
import { addChild, balance, canMoveTo, childPlace, descendants, insertBeside, makeRoom, mindDepth, moveBranch } from '../src/model/mind';
import type { Item } from '../src/model/types';

const node = (id: string, x: number, y: number, extra: Partial<Item> = {}): Item =>
  ({ id, type: 'mind', x, y, w: 100, h: 40, z: 0, ...extra });

describe('mind map', () => {
  const root = node('r', 0, 0);
  const a = node('a', 160, -60, { parent: 'r' });
  const a1 = node('a1', 320, -60, { parent: 'a' });
  const b = node('b', -260, 0, { parent: 'r' });
  const items = [root, a, a1, b];
  const get = (id: string) => items.find((i) => i.id === id);

  it('knows how deep a node is', () => {
    expect(mindDepth(a1, get)).toBe(2);
  });

  it('centres the branches on a side around their node', () => {
    // A second branch on the right under a: the two stack 16 apart, centred on the root's middle (20).
    const a2 = node('a2', 160, 40, { parent: 'r' });
    const moves = balance('a2', [...items, a2]);
    expect(moves.get('a')).toBe(-28);
    expect(moves.get('a1')).toBe(-28);
    expect(moves.get('a2')).toBe(28);
    expect(moves.has('b')).toBe(false);
  });

  it('moves a branch to another node, over to its side', () => {
    expect(canMoveTo('a1', 'b', items)).toBe(true);
    expect(canMoveTo('a', 'a1', items)).toBe(false);  // not under its own branch
    expect(canMoveTo('r', 'b', items)).toBe(false);   // the centre stays the centre
    // b grows left of the centre, so a1 goes to its left, level with it.
    expect(moveBranch('a1', 'b', items, 1).get('a1')).toEqual({ x: -420, y: 0 });
  });

  it('puts a node above or below another without moving it, the others making room', () => {
    const a2 = node('a2', 160, 0, { parent: 'r' }), x = node('x', 160, 0, { parent: 'r' });
    const all = [...items, a2, x];
    // Below a (at -60): x goes 16 under it, a2 (further down) moves down by x's height and a gap.
    const below = insertBeside('x', 'a', 'below', all);
    expect(below.get('x')).toBe(-4);
    expect(below.get('a2')).toBe(56);
    expect(below.has('a')).toBe(false);
    // Above a2: x goes over it, and a with its branch moves up instead.
    const above = insertBeside('x', 'a2', 'above', all);
    expect(above.get('x')).toBe(-56);
    expect(above.get('a')).toBe(-116);
    expect(above.get('a1')).toBe(-116);
  });

  it('moves the branches of the same parent below a node that grows as it is typed in', () => {
    const a2 = node('a2', 160, 0, { parent: 'r' }), a3 = node('a3', 320, 40, { parent: 'a2' });
    // a1 grows: nothing else hangs from a, so nothing moves (a2, a level up, stays put).
    expect(makeRoom('a1', 20, [...items, a2, a3]).size).toBe(0);
    const moves = makeRoom('a', 20, [...items, a2, a3]);
    expect(moves.get('a2')).toBe(20);
    expect(moves.get('a3')).toBe(60);
    expect(moves.has('a')).toBe(false);
    expect(moves.has('b')).toBe(false);  // on the other side of the centre
  });

  it('finds everything branching from a node', () => {
    expect(descendants(['r'], items).sort()).toEqual(['a', 'a1', 'b']);
    expect(descendants(['a'], items)).toEqual(['a1']);
  });

  it('puts a new child beside its parent, on its side of the centre, under the last one', () => {
    expect(childPlace(a, items, get, 100, 40)).toEqual({ x: 320, y: -4 });
    expect(childPlace(b, items, get, 100, 40)).toEqual({ x: -420, y: 0 });
    expect(childPlace(root, items, get, 100, 40)).toEqual({ x: 160, y: -4 });
  });
});

describe('mind map: adding keeps the levels further in still', () => {
  const n = (id: string, x: number, y: number, parent?: string): Item => node(id, x, y, parent ? { parent } : {});
  // A central topic with three branches, each with branches of its own.
  const base = () => [n('r', 0, 28), n('A', 200, 0, 'r'), n('B', 200, 56, 'r'), n('C', 200, -56, 'r'),
    n('a1', 400, 0, 'A'), n('b1', 400, 56, 'B'), n('b2', 400, 112, 'B'), n('c1', 400, -56, 'C')];
  const still = (moves: Map<string, number>) => ['r', 'A', 'B', 'C'].forEach((id) => expect(moves.has(id)).toBe(false));

  it('a new branch re-centres its own level, pushing the same level of other parents away', () => {
    const moves = addChild('a2', [...base(), n('a2', 400, 56, 'A')]);
    still(moves);
    expect(moves.get('a1')).toBe(-28);
    expect(moves.get('a2')).toBe(28);
    // B's and C's branches make way, as far as it takes.
    expect(moves.get('b1')).toBe(84);
    expect(moves.get('c1')).toBe(-84);
  });

  it('a branch put beside another moves only that level', () => {
    const moves = insertBeside('a2', 'a1', 'below', [...base(), n('a2', 400, 56, 'A')]);
    still(moves);
    // The new one right under a1 (where it was put), B's branches out of its way.
    expect(moves.get('a2') ?? 56).toBe(56);
    expect(moves.get('b1')).toBe(112);
  });

  it('a node growing as it is typed in pushes its level only', () => {
    const moves = makeRoom('a1', 30, base().map((i) => (i.id === 'a1' ? { ...i, h: 70 } : i)));
    still(moves);
    expect(moves.get('b1')).toBe(86);
  });
});
