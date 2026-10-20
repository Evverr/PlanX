import type { Item, Link } from '../model/types';

export interface Point { x: number; y: number }
export interface Rect { x: number; y: number; w: number; h: number }

/** Height of the clickable label strip above a frame, in board units. */
export const FRAME_LABEL = 30;

export const center = (r: Rect): Point => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 });

export const normRect = (a: Point, b: Point): Rect => ({
  x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(b.x - a.x), h: Math.abs(b.y - a.y),
});

export const rectsIntersect = (a: Rect, b: Rect): boolean =>
  a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

export const rectContains = (outer: Rect, inner: Rect): boolean =>
  inner.x >= outer.x && inner.y >= outer.y &&
  inner.x + inner.w <= outer.x + outer.w && inner.y + inner.h <= outer.y + outer.h;

export const pointInRect = (p: Point, r: Rect): boolean =>
  p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;

/** Where the line from the item's centre toward `toward` leaves the item's outline. */
export function edgePoint(item: Item, toward: Point): Point {
  const c = center(item), hw = item.w / 2, hh = item.h / 2;
  const dx = toward.x - c.x, dy = toward.y - c.y;
  if (!dx && !dy) return c;
  let t: number;
  if (item.type === 'ellipse') t = 1 / Math.sqrt((dx / hw) ** 2 + (dy / hh) ** 2);
  else t = Math.min(dx ? hw / Math.abs(dx) : Infinity, dy ? hh / Math.abs(dy) : Infinity);
  t = Math.min(t, 1);
  return { x: c.x + dx * t, y: c.y + dy * t };
}

export function linkEnds(link: Link, get: (id: string) => Item | undefined): [Point, Point] | null {
  const a = get(link.from), b = get(link.to);
  if (!a || !b) return null;
  return [edgePoint(a, center(b)), edgePoint(b, center(a))];
}

export function distToSegment(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x, dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  const t = len2 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2)) : 0;
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

/**
 * Topmost item under the point. A frame only counts when the point is on its
 * label or near its border, so dragging inside a frame starts a selection box.
 */
export function hitItem(items: Item[], p: Point, zoom: number): Item | null {
  const band = 8 / zoom;
  for (let i = items.length - 1; i >= 0; i--) {
    const it = items[i];
    if (it.type === 'frame') {
      const onLabel = p.x >= it.x && p.x <= it.x + it.w && p.y >= it.y - FRAME_LABEL && p.y < it.y;
      const inBox = pointInRect(p, it);
      const onBorder = inBox && (p.x - it.x < band || it.x + it.w - p.x < band || p.y - it.y < band || it.y + it.h - p.y < band);
      if (onLabel || onBorder) return it;
      continue;
    }
    if (it.type === 'ellipse') {
      const c = center(it);
      if (((p.x - c.x) / (it.w / 2)) ** 2 + ((p.y - c.y) / (it.h / 2)) ** 2 <= 1) return it;
      continue;
    }
    if (pointInRect(p, it)) return it;
  }
  return null;
}

export function hitLink(links: Link[], get: (id: string) => Item | undefined, p: Point, zoom: number): Link | null {
  const tol = 7 / zoom;
  for (let i = links.length - 1; i >= 0; i--) {
    const ends = linkEnds(links[i], get);
    if (ends && distToSegment(p, ends[0], ends[1]) <= tol) return links[i];
  }
  return null;
}

export function boundsOf(items: Item[]): Rect | null {
  if (!items.length) return null;
  let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
  for (const it of items) {
    x1 = Math.min(x1, it.x);
    y1 = Math.min(y1, it.y - (it.type === 'frame' ? FRAME_LABEL : 0));
    x2 = Math.max(x2, it.x + it.w);
    y2 = Math.max(y2, it.y + it.h);
  }
  return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
}
