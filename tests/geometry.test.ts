import { describe, expect, it } from 'vitest';
import { distToSegment, edgePoint, hitItem, rectContains } from '../src/canvas/geometry';
import { wrapText } from '../src/canvas/text';
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

  it('only grabs a frame by its label or border', () => {
    const frame = box('frame', { w: 400, h: 300 });
    expect(hitItem([frame], { x: 200, y: 150 }, 1)).toBeNull();
    expect(hitItem([frame], { x: 20, y: -10 }, 1)?.id).toBe('frame');
    expect(hitItem([frame], { x: 2, y: 150 }, 1)?.id).toBe('frame');
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
