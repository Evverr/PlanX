import type { Item } from './types';
import { FILLS } from './types';
import type { Point } from '../canvas/geometry';

/**
 * Mind maps, as in MindMeister: a central topic (a 'mind' item without a parent) and nodes that
 * branch from it, each pointing at its parent. Nodes are blue unless coloured otherwise; a coloured node
 * tints its parallel branches (not its parent, not its children) a lighter shade of it.
 */
export const MIND_COLOR = '#3E7BFA';

/** Colours a node can be given; only that node takes it (and the branch to it), not what grows from it. */
export const MIND_PALETTE = ['#3E7BFA', '#0C8599', '#30A46C', '#E8892B', '#E5484D', '#D6409F', '#8E4EC6', '#5B6170'];

/** The strip down a node's left edge, by how far it is from the centre: the stickers' colours from blue
 *  to yellow, the central topic blue, the fourth level and further yellow. */
const LEVEL_COLORS = ['blue', 'purple', 'pink', 'orange', 'yellow'].map((k) => FILLS[k]);
export const levelColor = (depth: number): string => LEVEL_COLORS[Math.min(depth, LEVEL_COLORS.length - 1)];
/** The colour of the branch leading to a node: the colour given it, or else its level's. */
export const branchColor = (it: Item, get: Get): string => (it.color?.startsWith('#') ? it.color : levelColor(mindDepth(it, get)));

/** A '#rrggbb' colour halfway to white. */
export function lighter(hex: string): string {
  const n = parseInt(hex.slice(1), 16), mix = (sh: number) => Math.round(((n >> sh) & 255) / 2 + 127.5);
  return `#${[16, 8, 0].map((sh) => mix(sh).toString(16).padStart(2, '0')).join('')}`;
}

/** The edge colour and fill a node takes from a parallel branch (same parent) that has its own, by parent. */
export function siblingTints(items: Item[]): Map<string, { color?: string; fill?: string }> {
  const out = new Map<string, { color?: string; fill?: string }>();
  for (const it of items) {
    if (it.type !== 'mind' || !it.parent) continue;
    const t = out.get(it.parent) ?? {};
    if (!t.color && it.color?.startsWith('#')) t.color = it.color;
    if (!t.fill && it.fc) t.fill = it.fc.startsWith('#') ? it.fc : FILLS[it.fc];
    out.set(it.parent, t);
  }
  return out;
}

/**
 * A node's edge colour and fill (null: the usual): its own, or else, when a parallel branch has been
 * coloured, the same colour in a lighter shade (halfway to white).
 */
export function nodeColors(it: Item, tints: Map<string, { color?: string; fill?: string }>): { color: string; fill: string | null } {
  const t = it.parent ? tints.get(it.parent) : undefined;
  const own = it.color?.startsWith('#') ? it.color : null, fill = it.fc ? (it.fc.startsWith('#') ? it.fc : FILLS[it.fc]) : null;
  return {
    color: own ?? (t?.color ? lighter(t.color) : MIND_COLOR),
    fill: fill ?? (t?.fill && t.fill.startsWith('#') ? lighter(t.fill) : null),
  };
}

type Get = (id: string) => Item | undefined;

/** How far from the centre: 0 for the central topic, 1 for the nodes on it, and so on. */
export function mindDepth(it: Item, get: Get): number {
  let d = 0, cur: Item | undefined = it;
  while (cur?.parent && d < 50) { cur = get(cur.parent); d++; }
  return d;
}

/** Every node branching from these, however far out (not the nodes themselves). */
export function descendants(ids: Iterable<string>, items: Item[]): string[] {
  const kids = new Map<string, string[]>();
  for (const it of items) if (it.type === 'mind' && it.parent) kids.set(it.parent, [...(kids.get(it.parent) ?? []), it.id]);
  const out: string[] = [], seen = new Set(ids), todo = [...seen];
  while (todo.length) {
    for (const k of kids.get(todo.pop()!) ?? []) if (!seen.has(k)) { seen.add(k); out.push(k); todo.push(k); }
  }
  return out;
}

/** Which side of its parent a node is on: 1 to the right, -1 to the left. */
export const mindSide = (it: Item, parent: Item): 1 | -1 => (it.x + it.w / 2 >= parent.x + parent.w / 2 ? 1 : -1);

/** Which way a node grows from its parent: to the right, to the left, down or up (a branch led down
 *  from the central topic, and all that grows from it, has `down`; one led up, `up`). */
export type Way = 'right' | 'left' | 'down' | 'up';
export const mindWay = (it: Item, parent: Item): Way => (it.up ? 'up' : it.down ? 'down' : mindSide(it, parent) > 0 ? 'right' : 'left');
/** Whether branches growing that way are under or over their parent, side by side. */
export const upright = (way: Way) => way === 'down' || way === 'up';
/** Which way a new branch of a central topic grows: right (1), left (-1), down or up. */
export type Toward = 1 | -1 | 'down' | 'up';

/** Gaps: from a parent to its branches beside it, and between those (one under another); from a
 *  parent to its branches under (or over) it, and between those (side by side). */
/** How opaque a node's fill is: its own, or by default the central topic 90%, the rest 70%; other
 *  items, theirs or 100%. */
export const fillOpacity = (it: Item): number => it.fo ?? (it.type === 'mind' ? (it.parent ? 0.7 : 0.9) : 1);

export const MIND_GAP_X = 60, MIND_GAP_Y = 16, MIND_GAP_DOWN = 48, MIND_GAP_ROW = 24;

/** The axis branches growing that way line up along (y beside their parent, x under or over it), their
 *  size along it and the gap between them. */
const axis = (way: Way) => (upright(way) ? { at: 'x', size: 'w', gap: MIND_GAP_ROW } as const : { at: 'y', size: 'h', gap: MIND_GAP_Y } as const);
type Axis = ReturnType<typeof axis>;
const lo = (b: Item[], a: Axis) => Math.min(...b.map((n) => n[a.at]));
const hi = (b: Item[], a: Axis) => Math.max(...b.map((n) => n[a.at] + n[a.size]));
const middle = (n: Item, a: Axis) => n[a.at] + n[a.size] / 2;
const shift = (b: Item[], a: Axis, d: number) => b.forEach((n) => { n[a.at] += d; });

/** Copies of the items to lay out, found by id, and a node with everything growing from it. */
function working(items: Item[]) {
  const all = items.map((i) => ({ ...i })), byId = new Map(all.map((i) => [i.id, i]));
  const block = (k: Item) => [k, ...descendants([k.id], all).map((d) => byId.get(d)!)];
  return { all, byId, block };
}
const branchesOf = (p: Item, way: Way, all: Item[]) => all.filter((i) => i.type === 'mind' && i.parent === p.id && mindWay(i, p) === way);
/** The way a new branch of `parent` grows: its parent's own way, or for a central topic, `toward`. */
const wayFrom = (parent: Item, get: Get, toward?: Toward): Way => {
  const up = parent.parent ? get(parent.parent) : undefined;
  return up ? mindWay(parent, up) : toward === 'down' || toward === 'up' ? toward : toward === -1 ? 'left' : 'right';
};
/** Where a branch growing that way from `n` stands across the way it grows: beside it 60 off its side,
 *  under or over it 48 off. */
function outFrom(n: Item, way: Way, k: { w: number; h: number }): Partial<Point> {
  if (way === 'down') return { y: n.y + n.h + MIND_GAP_DOWN };
  if (way === 'up') return { y: n.y - MIND_GAP_DOWN - k.h };
  return { x: way === 'right' ? n.x + n.w + MIND_GAP_X : n.x - MIND_GAP_X - k.w };
}
/** Node `n` reaching as far out as the furthest of the branches standing with it under its parent (the
 *  widest beside it, the tallest under or over it): where a floor of their branches goes out from, so
 *  one from a small node stands clear of a big one next to it, level with the big one's. */
function floorOf(n: Item, all: Item[]): Item {
  const p = n.parent ? all.find((i) => i.id === n.parent) : undefined;
  if (!p) return n;
  const way = mindWay(n, p), row = branchesOf(p, way, all);
  if (way === 'right') return { ...n, w: Math.max(...row.map((k) => k.x + k.w)) - n.x };
  if (way === 'down') return { ...n, h: Math.max(...row.map((k) => k.y + k.h)) - n.y };
  if (way === 'left') { const l = Math.min(...row.map((k) => k.x)); return { ...n, x: l, w: n.x + n.w - l }; }
  const t = Math.min(...row.map((k) => k.y));
  return { ...n, y: t, h: n.y + n.h - t };
}
/** Moves out the floor of branches beyond node `n` and those standing with it, with all that grows from
 *  them, where any of it is now closer than the gap to the furthest of them. */
function clearFloor(n: Item, all: Item[], block: (k: Item) => Item[]): void {
  const p = n.parent ? all.find((i) => i.id === n.parent) : undefined;
  if (!p) return;
  const way = mindWay(n, p), edge = floorOf(n, all);
  for (const k of branchesOf(p, way, all)) {
    for (const c of branchesOf(k, way, all)) {
      const at = outFrom(edge, way, c);
      const d = way === 'right' ? Math.max(0, at.x! - c.x) : way === 'left' ? Math.min(0, at.x! - c.x) : 0;
      const e = way === 'down' ? Math.max(0, at.y! - c.y) : way === 'up' ? Math.min(0, at.y! - c.y) : 0;
      if (d || e) block(c).forEach((m) => { m.x += d; m.y += e; });
    }
  }
}

/**
 * Where a new node of size w × h goes under `parent`: out from it the way its branches grow there
 * (beside it on its side of the centre, or under or over it), after everything branching from it that
 * way (level with it when it's the first), and further along still while that spot is taken by another
 * node. `toward` picks the way for a central topic, which has all four.
 */
export function childPlace(parent: Item, items: Item[], get: Get, w: number, h: number, toward?: Toward): Point {
  const way = wayFrom(parent, get, toward), a = axis(way);
  const kids = items.filter((i) => i.type === 'mind' && i.parent === parent.id && mindWay(i, parent) === way);
  const placed = kids.flatMap((k) => [k, ...descendants([k.id], items).map(get)]).filter((i): i is Item => !!i);
  const at = { x: 0, y: 0, ...outFrom(floorOf(parent, items), way, { w, h }) };
  at[a.at] = placed.length ? hi(placed, a) + a.gap : middle(parent, a) - (a.at === 'x' ? w : h) / 2;
  const nodes = items.filter((i) => i.type === 'mind'), g = a.gap / 2;
  for (let tries = 0; tries < 100; tries++) {
    const hit = a.at === 'y'
      ? nodes.find((n) => n.x < at.x + w && n.x + n.w > at.x && n.y < at.y + h + g && n.y + n.h + g > at.y)
      : nodes.find((n) => n.y < at.y + h && n.y + n.h > at.y && n.x < at.x + w + g && n.x + n.w + g > at.x);
    if (!hit) break;
    at[a.at] = hit[a.at] + hit[a.size] + a.gap;
  }
  return at;
}

/** Lines up `blocks` (each a node with what grows from it) one after another along the axis, centred on `on`. */
function lineUp(blocks: Item[][], a: Axis, on: number): void {
  const total = blocks.reduce((t, b) => t + hi(b, a) - lo(b, a), 0) + a.gap * (blocks.length - 1);
  let at = on - total / 2;
  for (const b of blocks) {
    const d = at - lo(b, a);
    shift(b, a, d);
    at += hi(b, a) - lo(b, a) + a.gap;
  }
}

/**
 * New places (by id) after laying out the branches along the way from node `id` to the centre: at
 * each node on the way, its branches growing the same way line up one after another (one under
 * another beside it, side by side under it), each with everything growing from it, centred on it.
 */
export function balance(id: string, items: Item[]): Map<string, Point> {
  const { all, byId, block } = working(items);
  let cur = byId.get(id);
  for (let guard = 0; cur?.parent && guard < 50; guard++) {
    const p: Item | undefined = byId.get(cur.parent);
    if (!p) break;
    const way = mindWay(cur, p), a = axis(way);
    lineUp(branchesOf(p, way, all).sort((m, n) => middle(m, a) - middle(n, a)).map(block), a, middle(p, a));
    cur = p;
  }
  return moved(items, byId);
}

/**
 * New places (by id, the new node's among them) for a new branch `id` (already among the items): its
 * parent's branches growing that way re-centre on the parent, with what grows from them; the parent
 * and every node further up the way to the centre stay put, and where that leaves too little room,
 * the branches of the same level from other parents move away (see clearCousins).
 */
export function addChild(id: string, items: Item[]): Map<string, Point> {
  const { all, byId, block } = working(items);
  const node = byId.get(id), p = node?.parent ? byId.get(node.parent) : undefined;
  if (!node || !p) return new Map();
  const way = mindWay(node, p), a = axis(way);
  lineUpNodes(branchesOf(p, way, all).sort((m, n) => middle(m, a) - middle(n, a)), a, middle(p, a), block);
  const ways = new Map(all.filter((k) => k.type === 'mind' && k.parent && byId.has(k.parent)).map((k) => [k.id, mindWay(k, byId.get(k.parent!)!)]));
  spreadGroups(p, all, block, ways);
  clearCousins(p, way, all, byId);
  return moved(items, byId);
}

/**
 * New places (by id, the new node's among them) for putting node `id` (already among the items) right
 * before or after node `from`, a branch of the same parent (above or below it beside its parent, to its
 * left or right under it), without `from` moving: the new node goes next to `from` and everything it
 * grows, lined up with it (on the side towards the parent), and the branches beyond it move out of the way.
 */
export function insertBeside(id: string, from: string, where: 'above' | 'below', items: Item[]): Map<string, Point> {
  const { all, byId, block } = working(items);
  const node = byId.get(id)!, start = byId.get(from)!, p = byId.get(start.parent!)!, dir = where === 'below' ? 1 : -1;
  const way = mindWay(start, p), a = axis(way), own = block(start);
  if (way === 'right') node.x = start.x;
  else if (way === 'left') node.x = start.x + start.w - node.w;
  else if (way === 'down') node.y = start.y;
  else node.y = start.y + start.h - node.h;
  node[a.at] = dir > 0 ? hi(own, a) + a.gap : lo(own, a) - a.gap - node[a.size];
  pushPast(start, node, (node[a.size] + a.gap) * dir, dir, all, byId, block, 1);
  clearCousins(p, way, all, byId);
  return moved(items, byId);
}

/**
 * New places (by id) for when node `id` has grown by dw × dh as it's typed in (a negative one when it
 * shrinks; it grows away from the centre, and downwards but over its parent, upwards; a central topic
 * rightwards and downwards): beside its parent, the branches below it follow; under (or over) its
 * parent, those after it move along. What grows from it keeps its gap from it, moving out with its far
 * edge, and stays centred on it. The rest of the map stays put.
 */
export function makeRoom(id: string, dw: number, dh: number, items: Item[]): Map<string, Point> {
  const { all, byId, block } = working(items);
  const node = byId.get(id), p = node?.parent ? byId.get(node.parent) : undefined;
  if (!node) return new Map();
  // Its own branches, each way they grow, with all that grows from them.
  for (const k of all.filter((i) => i.type === 'mind' && i.parent === node.id)) {
    const way = mindWay(k, node), d = {
      right: { x: dw, y: dh / 2 }, left: { x: p ? -dw : 0, y: dh / 2 }, down: { x: dw / 2, y: dh }, up: { x: dw / 2, y: p ? -dh : 0 },
    }[way];
    block(k).forEach((n) => { n.x += d.x; n.y += d.y; });
  }
  clearFloor(node, all, block);
  if (p) {
    const way = mindWay(node, p);
    pushPast(node, null, upright(way) ? dw : dh, 1, all, byId, block, 1);
    clearCousins(p, way, all, byId);
  }
  return moved(items, byId);
}

/** Moves by `by` the branches past `start` (after it for dir 1, before for -1) growing its way from
 *  its parent, with all that grows from them, and so on at each node up the way to the centre (for
 *  `levels` levels); `skip` stays put. */
function pushPast(start: Item, skip: Item | null, by: number, dir: 1 | -1, all: Item[], byId: Map<string, Item>, block: (k: Item) => Item[], levels = 50): void {
  for (let cur: Item | undefined = start, guard = 0; cur?.parent && guard < levels; guard++) {
    const p: Item = byId.get(cur.parent)!, way = mindWay(cur, p), a = axis(way), here: Item = cur;
    for (const k of branchesOf(p, way, all)) {
      if (k !== here && k !== skip && (middle(k, a) - middle(here, a)) * dir > 0) shift(block(k), a, by);
    }
    cur = p;
  }
}

/**
 * Keeps the branches of `p` growing that way, with all that grows from them, clear of the branches of
 * the same level from other parents in the same part of the map (to the right, left, below or above
 * the centre): those that now overlap them move away along the line, just as far as it takes, and the ones
 * beyond them in turn; the levels further in stay put.
 */
function clearCousins(p: Item, way: Way, all: Item[], byId: Map<string, Item>): void {
  const get = (k: string) => byId.get(k), a = axis(way);
  const block = (k: Item) => [k, ...descendants([k.id], all).map((d) => byId.get(d)!)];
  // The central topic and which part of the map this is in.
  const chain = (n: Item): Item[] => { const out = [n]; for (let c = n; c.parent && out.length < 50;) { const u = get(c.parent); if (!u) break; out.push(u); c = u; } return out; };
  const toRoot = chain(p), root = toRoot[toRoot.length - 1];
  if (root === p) return;
  const part = (n: Item) => { const c = chain(n); return c.length > 1 && c[c.length - 1] === root ? mindWay(c[c.length - 2], root) : null; };
  const level = toRoot.length, myPart = part(p);
  const kids = branchesOf(p, way, all);
  if (!kids.length) return;
  const mine = kids.flatMap(block);
  const others = all.filter((i) => i.type === 'mind' && i.parent && i.parent !== p.id && chain(i).length === level + 1 && part(i) === myPart).map(block);
  // Between the branches of different parents, a node's height at least (see cousinGap).
  const gap = (b: Item[], from: string) => (b[0].parent !== from ? Math.max(a.gap, b[0].h) : a.gap);
  let edge = hi(mine, a), from = p.id;
  for (const b of others.filter((b) => middle(get(b[0].parent!)!, a) >= middle(p, a)).sort((m, n) => lo(m, a) - lo(n, a))) {
    const need = edge + gap(b, from) - lo(b, a);
    if (need > 0) shift(b, a, need);
    edge = Math.max(edge, hi(b, a));
    from = b[0].parent!;
  }
  edge = lo(mine, a);
  from = p.id;
  for (const b of others.filter((b) => middle(get(b[0].parent!)!, a) < middle(p, a)).sort((m, n) => hi(n, a) - hi(m, a))) {
    const need = hi(b, a) + gap(b, from) - edge;
    if (need > 0) shift(b, a, -need);
    edge = Math.min(edge, lo(b, a));
    from = b[0].parent!;
  }
}

/** Lays out afresh what grows from `n`, growing `way`: its branches out from it, lined up and centred
 *  on it, each laid out the same way in turn (in the order they stood). */
function layOut(n: Item, way: Way, all: Item[], block: (k: Item) => Item[]): void {
  const a = axis(way), across = a.at === 'x' ? 'y' : 'x';
  const kids = all.filter((k) => k.type === 'mind' && k.parent === n.id).sort((m, q) => m[across] - q[across] || m[a.at] - q[a.at]);
  for (const k of kids) {
    Object.assign(k, outFrom(floorOf(n, all), way, k));
    k[a.at] = n[a.at];
    layOut(k, way, all, block);
  }
  lineUp(kids.map(block), a, middle(n, a));
}

/**
 * New places (by id) for "Авторасположение" on node `id`: everything growing from it laid out afresh
 * as a mind map lays it out, however it's been dragged about. Each way its branches grow (each side
 * of a central topic, under, over), they go out from it the usual gap off it (off the furthest of
 * their level's, as a floor does), one after another in the order they stand, the gap apart whatever
 * grows from them, centred on it; and so on down. What grows from neighbours moves along out of each
 * other's way, the neighbours' gaps staying even. The node itself stays put.
 */
export function tidyBranches(id: string, items: Item[]): Map<string, Point> {
  const { all, byId, block } = working(items);
  const n = byId.get(id);
  if (!n) return new Map();
  // Each node keeps the way it grows from its parent (its side of it, under, over), as it was before.
  const ways = new Map(all.filter((k) => k.type === 'mind' && k.parent && byId.has(k.parent)).map((k) => [k.id, mindWay(k, byId.get(k.parent!)!)]));
  tidyFrom(n, all, block, ways);
  spreadGroups(n, all, block, ways);
  return moved(items, byId);
}

/** The least gap between the branches of two neighbours (cousins): a node's height, so the groups
 *  stand a little apart. */
const cousinGap = (a: Axis, m: Item, n: Item) => Math.max(a.gap, Math.min(m.h, n.h));

/** Level by level down from `n`: where the branches of two neighbours would come closer than
 *  cousinGap, the later one's (with what grows from them) moves along out of the way, the neighbours
 *  themselves staying put. Each level is measured by its nodes alone (what grows from them is seen to
 *  a level further down). */
function spreadGroups(n: Item, all: Item[], block: (k: Item) => Item[], ways: Map<string, Way>): void {
  for (let level = [n], guard = 0; level.length && guard < 50; guard++) {
    for (const way of ['right', 'left', 'down', 'up'] as const) {
      const a = axis(way);
      let last: Item | null = null;
      for (const p of [...level].sort((m, q) => middle(m, a) - middle(q, a))) {
        const kids = all.filter((k) => k.type === 'mind' && k.parent === p.id && ways.get(k.id) === way).sort((m, q) => m[a.at] - q[a.at]);
        if (!kids.length) continue;
        if (last) {
          const need = last[a.at] + last[a.size] + cousinGap(a, last, kids[0]) - kids[0][a.at];
          if (need > 0) shift(kids.flatMap(block), a, need);
        }
        last = kids[kids.length - 1];
      }
    }
    const ids = new Set(level.map((k) => k.id));
    level = all.filter((k) => k.type === 'mind' && k.parent && ids.has(k.parent));
  }
}

/** Lines up nodes one after another along the axis, the gap apart by their own sizes, centred on
 *  `on`, each with what grows from it. */
function lineUpNodes(kids: Item[], a: Axis, on: number, block: (k: Item) => Item[]): void {
  let at = on - (kids.reduce((t, k) => t + k[a.size], 0) + a.gap * (kids.length - 1)) / 2;
  for (const k of kids) { shift(block(k), a, at - k[a.at]); at += k[a.size] + a.gap; }
}
function tidyFrom(n: Item, all: Item[], block: (k: Item) => Item[], ways: Map<string, Way>): void {
  const kids = all.filter((k) => k.type === 'mind' && k.parent === n.id);
  for (const way of ['right', 'left', 'down', 'up'] as const) {
    const a = axis(way), row = kids.filter((k) => ways.get(k.id) === way).sort((m, q) => middle(m, a) - middle(q, a));
    // Out from it first, all of the row, so a floor goes out from the widest; then each one's own.
    for (const k of row) { const d = outFrom(floorOf(n, all), way, k); block(k).forEach((m) => { m.x += (d.x ?? k.x) - k.x; m.y += (d.y ?? k.y) - k.y; }); }
    lineUp(row.map((k) => [k]), a, middle(n, a));
    for (const k of row) tidyFrom(k, all, block, ways);
  }
}

/** The rounded place of every item the working copies moved. */
function moved(items: Item[], byId: Map<string, Item>): Map<string, Point> {
  const out = new Map<string, Point>();
  for (const i of items) {
    const n = byId.get(i.id)!, x = Math.round(n.x), y = Math.round(n.y);
    if (x !== i.x || y !== i.y) out.set(i.id, { x, y });
  }
  return out;
}

/** The next branch of the same parent growing the same way after node `id` (one under another
 *  beside it, left to right under or over it), or before it for dir -1, round to the first (or last)
 *  past the end; null when it has none. */
export function siblingOf(id: string, items: Item[], dir: 1 | -1 = 1): string | null {
  const it = items.find((i) => i.id === id), p = it?.parent ? items.find((i) => i.id === it.parent) : undefined;
  if (!it || !p) return null;
  const way = mindWay(it, p), a = axis(way);
  const row = branchesOf(p, way, items).sort((m, n) => middle(m, a) - middle(n, a));
  if (row.length < 2) return null;
  return row[(row.indexOf(it) + dir + row.length) % row.length].id;
}

/** Whether node `id` can be moved to hang from `to`: another node, not one growing from it. */
export function canMoveTo(id: string, to: string, items: Item[]): boolean {
  const it = items.find((i) => i.id === id), target = items.find((i) => i.id === to);
  return !!it?.parent && target?.type === 'mind' && id !== to && it.parent !== to && !descendants([id], items).includes(to);
}

/**
 * Where everything goes (and which nodes now grow down or up) when node `id`, with all that grows from
 * it, moves to hang from `to`: after the branches `to` has growing its way (`toward` picks the way for
 * a central topic), the whole branch mirrored if it changes sides, laid out afresh if it turns between
 * beside, under and over, and the branches round both its old and new place re-centred.
 */
export function moveBranch(id: string, to: string, items: Item[], toward: Toward): Map<string, Point & { down?: boolean; up?: boolean }> {
  const { all, byId, block } = working(items);
  const node = byId.get(id)!, target = byId.get(to)!, old = byId.get(node.parent!)!, get = (k: string) => byId.get(k);
  const sub = descendants([id], all).map((k) => byId.get(k)!);
  const moving = new Set([id, ...sub.map((d) => d.id)]);
  const oldWay = mindWay(node, old), way = wayFrom(target, get, toward);
  const at = childPlace(target, all.filter((i) => !moving.has(i.id)), get, node.w, node.h, toward);
  if (oldWay !== way && (upright(oldWay) || upright(way))) {
    // Turned between beside, under and over: everything in it grows the new way, laid out afresh.
    for (const n of [node, ...sub]) Object.assign(n, { down: way === 'down' || undefined, up: way === 'up' || undefined });
    Object.assign(node, at, { parent: to });
    layOut(node, way, all, block);
  } else {
    // Over to the other side: the branch mirrored about its node.
    const cx = node.x + node.w / 2, flip = way !== oldWay, dx = at.x - node.x, dy = at.y - node.y;
    for (const d of sub) {
      if (upright(way)) d.x += dx;
      else { const rel = d.x + d.w / 2 - cx; d.x = at.x + node.w / 2 + (flip ? -rel : rel) - d.w / 2; }
      d.y += dy;
    }
    Object.assign(node, at, { parent: to });
  }
  // Re-centre round the new place, then round the old one if anything is left there.
  for (const k of [id, all.find((i) => i.parent === old.id && i.type === 'mind' && mindWay(i, old) === oldWay && !moving.has(i.id))?.id]) {
    if (k) balance(k, all).forEach((pt, n) => Object.assign(byId.get(n)!, pt));
  }
  const out = new Map<string, Point & { down?: boolean; up?: boolean }>();
  for (const i of items) {
    const n = byId.get(i.id)!, x = Math.round(n.x), y = Math.round(n.y);
    if (x !== i.x || y !== i.y || !!n.down !== !!i.down || !!n.up !== !!i.up) out.set(i.id, { x, y, down: n.down, up: n.up });
  }
  return out;
}

/** How far the buttons' centres sit from the node, in screen pixels: their radius and 2 more. */
const BUTTON_OFF = 11;

/**
 * The buttons round a selected node: "+" on its far side for a branch of its own (the node holding
 * still and its branches centred on it, so it can be clicked again and again), and once it has
 * branches, past that a chevron pointing back at it, folding them away (all that grows from them; the
 * count of what's hidden then stands there, and a click on it unfolds them, see foldBadge); "+" before
 * and after it (above and below beside its parent, left and right under it) for
 * a parallel branch; and on the side of its parent a circle with an arrow, dragged onto another node to
 * move the branch there. The central topic has "+" on all four sides: right, left, below (a branch led
 * down) and above (led up), each way with a chevron of its own, folding that way on its own.
 */
export type MindButton = 'child' | 'left' | 'down' | 'up' | 'fold' | 'above' | 'below' | 'move';
export type MindButtonAt = Point & { kind: MindButton; r: number; way?: Way };
/** A button's name among a node's: its kind, and for a chevron its way too (a central topic has one each way). */
export const buttonKey = (b: { kind: MindButton; way?: Way }): string => (b.kind === 'fold' ? `fold:${b.way}` : b.kind);

/** How far past the "+" for a branch the chevron (or the count) sits, in screen pixels: a button across and 4 more. */
const FOLD_OFF = 22;

/** The ways a node's branches are folded away: a central topic's each on its own, another's all at once (its one way). */
export function foldedWays(it: Item, up: Item | undefined): Way[] {
  if (!up) return it.foldedWays ?? [];
  return it.collapsed ? [mindWay(it, up)] : [];
}

/** The ways a node has branches growing, of these items. */
export function branchWays(it: Item, items: Item[]): Way[] {
  const out = new Set<Way>();
  for (const k of items) if (k.type === 'mind' && k.parent === it.id) out.add(mindWay(k, it));
  return [...out];
}

/** What a node's folding hides, by way: its branches growing each way folded, and all that grows from them. */
export function foldedAway(it: Item, items: Item[], get: Get): Map<Way, string[]> {
  const up = it.parent ? get(it.parent) : undefined, out = new Map<Way, string[]>();
  for (const way of foldedWays(it, up)) {
    const kids = items.filter((k) => k.type === 'mind' && k.parent === it.id && (up || mindWay(k, it) === way)).map((k) => k.id);
    out.set(way, [...kids, ...descendants(kids, items)]);
  }
  return out;
}

/** The change folding a node's branches growing `way` away makes (all of them, but a central topic's), or unfolding them. */
export function folding(it: Item, way: Way, on: boolean): Partial<Item> {
  if (it.parent) return { collapsed: on || undefined };
  const rest = (it.foldedWays ?? []).filter((w) => w !== way), ways = on ? [...rest, way] : rest;
  return { foldedWays: ways.length ? ways : undefined };
}

/** A point `off` screen pixels out from a node's side facing `way`, halfway along it. */
function spot(it: Item, way: Way, off: number, zoom: number): Point {
  const d = off / zoom;
  if (upright(way)) return { x: it.x + it.w / 2, y: way === 'down' ? it.y + it.h + d : it.y - d };
  return { x: way === 'right' ? it.x + it.w + d : it.x - d, y: it.y + it.h / 2 };
}

/** Where each of a node's buttons is and its radius, sized in screen pixels whatever the zoom; `ways`:
 *  those it has branches growing (folded ones too), `fresh`: a way that's only just got them, with no
 *  chevron yet. A chevron says the way it's on. */
export function mindButtons(it: Item, get: Get, zoom: number, ways: Way[] = [], fresh?: Way): MindButtonAt[] {
  const up = it.parent ? get(it.parent) : undefined, folded = foldedWays(it, up);
  const off = BUTTON_OFF / zoom, r = 9 / zoom, cx = it.x + it.w / 2, cy = it.y + it.h / 2;
  // The "+" for a branch growing that way, and past it the chevron once there are some.
  const own = (kind: MindButton, way: Way): MindButtonAt[] => [
    { kind, ...spot(it, way, BUTTON_OFF, zoom), r },
    ...((up ? ways.length : ways.includes(way)) && !folded.includes(way) && way !== fresh ? [{ kind: 'fold' as const, ...spot(it, way, BUTTON_OFF + FOLD_OFF, zoom), r, way }] : []),
  ];
  if (!up) return [...own('child', 'right'), ...own('left', 'left'), ...own('down', 'down'), ...own('up', 'up')];
  const way = mindWay(it, up);
  if (upright(way)) {
    return [
      ...own('child', way),
      { kind: 'above', x: it.x - off, y: cy, r },
      { kind: 'below', x: it.x + it.w + off, y: cy, r },
      { kind: 'move', x: cx, y: way === 'down' ? it.y - off : it.y + it.h + off, r },
    ];
  }
  const right = way === 'right';
  return [
    ...own('child', way),
    { kind: 'above', x: cx, y: it.y - off, r },
    { kind: 'below', x: cx, y: it.y + it.h + off, r },
    { kind: 'move', x: right ? it.x - off : it.x + it.w + off, y: cy, r },
  ];
}

/** The count of what a node's folding hides that way, always in sight: a pill as tall as a button and as
 *  wide as the number needs, its near end where the "+" for a branch is, or, as far as `out` (0…1) while
 *  the node's buttons show, where the chevron was (so a click there again unfolds it), a stub of branch
 *  leading to it (its middle, width and height, in screen pixels whatever the zoom). */
export function foldBadge(it: Item, way: Way, zoom: number, count: number, out = 0): Point & { w: number; h: number } {
  const w = Math.max(18, String(count).length * 6 + 10), h = 18, along = upright(way) ? h : w;
  // 4 off the node where it rests, out to the chevron's place.
  return { ...spot(it, way, BUTTON_OFF + 2 + (FOLD_OFF - 2) * out + (along - h) / 2, zoom), w: w / zoom, h: h / zoom };
}

/** The connecting branch from a parent to a child: from the parent's facing side to the child's,
 *  leaving and arriving level (or, under or over it, upright). */
export function branchCurve(parent: Item, child: Item): [Point, Point, Point, Point] {
  if (child.down || child.up) {
    const a = { x: parent.x + parent.w / 2, y: child.up ? parent.y : parent.y + parent.h };
    const b = { x: child.x + child.w / 2, y: child.up ? child.y + child.h : child.y };
    const dy = (b.y - a.y) / 2;
    return [a, { x: a.x, y: a.y + dy }, { x: b.x, y: b.y - dy }, b];
  }
  const side = mindSide(child, parent);
  const a = { x: side > 0 ? parent.x + parent.w : parent.x, y: parent.y + parent.h / 2 };
  const b = { x: side > 0 ? child.x : child.x + child.w, y: child.y + child.h / 2 };
  const dx = (b.x - a.x) / 2;
  return [a, { x: a.x + dx, y: a.y }, { x: b.x - dx, y: b.y }, b];
}

/** Whether the branch from `parent` to `child` runs through the rectangle anywhere (tried at 24 points along it). */
export function branchCrosses(parent: Item, child: Item, r: { x: number; y: number; w: number; h: number }): boolean {
  const [a, b, c, d] = branchCurve(parent, child);
  for (let i = 0; i <= 24; i++) {
    const t = i / 24, u = 1 - t;
    const x = u * u * u * a.x + 3 * u * u * t * b.x + 3 * u * t * t * c.x + t * t * t * d.x;
    const y = u * u * u * a.y + 3 * u * u * t * b.y + 3 * u * t * t * c.y + t * t * t * d.y;
    if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) return true;
  }
  return false;
}
