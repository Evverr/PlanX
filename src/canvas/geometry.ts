import type { Item, Link, PolyShape, Side } from '../model/types';

export interface Point { x: number; y: number }
export interface Rect { x: number; y: number; w: number; h: number }

/** Height of the clickable label strip above a frame, in board units. */
export const FRAME_LABEL = 30;

export const center = (r: Rect): Point => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 });

/** An item's turn in radians (items keep it in degrees). */
export const angleOf = (it: { rot?: number }): number => ((it.rot ?? 0) * Math.PI) / 180;

/** p turned by a radians about c, clockwise on screen. */
export function turn(p: Point, c: Point, a: number): Point {
  if (!a) return p;
  const cos = Math.cos(a), sin = Math.sin(a), dx = p.x - c.x, dy = p.y - c.y;
  return { x: c.x + dx * cos - dy * sin, y: c.y + dx * sin + dy * cos };
}

type Turned = Rect & { rot?: number };

/** A board point in a turned item's own frame, where the item lies square: and back again. */
export const toLocal = (it: Turned, p: Point): Point => turn(p, center(it), -angleOf(it));
export const fromLocal = (it: Turned, p: Point): Point => turn(p, center(it), angleOf(it));

/** Where an item resized to w × h goes so that its top left corner stays put, turned or not. */
export function resizedAt(it: Turned, w: number, h: number): Point {
  const tl = fromLocal(it, it), c = turn({ x: tl.x + w / 2, y: tl.y + h / 2 }, tl, angleOf(it));
  return { x: c.x - w / 2, y: c.y - h / 2 };
}

/** Where a (turned) item resized to w × h goes with its own top left corner moved `dl` along its top and
 *  `dt` down its side (stretched by its left or top side, the other side staying put). */
export function resizedFrom(it: Turned, w: number, h: number, dl: number, dt: number): Point {
  const a = angleOf(it), s = turn({ x: dl, y: dt }, { x: 0, y: 0 }, a), tl0 = fromLocal(it, it), tl = { x: tl0.x + s.x, y: tl0.y + s.y };
  const c = turn({ x: tl.x + w / 2, y: tl.y + h / 2 }, tl, a);
  return { x: c.x - w / 2, y: c.y - h / 2 };
}

/** Solid, what's under it hidden there: a task, a sticker, a picture, a table, a shape filled in. */
export const solid = (o: Item): boolean => !o.rot
  && (o.type === 'task' || o.type === 'sticky' || o.type === 'image' || o.type === 'table' || ((o.type === 'rect' || o.type === 'ellipse') && o.color !== 'none'));

/** Whether a point of `it` is under something solid over it (`items` bottom to top): its handle there,
 *  say, neither drawn nor taken hold of. */
export function coveredAt(items: Item[], it: Item, p: Point): boolean {
  const at = items.findIndex((i) => i.id === it.id);
  return at >= 0 && items.slice(at + 1).some((o) => solid(o) && p.x >= o.x && p.x <= o.x + o.w && p.y >= o.y && p.y <= o.y + o.h);
}

/** The box square to the board around an item, turned or not. */
export function boxOf(it: Turned): Rect {
  const a = angleOf(it);
  if (!a) return it;
  const c = Math.abs(Math.cos(a)), s = Math.abs(Math.sin(a)), w = it.w * c + it.h * s, h = it.w * s + it.h * c;
  return { x: it.x + it.w / 2 - w / 2, y: it.y + it.h / 2 - h / 2, w, h };
}

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
    // (Drawn from its icon: see polyPoints.)
    star: [],
    hexagon: [{ x: 0.25, y: 0 }, { x: 0.75, y: 0 }, { x: 1, y: 0.5 }, { x: 0.75, y: 1 }, { x: 0.25, y: 1 }, { x: 0, y: 0.5 }],
    parallelogram: [{ x: 0.25, y: 0 }, { x: 1, y: 0 }, { x: 0.75, y: 1 }, { x: 0, y: 1 }],
    trapezoid: [{ x: 0.22, y: 0 }, { x: 0.78, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }],
    arrow: [{ x: 0, y: 0.3 }, { x: 0.6, y: 0.3 }, { x: 0.6, y: 0 }, { x: 1, y: 0.5 }, { x: 0.6, y: 1 }, { x: 0.6, y: 0.7 }, { x: 0, y: 0.7 }],
    cross: [{ x: 1 / 3, y: 0 }, { x: 2 / 3, y: 0 }, { x: 2 / 3, y: 1 / 3 }, { x: 1, y: 1 / 3 }, { x: 1, y: 2 / 3 }, { x: 2 / 3, y: 2 / 3 },
      { x: 2 / 3, y: 1 }, { x: 1 / 3, y: 1 }, { x: 1 / 3, y: 2 / 3 }, { x: 0, y: 2 / 3 }, { x: 0, y: 1 / 3 }, { x: 1 / 3, y: 1 / 3 }],
  };
})();

/** A corner of a path drawn with "Перо" and the handles of the curves either side of it (on it when
 *  the corner is sharp). */
export interface PathNode { p: Point; i: Point; o: Point }
export const samePoint = (a: Point, b: Point) => Math.abs(a.x - b.x) < 1e-6 && Math.abs(a.y - b.y) < 1e-6;

/** A path's outline as points: straight from corner to corner, or along the curve their handles make. */
export function flattenPath(nodes: PathNode[], closed: boolean, steps = 16): Point[] {
  const n = nodes.length, out: Point[] = n ? [nodes[0].p] : [];
  for (let s = 0; s < (closed ? n : n - 1); s++) {
    const a = nodes[s], b = nodes[(s + 1) % n];
    if (samePoint(a.o, a.p) && samePoint(b.i, b.p)) { out.push(b.p); continue; }
    for (let k = 1; k <= steps; k++) {
      const t = k / steps, u = 1 - t, c0 = u * u * u, c1 = 3 * u * u * t, c2 = 3 * u * t * t, c3 = t * t * t;
      out.push({ x: c0 * a.p.x + c1 * a.o.x + c2 * b.i.x + c3 * b.p.x, y: c0 * a.p.y + c1 * a.o.y + c2 * b.i.y + c3 * b.p.y });
    }
  }
  if (closed && n > 1) out.pop();
  return out;
}

/** A path's nodes from its corners (x0, y0, x1…) and their handles (in x, y, out x, y for each), through `at`. */
export function pathNodes(pts: number[], hs: number[] | undefined, at: (x: number, y: number) => Point): PathNode[] {
  return Array.from({ length: pts.length >> 1 }, (_, i) => {
    const p = at(pts[i * 2], pts[i * 2 + 1]);
    return hs ? { p, i: at(hs[i * 4], hs[i * 4 + 1]), o: at(hs[i * 4 + 2], hs[i * 4 + 3]) } : { p, i: p, o: p };
  });
}

/** A polygon item's corners on the board (along its curves, for one drawn with "Перо" with some). */
/** The star as the icon draws it (assets/icon-set/favorite-solid.svg), on its 24 grid, its points round:
 *  from this point, by straight runs (one point) and curves (three, the last where it ends). */
const STAR_FROM: Point = { x: 11.2156, y: 3.55591 };
const STAR_RUNS: number[][] = [
  [11.5303, 2.89111, 12.4682, 2.89111, 12.7828, 3.55591], [14.8973, 8.05566], [19.6107, 8.76807],
  [20.3528, 8.88684, 20.5712, 9.77734, 20.0987, 10.2639], [16.6699, 13.7783], [17.4808, 18.7291],
  [17.5876, 19.394, 16.9038, 20.035, 16.2092, 19.6552], [11.9992, 17.3282], [7.78922, 19.6552],
  [7.09468, 20.035, 6.41081, 19.394, 6.51765, 18.7291], [7.32855, 13.7783], [3.89975, 10.2639],
  [3.42723, 9.77734, 3.64568, 8.88684, 4.38771, 8.76807], [9.10231, 8.05566],
];
/** Its outline as points along it. */
const starLine = (): Point[] => {
  const out = [STAR_FROM];
  for (const r of STAR_RUNS) {
    const a = out[out.length - 1];
    if (r.length === 2) { out.push({ x: r[0], y: r[1] }); continue; }
    for (let i = 1; i <= 8; i++) {
      const t = i / 8, u = 1 - t;
      out.push({
        x: u * u * u * a.x + 3 * u * u * t * r[0] + 3 * u * t * t * r[2] + t * t * t * r[4],
        y: u * u * u * a.y + 3 * u * u * t * r[1] + 3 * u * t * t * r[3] + t * t * t * r[5],
      });
    }
  }
  return out;
};
const STAR_BOX = (() => {
  const pts = starLine(), xs = pts.map((p) => p.x), ys = pts.map((p) => p.y), x = Math.min(...xs), y = Math.min(...ys);
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
})();
/** Its corners, sharp, each stretched to fill a unit box: a tip where the straight runs either side of
 *  it would meet, then the inner corner after it. For a star given a corner radius of its own. */
const STAR_CORNERS: Point[] = (() => {
  const at = (r: number[]): Point => ({ x: r[r.length - 2], y: r[r.length - 1] });
  const out: Point[] = [], n = STAR_RUNS.length;
  for (let i = 0; i < n; i += 3) {
    const before = at(STAR_RUNS[i ? i - 2 : n - 1]), start = i ? at(STAR_RUNS[i - 1]) : STAR_FROM, end = at(STAR_RUNS[i]), inner = at(STAR_RUNS[i + 1]);
    const dx = start.x - before.x, dy = start.y - before.y, ex = inner.x - end.x, ey = inner.y - end.y;
    const t = ((end.x - before.x) * ey - (end.y - before.y) * ex) / (dx * ey - dy * ex);
    out.push({ x: before.x + dx * t, y: before.y + dy * t }, inner);
  }
  const xs = out.map((p) => p.x), ys = out.map((p) => p.y), x = Math.min(...xs), y = Math.min(...ys), w = Math.max(...xs) - x, h = Math.max(...ys) - y;
  return out.map((p) => ({ x: (p.x - x) / w, y: (p.y - y) / h }));
})();
/** The corner radius a star drawn as its icon looks to have, by its size. */
export const starRound = (it: { w: number; h: number }): number => Math.round(Math.min(it.w, it.h) * 0.06);

/** Adds the star, filling a box, to the current path. */
export function traceStar(ctx: CanvasPath, b: { x: number; y: number; w: number; h: number }): void {
  const X = (v: number) => b.x + ((v - STAR_BOX.x) / STAR_BOX.w) * b.w, Y = (v: number) => b.y + ((v - STAR_BOX.y) / STAR_BOX.h) * b.h;
  ctx.moveTo(X(STAR_FROM.x), Y(STAR_FROM.y));
  for (const r of STAR_RUNS) {
    if (r.length === 2) ctx.lineTo(X(r[0]), Y(r[1]));
    else ctx.bezierCurveTo(X(r[0]), Y(r[1]), X(r[2]), Y(r[3]), X(r[4]), Y(r[5]));
  }
  ctx.closePath();
}

export function polyPoints(it: Item): Point[] {
  // A star as its icon draws it, unless it's been given a corner radius of its own.
  if (it.shape === 'star' && it.rad !== undefined) return STAR_CORNERS.map((p) => ({ x: it.x + p.x * it.w, y: it.y + p.y * it.h }));
  if (it.shape === 'star') return starLine().map((p) => ({ x: it.x + ((p.x - STAR_BOX.x) / STAR_BOX.w) * it.w, y: it.y + ((p.y - STAR_BOX.y) / STAR_BOX.h) * it.h }));
  if (it.vx && !it.shape) {
    const nodes = pathNodes(it.vx, it.vh, (x, y) => ({ x: it.x + x * it.w, y: it.y + y * it.h }));
    return it.vh ? flattenPath(nodes, true) : nodes.map((n) => n.p);
  }
  return (POLY[it.shape ?? 'triangle'] ?? POLY.triangle).map((p) => ({ x: it.x + p.x * it.w, y: it.y + p.y * it.h }));
}

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
  if (item.rot) return fromLocal(item, edgePoint({ ...item, rot: undefined }, toLocal(item, toward)));
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

/** Midpoint of an item's side (or the point `at` along it, 0…1, left to right or top to bottom),
 *  pushed `gap` outward, on the board: turned with the item. Curved links attach here, the selection
 *  dots sit just outside. */
export function sidePoint(r: Turned, side: Side, gap = 0, at = 0.5): Point {
  const c = center(r), n = NORMAL[side], along = at - 0.5;
  return fromLocal(r, { x: c.x + n.x * (r.w / 2 + gap) + (n.x ? 0 : along * r.w), y: c.y + n.y * (r.h / 2 + gap) + (n.y ? 0 : along * r.h) });
}

/** Where on an item's outline a link's end let go at `p` goes: the side nearest it and how far along
 *  (0…1); its middle when within `snap` of it (board units). */
export function anchorAt(r: Turned, p: Point, snap: number): { side: Side; at: number } {
  const q = toLocal(r, p), c = center(r);
  const d: Record<Side, number> = { top: Math.abs(q.y - r.y), bottom: Math.abs(q.y - r.y - r.h), left: Math.abs(q.x - r.x), right: Math.abs(q.x - r.x - r.w) };
  // (Inside, the side it's nearest; outside, the one it's past.)
  const side = SIDES.reduce((a, s) => (d[s] < d[a] ? s : a), 'top' as Side);
  const across = side === 'top' || side === 'bottom', len = across ? r.w : r.h;
  const at = Math.max(0, Math.min(1, across ? (q.x - r.x) / r.w : (q.y - r.y) / r.h));
  return { side, at: Math.abs(at - 0.5) * len <= snap || Math.abs((across ? q.x : q.y) - (across ? c.x : c.y)) <= snap ? 0.5 : Math.round(at * 1000) / 1000 };
}

/** The side whose midpoint is closest to p. */
export function nearestSide(r: Turned, p: Point): Side {
  let best: Side = 'top', d = Infinity;
  for (const s of SIDES) {
    const q = sidePoint(r, s), dq = Math.hypot(p.x - q.x, p.y - q.y);
    if (dq < d) { d = dq; best = s; }
  }
  return best;
}

export type Bezier = [Point, Point, Point, Point];

/** Smooth curve from a to b that leaves and enters square to the given sides, of items turned by
 *  aRot and bRot radians. A missing side means a loose end. */
export function curveBetween(a: Point, aSide: Side, b: Point, bSide: Side | null, aRot = 0, bRot = 0): Bezier {
  const k = Math.max(30, Math.min(220, Math.hypot(b.x - a.x, b.y - a.y) * 0.45)), o = { x: 0, y: 0 };
  const na = turn(NORMAL[aSide], o, aRot), nb = bSide ? turn(NORMAL[bSide], o, bRot) : o;
  return [a, { x: a.x + na.x * k, y: a.y + na.y * k }, { x: b.x + nb.x * k, y: b.y + nb.y * k }, b];
}

/** Every link as a cubic Bezier; straight links have their control points on the ends. */
export function linkCurve(link: Link, get: (id: string) => Item | undefined): Bezier | null {
  const a = get(link.from), b = get(link.to);
  if (!a || !b) return null;
  if (link.fromSide && link.toSide) {
    return curveBetween(sidePoint(a, link.fromSide, 0, link.fromAt), link.fromSide, sidePoint(b, link.toSide, 0, link.toAt), link.toSide, angleOf(a), angleOf(b));
  }
  const [p, q] = linkEnds(link, get)!;
  return [p, p, q, q];
}

/** How a link runs: through these points, and, a smooth one, as this curve (its points then along it). */
export interface LinkShape { pts: Point[]; curve?: Bezier }

/**
 * A link's shape by its style: a smooth curve out of its sides and into them; a straight line between
 * them; or right angles, out of its side a little way, turning halfway (or once, from a side across to a
 * side along) and into the other side. One without sides goes from the sides facing each other.
 */
/** How far short of a thing put into a line ("Узел на линии", src/labs) the line stops. */
const JOINT_GAP = 3;

/** How an instance (src/model/components.ts) is met by links and shows its link dots: by its contents,
 *  not its own box (as big as its component's, padding and all). Set by the editor. */
let instanceBox: ((it: Item) => Rect) | null = null;
export const setInstanceBox = (fn: (it: Item) => Rect) => { instanceBox = fn; };
export const linkBox = (it: Item): Item => (it.inst && instanceBox ? { ...it, ...instanceBox(it) } : it);

export function linkShape(link: Link, getItem: (id: string) => Item | undefined): LinkShape | null {
  // A thing put into a line is met that much further out all round.
  const get = (id: string) => { const found = getItem(id), it = found && linkBox(found); return it?.joint ? { ...it, x: it.x - JOINT_GAP, y: it.y - JOINT_GAP, w: it.w + JOINT_GAP * 2, h: it.h + JOINT_GAP * 2 } : it; };
  const a = get(link.from), b = get(link.to);
  if (!a || !b) return null;
  // Through its nodes: from its item's edge (or side) toward the first, on through each, into the other's
  // edge from the last; in a smooth curve through them, or straight from one to the next.
  // Right-angled, with its own bends: out of its sides, through them, square at every turn.
  if (link.via?.length && link.style === 'elbow') {
    const via = link.via, ps = link.fromSide ?? nearestSide(a, via[0]), qs = link.toSide ?? nearestSide(b, via[via.length - 1]);
    return { pts: squared([sidePoint(a, ps, 0, link.fromSide ? link.fromAt : 0.5), ...via, sidePoint(b, qs, 0, link.toSide ? link.toAt : 0.5)], ps === 'left' || ps === 'right') };
  }
  if (link.via?.length) {
    const via = link.via, p = link.fromSide ? sidePoint(a, link.fromSide, 0, link.fromAt) : edgePoint(a, via[0]);
    const q = link.toSide ? sidePoint(b, link.toSide, 0, link.toAt) : edgePoint(b, via[via.length - 1]), all = [p, ...via, q];
    return { pts: link.style && link.style !== 'arc' ? all : throughSmoothly(all) };
  }
  // An arc: out of its side (or the one facing the other), into its other end any way it comes.
  if (link.style === 'arc') {
    const ps = link.fromSide ?? nearestSide(a, center(b)), p = sidePoint(a, ps, 0, link.fromSide ? link.fromAt : 0.5);
    const q = link.toSide ? sidePoint(b, link.toSide, 0, link.toAt) : edgePoint(b, p), curve = curveBetween(p, ps, q, null, angleOf(a), angleOf(b));
    return { curve, pts: Array.from({ length: 25 }, (_, i) => bezierPoint(curve, i / 24)) };
  }
  if (!link.style) {
    const curve = linkCurve(link, get)!;
    return { curve, pts: Array.from({ length: 25 }, (_, i) => bezierPoint(curve, i / 24)) };
  }
  const ps = link.fromSide ?? nearestSide(a, center(b)), qs = link.toSide ?? nearestSide(b, center(a));
  const p = link.fromSide || link.style === 'elbow' ? sidePoint(a, ps, 0, link.fromSide ? link.fromAt : 0.5) : linkEnds(link, get)![0];
  const q = link.toSide || link.style === 'elbow' ? sidePoint(b, qs, 0, link.toSide ? link.toAt : 0.5) : linkEnds(link, get)![1];
  return { pts: link.style === 'straight' ? [p, q] : elbowRoute(p, ps, q, qs) };
}

/** Points made a right-angled route: a corner put in where two don't line up (turning the other way
 *  from the stretch before, the first going `across` or up and down), and points in line dropped. */
export function squared(pts: Point[], across: boolean): Point[] {
  const out: Point[] = [pts[0]];
  let flat = across;
  for (const q of pts.slice(1)) {
    const a = out[out.length - 1];
    if (Math.abs(a.x - q.x) > 0.5 && Math.abs(a.y - q.y) > 0.5) out.push(flat ? { x: q.x, y: a.y } : { x: a.x, y: q.y });
    out.push(q);
    // Come in up or down, it goes on across, and the other way round: each point a turn.
    const b = out[out.length - 2];
    flat = Math.abs(b.y - q.y) > 0.5;
  }
  return straightened(out);
}

/** The same points without repeats or points in line between two others. */
function straightened(pts: Point[]): Point[] {
  const out: Point[] = [];
  for (const pt of pts) {
    const last = out[out.length - 1];
    if (last && Math.abs(last.x - pt.x) < 0.5 && Math.abs(last.y - pt.y) < 0.5) continue;
    const prev = out[out.length - 2];
    if (prev && ((Math.abs(prev.x - last.x) < 0.5 && Math.abs(last.x - pt.x) < 0.5) || (Math.abs(prev.y - last.y) < 0.5 && Math.abs(last.y - pt.y) < 0.5))) out.pop();
    out.push(pt);
  }
  return out;
}

/** A right-angled route with its stretch `k` (from pts[k] to pts[k + 1]) moved across to `v` (its y if
 *  it runs across, its x if up and down). Its ends stay on their items: a stretch at an end moved gets a
 *  new bend `stub` out from it. Gives the bends between the ends. */
export function movedStretch(pts: Point[], k: number, v: number, stub = 24): Point[] {
  const a = pts[k], b = pts[k + 1], flat = Math.abs(a.y - b.y) <= 0.5, n = pts.length;
  const at = (p: Point, w: number) => (flat ? { x: p.x, y: w } : { x: w, y: p.y });
  const along = (p: Point, d: number) => (flat ? { x: p.x + d, y: p.y } : { x: p.x, y: p.y + d });
  const dir = Math.sign(flat ? b.x - a.x : b.y - a.y) || 1;
  const head = k === 0 ? [a, along(a, stub * dir), at(along(a, stub * dir), v)] : [at(a, v)];
  const tail = k + 1 === n - 1 ? [at(along(b, -stub * dir), v), along(b, -stub * dir), b] : [at(b, v)];
  const route = straightened([...pts.slice(0, k), ...head, ...tail, ...pts.slice(k + 2)]);
  return route.slice(1, -1);
}

/** A smooth curve through the points (Catmull-Rom, as Béziers), as points close enough to draw it by. */
export function throughSmoothly(pts: Point[], steps = 16): Point[] {
  const out: Point[] = [pts[0]];
  for (let i = 0; i + 1 < pts.length; i++) {
    const p0 = pts[i - 1] ?? pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] ?? p2;
    const c1 = { x: p1.x + (p2.x - p0.x) / 6, y: p1.y + (p2.y - p0.y) / 6 }, c2 = { x: p2.x - (p3.x - p1.x) / 6, y: p2.y - (p3.y - p1.y) / 6 };
    for (let k = 1; k <= steps; k++) out.push(bezierPoint([p1, c1, c2, p2], k / steps));
  }
  return out;
}

/** A picked link's handles: its nodes (on the board), and the middles of the stretches between its ends
 *  and nodes, to make a new node at (`at` is where in `via` it would go). */
export function linkHandles(link: Link, shape: LinkShape): { nodes: Point[]; middles: Array<{ p: Point; at: number }> } {
  // A right-angled one: the middle of each of its stretches, to move that stretch (see movedStretch).
  if (link.style === 'elbow') {
    const pts = shape.pts;
    return { nodes: [], middles: pts.slice(1).map((q, i) => ({ p: { x: (pts[i].x + q.x) / 2, y: (pts[i].y + q.y) / 2 }, at: i })) };
  }
  const via = link.via ?? [], all = [shape.pts[0], ...via, shape.pts[shape.pts.length - 1]];
  // Without nodes yet, the middle is on the line as it's drawn (a curve's own, not its chord's).
  // On a smooth one, halfway along each stretch of its curve (16 points each, see throughSmoothly).
  const middles = !via.length ? [{ p: halfway(shape.pts), at: 0 }]
    : all.slice(1).map((q, i) => ({ p: link.style && link.style !== 'arc' ? { x: (all[i].x + q.x) / 2, y: (all[i].y + q.y) / 2 } : shape.pts[i * 16 + 8], at: i }));
  return { nodes: via, middles };
}

/** The point halfway along a line through the points. */
function halfway(pts: Point[]): Point {
  const lengths = pts.slice(1).map((q, i) => Math.hypot(q.x - pts[i].x, q.y - pts[i].y));
  let left = lengths.reduce((a, b) => a + b, 0) / 2;
  for (let i = 0; i < lengths.length; i++) {
    if (left <= lengths[i]) { const k = lengths[i] ? left / lengths[i] : 0; return { x: pts[i].x + (pts[i + 1].x - pts[i].x) * k, y: pts[i].y + (pts[i + 1].y - pts[i].y) * k }; }
    left -= lengths[i];
  }
  return pts[pts.length - 1];
}

/** Right angles from p out of side `ps` to q into side `qs`, without points in line between others. */
export function elbowRoute(p: Point, ps: Side, q: Point, qs: Side): Point[] {
  const S = 24, n1 = NORMAL[ps], n2 = NORMAL[qs];
  const a = { x: p.x + n1.x * S, y: p.y + n1.y * S }, b = { x: q.x + n2.x * S, y: q.y + n2.y * S };
  const across1 = n1.y === 0, across2 = n2.y === 0;
  const mid = across1 && across2 ? [{ x: (a.x + b.x) / 2, y: a.y }, { x: (a.x + b.x) / 2, y: b.y }]
    : !across1 && !across2 ? [{ x: a.x, y: (a.y + b.y) / 2 }, { x: b.x, y: (a.y + b.y) / 2 }]
    : across1 ? [{ x: b.x, y: a.y }] : [{ x: a.x, y: b.y }];
  const all = [p, a, ...mid, b, q], out: Point[] = [];
  for (const pt of all) {
    const last = out[out.length - 1];
    if (last && Math.abs(last.x - pt.x) < 0.01 && Math.abs(last.y - pt.y) < 0.01) continue;
    const prev = out[out.length - 2];
    // In line with the two before it: the one between goes.
    if (prev && ((Math.abs(prev.x - last.x) < 0.01 && Math.abs(last.x - pt.x) < 0.01) || (Math.abs(prev.y - last.y) < 0.01 && Math.abs(last.y - pt.y) < 0.01))) out.pop();
    out.push(pt);
  }
  return out;
}

/**
 * Right-angled links kept from lying on one another: a stretch of one along a stretch already there
 * (the same way, as good as on the same line, overlapping) moves across by `step` till it's clear,
 * the stretches either side of it following, so it stays in right angles. Changes the points in place.
 */
export function spreadElbows(shapes: LinkShape[], step: number): void {
  const taken: Array<{ upright: boolean; at: number; from: number; to: number }> = [];
  for (const sh of shapes) {
    if (sh.curve || sh.pts.length < 2) continue;
    const pts = sh.pts.map((p) => ({ ...p }));
    for (let i = 1; i < pts.length; i++) {
      const p = pts[i - 1], q = pts[i], upright = Math.abs(p.x - q.x) < 0.01;
      if (!upright && Math.abs(p.y - q.y) >= 0.01) continue;
      const from = Math.min(upright ? p.y : p.x, upright ? q.y : q.x), to = Math.max(upright ? p.y : p.x, upright ? q.y : q.x);
      const was = upright ? p.x : p.y;
      let at = was;
      for (let n = 0; n < 8 && taken.some((t) => t.upright === upright && Math.abs(t.at - at) < step * 0.9 && t.from < to - 0.5 && t.to > from + 0.5); n++) at += step;
      if (at !== was) { if (upright) { p.x = at; q.x = at; } else { p.y = at; q.y = at; } }
      taken.push({ upright, at, from, to });
    }
    sh.pts = pts;
  }
}

/** Whether a line through points runs into the rectangle anywhere (each stretch tried at 12 points along it). */
export function pathCrosses(pts: Point[], r: Rect): boolean {
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i];
    for (let k = 0; k <= 12; k++) {
      const x = a.x + ((b.x - a.x) * k) / 12, y = a.y + ((b.y - a.y) * k) / 12;
      if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) return true;
    }
  }
  return false;
}

/** How far a point is from a line through points. */
export function distToPath(p: Point, pts: Point[]): number {
  let d = Infinity;
  for (let i = 1; i < pts.length; i++) d = Math.min(d, distToSegment(p, pts[i - 1], pts[i]));
  return d;
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
  // A line drawn with "Перо" with curves: along them.
  if (it.ph) return flattenPath(pathNodes(pts, it.ph, (x, y) => ({ x: it.x + x * k, y: it.y + y * k })), false);
  for (let i = 0; i + 1 < pts.length; i += 2) out.push({ x: it.x + pts[i] * k, y: it.y + pts[i + 1] * k });
  return out;
}

/** Whether the point is within `tol` of the stroke's line. */
export function nearInk(it: Item, p: Point, tol: number): boolean {
  p = toLocal(it, p);
  const pts = inkPoints(it), r = (it.sw ?? 2) * (it.w / (it.iw || it.w || 1)) / 2 + tol;
  if (pts.length === 1) return Math.hypot(p.x - pts[0].x, p.y - pts[0].y) <= r;
  for (let i = 1; i < pts.length; i++) if (distToSegment(p, pts[i - 1], pts[i]) <= r) return true;
  return false;
}

/** An instance hugs its visible contents, without the source frame's padding; empty ones keep a box. */
export const instanceBounds = (it: Item, items: Item[]): Rect => boundsOf(items.filter((i) => i.host === it.id)) ?? boxOf(it);

/**
 * Topmost item under the point. Ink counts only near its line. A frame counts on its label and
 * anywhere inside, so it can be grabbed by any empty spot (frames lie under everything else).
 */

export function hitItem(items: Item[], p: Point, zoom: number): Item | null {
  const at = p;
  for (let i = items.length - 1; i >= 0; i--) {
    const it = items[i];
    // A turned item is tested in its own frame, where it lies square.
    p = it.rot ? toLocal(it, at) : at;
    if (it.type === 'frame') {
      const b = it.inst ? instanceBounds(it, items) : it, q = it.inst ? at : p;
      const onLabel = !it.fold && !it.tl && q.x >= b.x && q.x <= b.x + b.w && q.y >= b.y - FRAME_LABEL && q.y < b.y;
      if (onLabel || pointInRect(q, b)) return it;
      continue;
    }
    if (it.type === 'ink') {
      if (pointInRect(p, it) && nearInk(it, at, 5 / zoom)) return it;
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
    const shape = linkShape(links[i], get);
    if (shape && distToPath(p, shape.pts) <= tol) return links[i];
  }
  return null;
}

export function boundsOf(items: Item[]): Rect | null {
  if (!items.length) return null;
  let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
  for (const it of items) {
    const b = boxOf(it);
    x1 = Math.min(x1, b.x);
    y1 = Math.min(y1, b.y - (it.type === 'frame' ? FRAME_LABEL : 0));
    x2 = Math.max(x2, b.x + b.w);
    y2 = Math.max(y2, b.y + b.h);
  }
  return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
}
