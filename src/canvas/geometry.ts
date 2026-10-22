import type { Item, Link, PolyShape, Side } from '../model/types';

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

/** Corners of the polygon figures in a unit box, each stretched to fill it. */
const POLY: Record<PolyShape, Point[]> = (() => {
  const ring = (n: number, inner?: number) => Array.from({ length: inner ? n * 2 : n }, (_, i) => {
    const a = -Math.PI / 2 + (i * Math.PI * 2) / (inner ? n * 2 : n), r = inner && i % 2 ? inner : 1;
    return { x: Math.cos(a) * r, y: Math.sin(a) * r };
  });
  const fit = (pts: Point[]) => {
    const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y);
    const x0 = Math.min(...xs), y0 = Math.min(...ys), w = Math.max(...xs) - x0, h = Math.max(...ys) - y0;
    return pts.map((p) => ({ x: (p.x - x0) / w, y: (p.y - y0) / h }));
  };
  return {
    triangle: [{ x: 0.5, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }],
    rhombus: [{ x: 0.5, y: 0 }, { x: 1, y: 0.5 }, { x: 0.5, y: 1 }, { x: 0, y: 0.5 }],
    pentagon: fit(ring(5)),
    star: fit(ring(5, 0.4)),
  };
})();

/** A polygon item's corners on the board. */
export const polyPoints = (it: Item): Point[] =>
  (POLY[it.shape ?? 'triangle'] ?? POLY.triangle).map((p) => ({ x: it.x + p.x * it.w, y: it.y + p.y * it.h }));

export function pointInPolygon(p: Point, pts: Point[]): boolean {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const a = pts[i], b = pts[j];
    if ((a.y > p.y) !== (b.y > p.y) && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

/** How far along the ray from c by (dx, dy) it first crosses the polygon's outline (1 = the full step). */
function polyExit(pts: Point[], c: Point, dx: number, dy: number): number {
  let best = Infinity;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length], ex = b.x - a.x, ey = b.y - a.y;
    const den = dx * ey - dy * ex;
    if (!den) continue;
    const t = ((a.x - c.x) * ey - (a.y - c.y) * ex) / den, u = ((a.x - c.x) * dy - (a.y - c.y) * dx) / den;
    if (t > 0 && u >= 0 && u <= 1) best = Math.min(best, t);
  }
  return best;
}

/** Where the line from the item's centre toward `toward` leaves the item's outline. */
export function edgePoint(item: Item, toward: Point): Point {
  const c = center(item), hw = item.w / 2, hh = item.h / 2;
  const dx = toward.x - c.x, dy = toward.y - c.y;
  if (!dx && !dy) return c;
  let t: number;
  if (item.type === 'ellipse') t = 1 / Math.sqrt((dx / hw) ** 2 + (dy / hh) ** 2);
  else if (item.type === 'polygon') t = polyExit(polyPoints(item), c, dx, dy);
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

/** Tasks: the round checkbox sits in the top right corner, in a strip this wide; the text fills the rest. */
/** The checkbox keeps its size on screen at any zoom (in screen pixels here), until zooming out far
 *  enough that it would outgrow the card. */
export const TASK_INSET = 40;
export const TASK_BOX_R = 10;
const TASK_BOX_GAP = 8;

/** The checkbox's centre and radius on the board at this zoom. */
export function taskBox(it: Rect, zoom = 1): Point & { r: number } {
  const k = Math.min(1 / zoom, (it.h * 0.3) / TASK_BOX_R), r = TASK_BOX_R * k, gap = TASK_BOX_GAP * k;
  return { x: it.x + it.w - r - gap, y: it.y + r + gap, r };
}

/** Width of the strip on the right that the checkbox takes from the text, at this zoom. */
export const taskInset = (it: Rect, zoom = 1): number => TASK_INSET * Math.min(1 / zoom, (it.h * 0.3) / TASK_BOX_R);

/** Whether the point is on a task's checkbox, with a little room around it. */
export function onTaskBox(it: Item, p: Point, zoom = 1): boolean {
  const c = taskBox(it, zoom);
  return Math.hypot(p.x - c.x, p.y - c.y) <= c.r * 1.5;
}

/** Audio notes: the play button's centre and radius, scaled with the card's height (drawn 64 high). */
export const audioButton = (it: Rect): Point & { r: number } => {
  const k = it.h / 64;
  return { x: it.x + 32 * k, y: it.y + it.h / 2, r: 20 * k };
};
export function onAudioButton(it: Item, p: Point): boolean {
  const b = audioButton(it);
  return Math.hypot(p.x - b.x, p.y - b.y) <= b.r + 4;
}

/** An ink stroke's points on the board. */
export function inkPoints(it: Item): Point[] {
  const pts = it.pts ?? [], k = it.w / (it.iw || it.w || 1), out: Point[] = [];
  for (let i = 0; i + 1 < pts.length; i += 2) out.push({ x: it.x + pts[i] * k, y: it.y + pts[i + 1] * k });
  return out;
}

/** Whether the point is within `tol` of the stroke's line. */
export function nearInk(it: Item, p: Point, tol: number): boolean {
  const pts = inkPoints(it), r = (it.sw ?? 2) * (it.w / (it.iw || it.w || 1)) / 2 + tol;
  if (pts.length === 1) return Math.hypot(p.x - pts[0].x, p.y - pts[0].y) <= r;
  for (let i = 1; i < pts.length; i++) if (distToSegment(p, pts[i - 1], pts[i]) <= r) return true;
  return false;
}

/**
 * Topmost item under the point. Ink counts only near its line. A frame counts on its label and
 * anywhere inside, so it can be grabbed by any empty spot (frames lie under everything else).
 */
export function hitItem(items: Item[], p: Point, zoom: number): Item | null {
  for (let i = items.length - 1; i >= 0; i--) {
    const it = items[i];
    if (it.type === 'frame') {
      const onLabel = p.x >= it.x && p.x <= it.x + it.w && p.y >= it.y - FRAME_LABEL && p.y < it.y;
      if (onLabel || pointInRect(p, it)) return it;
      continue;
    }
    if (it.type === 'ink') {
      if (pointInRect(p, it) && nearInk(it, p, 5 / zoom)) return it;
      continue;
    }
    if (it.type === 'polygon') {
      if (pointInRect(p, it) && pointInPolygon(p, polyPoints(it))) return it;
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
