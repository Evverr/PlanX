import { describe, expect, it } from 'vitest';
import { branchColor, childPlace, descendants, mindDepth, MIND_COLORS } from '../src/model/mind';
import type { Item } from '../src/model/types';

const node = (id: string, x: number, y: number, extra: Partial<Item> = {}): Item =>
  ({ id, type: 'mind', x, y, w: 100, h: 40, z: 0, ...extra });

describe('mind map', () => {
  const root = node('r', 0, 0);
  const a = node('a', 160, -60, { parent: 'r', color: MIND_COLORS[2] });
  const a1 = node('a1', 320, -60, { parent: 'a' });
  const b = node('b', -260, 0, { parent: 'r', color: MIND_COLORS[3] });
  const items = [root, a, a1, b];
  const get = (id: string) => items.find((i) => i.id === id);

  it('knows how deep a node is and which branch colour it takes', () => {
    expect(mindDepth(a1, get)).toBe(2);
    expect(branchColor(a1, get)).toBe(MIND_COLORS[2]);
    expect(branchColor(b, get)).toBe(MIND_COLORS[3]);
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
