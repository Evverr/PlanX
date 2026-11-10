import { describe, expect, it } from 'vitest';
import { around, boxOf, polyPoints, distToSegment, edgePoint, elbowRoute, linkShape, spreadElbows, hitItem, hitLink, inkPoints, linkCurve, nearestSide, nearInk, rectContains, resizedAt, sidePoint } from '../src/canvas/geometry';
import { withList, wrapText } from '../src/canvas/text';
import type { Item } from '../src/model/types';

const box = (type: Item['type'], extra: Partial<Item> = {}): Item =>
  ({ id: type, type, x: 0, y: 0, w: 100, h: 50, z: 0, ...extra });

describe('geometry', () => {
  it('an instance is picked by its contents and the title above them, without its component padding', () => {
    const inst = box('frame', { id: 'instance', inst: 'source', w: 300, h: 200 });
    const a = box('rect', { id: 'a', host: 'instance', x: 40, y: 40, w: 80, h: 80 });
    const b = box('rect', { id: 'b', host: 'instance', x: 180, y: 40, w: 80, h: 80 });
    const items = [inst, a, b];
    expect(hitItem(items, { x: 20, y: 80 }, 1)).toBeNull();
    expect(hitItem(items, { x: 60, y: 25 }, 1)?.id).toBe('instance');
    expect(hitItem(items, { x: 140, y: 80 }, 1)?.id).toBe('instance');
    expect(hitItem(items, { x: 60, y: 80 }, 1)?.id).toBe('a');
  });

  it('an empty instance still has a selectable area and title', () => {
    const inst = box('frame', { inst: 'source' });
    expect(hitItem([inst], { x: 20, y: 20 }, 1)?.id).toBe('frame');
    expect(hitItem([inst], { x: 20, y: -10 }, 1)?.id).toBe('frame');
  });

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

  it('a star takes a corner radius of its own: then its ten corners, filling its box', () => {
    const pts = polyPoints(box('polygon', { shape: 'star', w: 100, h: 100, rad: 5 }));
    expect(pts).toHaveLength(10);
    expect(Math.min(...pts.map((p) => p.y))).toBeCloseTo(0);
    expect(Math.max(...pts.map((p) => p.x))).toBeCloseTo(100);
    // Its top tip in the middle, its next corner an inner one, nearer the middle of the box.
    expect(pts[0].x).toBeCloseTo(50, 0);
    expect(Math.hypot(pts[1].x - 50, pts[1].y - 50)).toBeLessThan(Math.hypot(pts[0].x - 50, pts[0].y - 50));
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


describe('link shapes', () => {
  it('right angles: out of a side, turning halfway, into the other side', () => {
    expect(elbowRoute({ x: 0, y: 0 }, 'right', { x: 200, y: 100 }, 'left')).toEqual([{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 200, y: 100 }]);
  });
  it('from a side across to a side along, one turn', () => {
    expect(elbowRoute({ x: 0, y: 0 }, 'right', { x: 200, y: 100 }, 'top')).toEqual([{ x: 0, y: 0 }, { x: 200, y: 0 }, { x: 200, y: 100 }]);
  });
  it('a straight link runs from side to side, a smooth one along its curve', () => {
    const a = { id: 'a', type: 'sticky', x: 0, y: 0, w: 100, h: 100, z: 0 } as const, b = { ...a, id: 'b', x: 300, y: 200 };
    const get = (id: string) => (id === 'a' ? a : b);
    expect(linkShape({ id: 'l', from: 'a', to: 'b', fromSide: 'right', toSide: 'left', style: 'straight' }, get)?.pts).toEqual([{ x: 100, y: 50 }, { x: 300, y: 250 }]);
    const smooth = linkShape({ id: 'l', from: 'a', to: 'b', fromSide: 'right', toSide: 'left' }, get)!;
    expect(smooth.curve && smooth.pts.length).toBe(25);
  });
});

describe('right-angled links kept apart', () => {
  it('a stretch lying on another moves across by the step, the ones either side following', () => {
    const a = { pts: [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 200, y: 100 }] };
    const b = { pts: [{ x: 0, y: 50 }, { x: 100, y: 50 }, { x: 100, y: 150 }, { x: 200, y: 150 }] };
    spreadElbows([a, b], 3);
    expect(a.pts[1].x).toBe(100);
    // b's upright stretch overlapped a's (y 50…100 on x 100): it moves to x 103.
    expect(b.pts.map((p) => [p.x, p.y])).toEqual([[0, 50], [103, 50], [103, 150], [200, 150]]);
  });
  it('apart already, nothing moves', () => {
    const a = { pts: [{ x: 0, y: 0 }, { x: 100, y: 0 }] }, b = { pts: [{ x: 0, y: 20 }, { x: 100, y: 20 }] };
    spreadElbows([a, b], 3);
    expect(b.pts[0].y).toBe(20);
  });
});

describe('elbowRoute back past where it set out', () => {
  it('goes round between them, halfway down, not back through either', () => {
    // Out of the right side at (100, 50), into the left side at (60, 150) of one starting before it ends.
    expect(elbowRoute({ x: 100, y: 50 }, 'right', { x: 60, y: 150 }, 'left')).toEqual([
      { x: 100, y: 50 }, { x: 124, y: 50 }, { x: 124, y: 100 }, { x: 36, y: 100 }, { x: 36, y: 150 }, { x: 60, y: 150 },
    ]);
  });
});

describe('elbowRoute out across, into a side below behind it', () => {
  it('turns at the other corner, not back through what it leaves', () => {
    // Out of the right side at (750, 150), into the bottom of one above and behind it at (577, 60).
    expect(elbowRoute({ x: 750, y: 150 }, 'right', { x: 577, y: 60 }, 'bottom')).toEqual([
      { x: 750, y: 150 }, { x: 774, y: 150 }, { x: 774, y: 84 }, { x: 577, y: 84 }, { x: 577, y: 60 },
    ]);
  });
});

describe('around', () => {
  it('a right-angled route through the item it goes into goes round it instead', () => {
    // Out of the left of one above right (290…912, 70…118) into the bottom of one below it (0…384, 157…205).
    const from = { x: 290, y: 70, w: 622, h: 48 }, to = { x: 0, y: 157, w: 384, h: 48 };
    const pts = around(elbowRoute({ x: 290, y: 94 }, 'left', { x: 192, y: 205 }, 'bottom'), 'left', 'bottom', from, to);
    expect(pts).toEqual([{ x: 290, y: 94 }, { x: 266, y: 94 }, { x: 266, y: 137.5 }, { x: 408, y: 137.5 }, { x: 408, y: 229 }, { x: 192, y: 229 }, { x: 192, y: 205 }]);
  });
});

describe('a right-angled link with bends of its own', () => {
  it('goes straight on out of its side to them and from them into the other, no knee of its own', () => {
    const items: Record<string, Item> = {
      a: { id: 'a', type: 'task', x: 107, y: -5900, w: 1009, h: 52 } as Item,
      b: { id: 'b', type: 'task', x: 670.5, y: -5088, w: 644, h: 52 } as Item,
    };
    const shape = linkShape({ id: 'l', from: 'a', to: 'b', fromSide: 'right', toSide: 'left', style: 'elbow',
      via: [{ x: 1148, y: -5834 }, { x: 1148, y: -5493 }, { x: 589, y: -5493 }, { x: 589, y: -5153 }] }, (id) => items[id]);
    expect(shape!.pts).toEqual([{ x: 1116, y: -5874 }, { x: 1148, y: -5874 }, { x: 1148, y: -5493 }, { x: 589, y: -5493 }, { x: 589, y: -5062 }, { x: 670.5, y: -5062 }]);
  });
});
