import { describe, expect, it } from 'vitest';
import { boxOf, distToSegment, edgePoint, hitItem, hitLink, inkPoints, linkCurve, nearestSide, nearInk, onTaskBox, rectContains, resizedAt, sidePoint, taskBox } from '../src/canvas/geometry';
import { withList, wrapText } from '../src/canvas/text';
import type { Item } from '../src/model/types';

const box = (type: Item['type'], extra: Partial<Item> = {}): Item =>
  ({ id: type, type, x: 0, y: 0, w: 100, h: 50, z: 0, ...extra });

describe('geometry', () => {
  it('ends arrows on the outline of a rectangle', () => {
    expect(edgePoint(box('rect'), { x: 500, y: 25 })).toEqual({ x: 100, y: 25 });
    expect(edgePoint(box('rect'), { x: 50, y: -500 })).toEqual({ x: 50, y: 0 });
  });

  it('ends arrows on the outline of an ellipse', () => {
    const p = edgePoint(box('ellipse'), { x: 150, y: 75 });
    const e = ((p.x - 50) / 50) ** 2 + ((p.y - 25) / 25) ** 2;
    expect(e).toBeCloseTo(1);
  });

  it('puts link dots outside the middle of each side', () => {
    expect(sidePoint(box('rect'), 'top', 10)).toEqual({ x: 50, y: -10 });
    expect(sidePoint(box('rect'), 'right', 10)).toEqual({ x: 110, y: 25 });
    expect(nearestSide(box('rect'), { x: -40, y: 30 })).toBe('left');
    expect(nearestSide(box('rect'), { x: 60, y: 90 })).toBe('bottom');
  });

  it('draws a pinned link as a curve that leaves square to its side', () => {
    const a = box('rect'), b = box('rect', { id: 'b', x: 300, y: 200 });
    const get = (id: string) => (id === 'rect' ? a : b);
    const link = { id: 'l', from: 'rect', to: 'b', fromSide: 'right', toSide: 'top' } as const;
    const [p0, c1, c2, p3] = linkCurve(link, get)!;
    expect(p0).toEqual({ x: 100, y: 25 });
    expect(c1.y).toBe(25);
    expect(c1.x).toBeGreaterThan(100);
    expect(p3).toEqual({ x: 350, y: 200 });
    expect(c2.x).toBe(350);
    expect(c2.y).toBeLessThan(200);
    // The corner of the bend is near the curve, the straight chord's middle is not.
    expect(hitLink([link], get, { x: 225, y: 112 }, 1)).toBeNull();
    expect(hitLink([link], get, { x: 276, y: 61 }, 1)?.id).toBe('l');
  });

  it('grabs a frame by its label or anywhere inside, but items on it first', () => {
    const frame = box('frame', { w: 400, h: 300, z: -1 }), sticky = box('sticky', { x: 100, y: 100, w: 50, h: 50 });
    expect(hitItem([frame, sticky], { x: 200, y: 150 }, 1)?.id).toBe('frame');
    expect(hitItem([frame, sticky], { x: 20, y: -10 }, 1)?.id).toBe('frame');
    expect(hitItem([frame, sticky], { x: 120, y: 120 }, 1)?.id).toBe('sticky');
    expect(hitItem([frame, sticky], { x: 500, y: 150 }, 1)).toBeNull();
  });

  it('grabs a drawing only near its line, and scales the line with the item', () => {
    // A diagonal from corner to corner, drawn 100 wide and resized to 200.
    const ink = box('ink', { w: 100, h: 100, iw: 100, sw: 4, pts: [0, 0, 100, 100] });
    expect(hitItem([ink], { x: 50, y: 52 }, 1)?.id).toBe('ink');
    expect(hitItem([ink], { x: 80, y: 20 }, 1)).toBeNull();
    const big = { ...ink, w: 200, h: 200 };
    expect(inkPoints(big)[1]).toEqual({ x: 200, y: 200 });
    expect(nearInk(big, { x: 150, y: 156 }, 1)).toBe(true);
    expect(nearInk(ink, { x: 50, y: 56 }, 1)).toBe(false);
  });

  it('finds the checkbox of a task in its top right corner', () => {
    const task = box('task', { w: 260, h: 52 });
    const c = taskBox(task);
    expect(c).toEqual({ x: 242, y: 18, r: 10 });
    expect(onTaskBox(task, c)).toBe(true);
    expect(onTaskBox(task, { x: 30, y: 26 })).toBe(false);
    // Same size on screen when zoomed in: half as big on the board at 200%.
    expect(taskBox(task, 2)).toEqual({ x: 251, y: 9, r: 5 });
    // Zoomed far out it stops at 30% of the card's height.
    expect(taskBox(task, 0.1).r).toBeCloseTo(15.6);
  });

  it('hits a star only inside its points, and ends links on its outline', () => {
    const star = box('polygon', { shape: 'star', w: 100, h: 100 });
    expect(hitItem([star], { x: 50, y: 50 }, 1)?.id).toBe('polygon');
    expect(hitItem([star], { x: 5, y: 5 }, 1)).toBeNull();
    const tip = edgePoint(box('polygon', { shape: 'rhombus', w: 100, h: 100 }), { x: 50, y: -100 });
    expect(tip.x).toBeCloseTo(50);
    expect(tip.y).toBeCloseTo(0);
  });

  it('picks the topmost item', () => {
    const a = box('rect', { id: 'a' }), b = box('rect', { id: 'b', z: 1 });
    expect(hitItem([a, b], { x: 10, y: 10 }, 1)?.id).toBe('b');
  });

  it('measures distance to a segment', () => {
    expect(distToSegment({ x: 5, y: 5 }, { x: 0, y: 0 }, { x: 10, y: 0 })).toBe(5);
    expect(distToSegment({ x: 20, y: 0 }, { x: 0, y: 0 }, { x: 10, y: 0 })).toBe(10);
  });

  it('checks containment', () => {
    expect(rectContains({ x: 0, y: 0, w: 10, h: 10 }, { x: 1, y: 1, w: 5, h: 5 })).toBe(true);
    expect(rectContains({ x: 0, y: 0, w: 10, h: 10 }, { x: 8, y: 1, w: 5, h: 5 })).toBe(false);
  });
});

describe('withList', () => {
  it('puts a bullet or a number in front of each paragraph', () => {
    expect(withList('a\nb', 'bullet')).toBe('•  a\n•  b');
    expect(withList('a\nb', 'number')).toBe('1. a\n2. b');
    expect(withList('a\nb')).toBe('a\nb');
  });
});

describe('wrapText', () => {
  const mono = (s: string) => s.length; // one unit per character
  it('wraps on spaces and keeps paragraphs', () => {
    expect(wrapText('один два три\nчетыре', 8, mono)).toEqual(['один два', 'три', 'четыре']);
  });
  it('breaks hyphenated words after the hyphen', () => {
    expect(wrapText('Пуш-уведомления', 12, mono)).toEqual(['Пуш-', 'уведомления']);
  });
  it('breaks words longer than the line', () => {
    expect(wrapText('абвгдежзик', 4, mono)).toEqual(['абвг', 'дежз', 'ик']);
  });
});

describe('turned items', () => {
  const box = { id: 'r', type: 'rect', x: 0, y: 0, w: 200, h: 100, z: 1, rot: 90 } as Item;
  it('are hit in their own frame', () => {
    // Turned a quarter, the 200×100 box stands 100 wide and 200 tall about its centre (100, 50).
    expect(hitItem([box], { x: 100, y: -40 }, 1)?.id).toBe('r');
    expect(hitItem([box], { x: 10, y: 50 }, 1)).toBeNull();
  });
  it('have a box square to the board around them', () => {
    const b = boxOf(box);
    [b.x, b.y, b.w, b.h].forEach((v, i) => expect(v).toBeCloseTo([50, -50, 100, 200][i]));
  });
  it('keep their top left corner when resized', () => {
    // The top left corner of the turned box is at (150, -50).
    const p = resizedAt(box, 300, 100);
    const c = { x: p.x + 150, y: p.y + 50 };
    expect(c.x + 50).toBeCloseTo(150);
    expect(c.y - 150).toBeCloseTo(-50);
  });
});

