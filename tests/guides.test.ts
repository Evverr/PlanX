import { describe, expect, it } from 'vitest';
import { snapToGuides } from '../src/canvas/guides';

describe('alignment guides', () => {
  const other = { x: 0, y: 0, w: 100, h: 100 };

  it('nudges a box to line up when close, with a guide across both', () => {
    // Its top 4 under the other's: pulled up to it, a level guide along y 0 from one box to the other.
    const { dx, dy, guides } = snapToGuides({ x: 300, y: 4, w: 50, h: 50 }, [other], 6);
    expect(dx).toBe(0);
    expect(dy).toBe(-4);
    expect(guides).toEqual([{ x1: 0, y1: 0, x2: 350, y2: 0 }]);
  });

  it('lines up middles too', () => {
    const { dx, guides } = snapToGuides({ x: 27, y: 300, w: 50, h: 50 }, [other], 6);
    expect(dx).toBe(-2);
    expect(guides).toEqual([{ x1: 50, y1: 0, x2: 50, y2: 350 }]);
  });

  it('leaves a box alone when nothing is near', () => {
    expect(snapToGuides({ x: 300, y: 300, w: 50, h: 50 }, [other], 6)).toEqual({ dx: 0, dy: 0, guides: [] });
  });
});
