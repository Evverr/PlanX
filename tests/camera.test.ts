import { describe, expect, it } from 'vitest';
import { minZoomFor, wheelMove } from '../src/editor/camera';

describe('how far out the board zooms', () => {
  it('8% as a rule, further (down to 4%) for a board too big to be seen whole at 8%', () => {
    expect(minZoomFor(null, 1000, 800)).toBe(0.08);
    expect(minZoomFor({ x: 0, y: 0, w: 5000, h: 3000 }, 1000, 800)).toBe(0.08);
    expect(minZoomFor({ x: 0, y: 0, w: 15000, h: 3000 }, 1000, 800)).toBe(0.06);
    expect(minZoomFor({ x: 0, y: 0, w: 100000, h: 3000 }, 1000, 800)).toBe(0.04);
  });
});

describe('what the wheel does', () => {
  const cam = { x: 0, y: 0, z: 1 }, turn = (extra: Partial<WheelEvent>) => ({ deltaMode: 0, deltaX: 0, deltaY: 100, metaKey: false, ctrlKey: false, shiftKey: false, ...extra }) as WheelEvent;
  it('zooms by itself and scrolls with Cmd, unless set otherwise', () => {
    expect(wheelMove(turn({}), cam)).toHaveProperty('zoom');
    expect(wheelMove(turn({ metaKey: true }), cam)).toEqual({ pan: [0, 100] });
  });
  it('set to zoom with a key: scrolls by itself, zooms with Cmd or Ctrl alike, a pinch as ever, sideways with Shift', () => {
    expect(wheelMove(turn({}), cam, true)).toEqual({ pan: [0, 100] });
    const cmd = wheelMove(turn({ metaKey: true }), cam, true);
    expect(cmd).toHaveProperty('zoom');
    expect(wheelMove(turn({ ctrlKey: true }), cam, true)).toEqual(cmd);
    expect(wheelMove(turn({ ctrlKey: true, deltaY: 3.5 }), cam, true)).toEqual({ zoom: Math.exp(-3.5 * 0.004) });
    expect(wheelMove(turn({ shiftKey: true }), cam, true)).toEqual({ pan: [100, 0] });
  });
});
