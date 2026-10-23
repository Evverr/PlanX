import type { Rect } from './geometry';

/** A guide line on the board, from (x1, y1) to (x2, y2). */
export interface Guide { x1: number; y1: number; x2: number; y2: number }

/** Left, middle and right of a box (or top, middle and bottom). */
const marks = (start: number, size: number) => [start, start + size / 2, start + size];

/**
 * Alignment guides for a box being dragged: how far to nudge it (dx, dy) so that one of its edges or
 * middles lines up with one of another box's, when within `tol` of it, and the lines showing what
 * it lines up with, each running across both boxes.
 */
export function snapToGuides(box: Rect, others: Rect[], tol: number): { dx: number; dy: number; guides: Guide[] } {
  const nearest = (mine: number[], theirs: (o: Rect) => number[]) => {
    let best = Infinity;
    for (const o of others) {
      for (const t of theirs(o)) for (const m of mine) if (Math.abs(t - m) <= tol && Math.abs(t - m) < Math.abs(best)) best = t - m;
    }
    return best === Infinity ? 0 : best;
  };
  const dx = nearest(marks(box.x, box.w), (o) => marks(o.x, o.w));
  const dy = nearest(marks(box.y, box.h), (o) => marks(o.y, o.h));
  const b = { x: box.x + dx, y: box.y + dy, w: box.w, h: box.h };
  // Lines where the moved box now lines up, each long enough to reach every box lined up on it.
  const upright = new Map<number, [number, number]>(), level = new Map<number, [number, number]>();
  const reach = (lines: Map<number, [number, number]>, at: number, from: number, to: number) => {
    const key = Math.round(at * 100) / 100, was = lines.get(key);
    lines.set(key, was ? [Math.min(was[0], from), Math.max(was[1], to)] : [from, to]);
  };
  for (const o of others) {
    for (const t of marks(o.x, o.w)) {
      if (marks(b.x, b.w).some((m) => Math.abs(t - m) < 0.5)) reach(upright, t, Math.min(b.y, o.y), Math.max(b.y + b.h, o.y + o.h));
    }
    for (const t of marks(o.y, o.h)) {
      if (marks(b.y, b.h).some((m) => Math.abs(t - m) < 0.5)) reach(level, t, Math.min(b.x, o.x), Math.max(b.x + b.w, o.x + o.w));
    }
  }
  const guides: Guide[] = [
    ...[...upright].map(([x, [y1, y2]]) => ({ x1: x, y1, x2: x, y2 })),
    ...[...level].map(([y, [x1, x2]]) => ({ x1, y1: y, x2, y2: y })),
  ];
  return { dx, dy, guides };
}
