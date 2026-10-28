import { describe, expect, it } from 'vitest';
import type { Item, Link } from '../src/model/types';
import { linkHandles, linkShape, throughSmoothly } from '../src/canvas/geometry';

const box = (id: string, x: number, y: number): Item => ({ id, type: 'sticky', x, y, w: 100, h: 100, z: 1 });
const items = new Map([['a', box('a', 0, 0)], ['b', box('b', 400, 0)]]);
const get = (id: string) => items.get(id);

describe('nodes on a link', () => {
  it('a smooth link runs through its nodes, from the edges toward them', () => {
    const l: Link = { id: 'L', from: 'a', to: 'b', via: [{ x: 250, y: 200 }] };
    const sh = linkShape(l, get)!;
    expect(sh.pts.some((p) => p.x === 250 && p.y === 200)).toBe(true);
    expect(sh.pts[0].y).toBeGreaterThan(50);
    expect(sh.curve).toBeUndefined();
  });

  it('a straight one goes from one to the next', () => {
    const sh = linkShape({ id: 'L', from: 'a', to: 'b', style: 'straight', via: [{ x: 250, y: 200 }] }, get)!;
    expect(sh.pts.length).toBe(3);
    expect(sh.pts[1]).toEqual({ x: 250, y: 200 });
  });

  it('handles: its nodes, and the middles of the stretches between ends and nodes', () => {
    const l: Link = { id: 'L', from: 'a', to: 'b', style: 'straight', via: [{ x: 250, y: 200 }] };
    const h = linkHandles(l, linkShape(l, get)!);
    expect(h.nodes).toEqual([{ x: 250, y: 200 }]);
    expect(h.middles.map((m) => m.at)).toEqual([0, 1]);
  });

  it('a smooth curve through points passes through each of them', () => {
    const pts = [{ x: 0, y: 0 }, { x: 100, y: 50 }, { x: 200, y: 0 }], c = throughSmoothly(pts, 8);
    for (const p of pts) expect(c).toContainEqual(p);
  });
});
