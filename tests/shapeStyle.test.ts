import { describe, expect, it } from 'vitest';
import { shapePatch } from '../src/editor/shapeStyle';

describe('how shapes come out', () => {
  it('by default: corners 4 round, no outline, text at the top, filled', () => {
    expect(shapePatch('rect', { rad: 4, stroke: false, noFill: false, center: false, square: false })).toEqual({ rad: 4, sc: 'none', va: 'top' });
  });
  it('an ellipse has no corners to round', () => {
    expect(shapePatch('ellipse', { rad: 10 })).toEqual({});
  });
  it('outlined, not filled, text in the middle', () => {
    expect(shapePatch('polygon', { stroke: true, noFill: true, center: true })).toEqual({ sc: undefined, color: 'none', va: undefined });
  });
});
