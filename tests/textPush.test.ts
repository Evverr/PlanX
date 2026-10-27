import { describe, expect, it } from 'vitest';
import type { Item } from '../src/model/types';
import { pushedBelow } from '../src/labs/textPush';

const text = (id: string, x: number, y: number, extra: Partial<Item> = {}): Item => ({ id, type: 'text', x, y, w: 200, h: 30, z: 1, ...extra });

describe('text pushes the text just under it', () => {
  const a = text('a', 0, 0), b = text('b', 20, 40), c = text('c', 0, 86), far = text('far', 0, 200), aside = text('aside', 300, 40);
  const items = [a, b, c, far, aside];

  it('moves what lies within 16 under it, side by side, and on down the chain', () => {
    expect(Object.fromEntries(pushedBelow(a, 24, items))).toEqual({ b: { y: 64 }, c: { y: 110 } });
  });

  it('takes them back up as it shrinks', () => {
    expect(pushedBelow({ ...a, h: 54 }, -24, items.map((i) => (i.id === 'b' ? { ...i, y: 64 } : i.id === 'c' ? { ...i, y: 110 } : i))).get('b')).toEqual({ y: 40 });
  });

  it('leaves what is further, to the side, or not text', () => {
    const moved = pushedBelow(a, 24, [a, far, aside, { ...b, type: 'sticky' }]);
    expect(moved.size).toBe(0);
  });
});
