import type { Item, Link, Side } from '../model/types';

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

export const SIDES: Side[] = ['top', 'right', 'bottom', 'left'];
const NORMAL: Record<Side, Point> = { top: { x: 0, y: -1 }, right: { x: 1, y: 0 }, bottom: { x: 0, y: 1 }, left: { x: -1, y: 0 } };

/** Midpoint of an item's side, pushed `gap` outward. Curved links attach here, the selection dots sit just outside. */
export function sidePoint(r: Rect, side: Side, gap = 0): Point {
  const c = center(r), n = NORMAL[side];
  return { x: c.x + n.x * (r.w / 2 + gap), y: c.y + n.y * (r.h / 2 + gap) };
}

/** The side whose midpoint is closest to p. */
export function nearestSide(r: Rect, p: Point): Side {
  let best: Side = 'top', d = Infinity;
  for (const s of SIDES) {
    const q = sidePoint(r, s), dq = Math.hypot(p.x - q.x, p.y - q.y);
    if (dq < d) { d = dq; best = s; }
  }
  return best;
}

export type Bezier = [Point, Point, Point, Point];

/** Smooth curve from a to b that leaves and enters square to the given sides. A missing side means a loose end. */
export function curveBetween(a: Point, aSide: Side, b: Point, bSide: Side | null): Bezier {
  const k = Math.max(30, Math.min(220, Math.hypot(b.x - a.x, b.y - a.y) * 0.45));
  const na = NORMAL[aSide], nb = bSide ? NORMAL[bSide] : { x: 0, y: 0 };
  return [a, { x: a.x + na.x * k, y: a.y + na.y * k }, { x: b.x + nb.x * k, y: b.y + nb.y * k }, b];
}

/** Every link as a cubic Bezier; straight links have their control points on the ends. */
export function linkCurve(link: Link, get: (id: string) => Item | undefined): Bezier | null {
  const a = get(link.from), b = get(link.to);
  if (!a || !b) return null;
  if (link.fromSide && link.toSide) return curveBetween(sidePoint(a, link.fromSide), link.fromSide, sidePoint(b, link.toSide), link.toSide);
  const [p, q] = linkEnds(link, get)!;
  return [p, p, q, q];
}

export function bezierPoint([a, b, c, d]: Bezier, t: number): Point {
  const u = 1 - t;
  return {
    x: u * u * u * a.x + 3 * u * u * t * b.x + 3 * u * t * t * c.x + t * t * t * d.x,
    y: u * u * u * a.y + 3 * u * u * t * b.y + 3 * u * t * t * c.y + t * t * t * d.y,
  };
}

export function distToBezier(p: Point, curve: Bezier): number {
  let d = Infinity, prev = curve[0];
  for (let i = 1; i <= 24; i++) {
    const q = bezierPoint(curve, i / 24);
    d = Math.min(d, distToSegment(p, prev, q));
    prev = q;
  }
  return d;
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
    const curve = linkCurve(links[i], get);
    if (curve && distToBezier(p, curve) <= tol) return links[i];
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
