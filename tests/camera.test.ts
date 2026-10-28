import { describe, expect, it } from 'vitest';
import { minZoomFor } from '../src/editor/camera';

describe('how far out the board zooms', () => {
  it('8% as a rule, further (down to 4%) for a board too big to be seen whole at 8%', () => {
    expect(minZoomFor(null, 1000, 800)).toBe(0.08);
    expect(minZoomFor({ x: 0, y: 0, w: 5000, h: 3000 }, 1000, 800)).toBe(0.08);
    expect(minZoomFor({ x: 0, y: 0, w: 15000, h: 3000 }, 1000, 800)).toBe(0.06);
    expect(minZoomFor({ x: 0, y: 0, w: 100000, h: 3000 }, 1000, 800)).toBe(0.04);
  });
});
