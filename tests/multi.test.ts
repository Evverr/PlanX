import { describe, expect, it } from 'vitest';
import type { Item } from '../src/model/types';
import { asOne, scaled, scaleFor } from '../src/labs/multi';

const item = (id: string, extra: Partial<Item> = {}): Item => ({ id, type: 'sticky', x: 0, y: 0, w: 100, h: 100, z: 1, ...extra });

describe('several picked at once', () => {
  it('scale with the corner, in proportion, the larger way, never below a tenth', () => {
    const box = { x: 0, y: 0, w: 200, h: 100 }, start = { x: 200, y: 100 };
    expect(scaleFor(box, start, { x: 400, y: 120 })).toBe(2);
    expect(scaleFor(box, start, { x: 220, y: 200 })).toBe(2);
    expect(scaleFor(box, start, { x: -500, y: -500 })).toBe(0.1);
  });

  it('each scaled from the top left, text along; an instance only moves', () => {
    expect(scaled(item('a', { x: 50, y: 20, fs: 16 }), { x: 0, y: 0 }, 2)).toEqual({ x: 100, y: 40, w: 200, h: 200, fs: 32 });
    expect(scaled(item('t', { type: 'text', x: 10, y: 10, w: 200, h: 26 }), { x: 10, y: 10 }, 0.5)).toEqual({ x: 10, y: 10, w: 100, h: 13, fs: 10 });
    expect(scaled(item('i', { type: 'frame', inst: 'c', x: 100, y: 0 }), { x: 0, y: 0 }, 1.5)).toEqual({ x: 150, y: 0 });
  });

  it('the text panel takes them as one, with only what they share', () => {
    const one = asOne([item('a', { fw: 700, ff: 'inter', x: 0 }), item('b', { fw: 700, ff: 'onest', x: 300 })])!;
    expect(one.fw).toBe(700);
    expect(one.ff).toBeUndefined();
    expect([one.x, one.w]).toEqual([0, 400]);
    expect(asOne([item('a'), item('b', { type: 'icon' })])).toBeNull();
  });
});
