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

/** Which way a node grows from its parent: to the right, to the left, or down (a branch led down from
 *  the central topic, and all that grows from it, has `down`). */
export type Way = 'right' | 'left' | 'down';
export const mindWay = (it: Item, parent: Item): Way => (it.down ? 'down' : mindSide(it, parent) > 0 ? 'right' : 'left');

/** Gaps: from a parent to its branches beside it, and between those (one under another); from a
 *  parent to its branches under it, and between those (side by side). */
export const MIND_GAP_X = 60, MIND_GAP_Y = 16, MIND_GAP_DOWN = 48, MIND_GAP_ROW = 24;

/** The axis branches growing that way line up along (y beside their parent, x under it), their size
 *  along it and the gap between them. */
const axis = (way: Way) => (way === 'down' ? { at: 'x', size: 'w', gap: MIND_GAP_ROW } as const : { at: 'y', size: 'h', gap: MIND_GAP_Y } as const);
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
const wayFrom = (parent: Item, get: Get, toward?: 1 | -1 | 'down'): Way => {
  const up = parent.parent ? get(parent.parent) : undefined;
  return up ? mindWay(parent, up) : toward === 'down' ? 'down' : toward === -1 ? 'left' : 'right';
};

/**
 * Where a new node of size w × h goes under `parent`: out from it the way its branches grow there
 * (beside it on its side of the centre, or under it), after everything branching from it that way
 * (level with it when it's the first), and further along still while that spot is taken by another
 * node. `toward` picks the way for a central topic, which has all three.
 */
export function childPlace(parent: Item, items: Item[], get: Get, w: number, h: number, toward?: 1 | -1 | 'down'): Point {
  const way = wayFrom(parent, get, toward), a = axis(way);
  const kids = items.filter((i) => i.type === 'mind' && i.parent === parent.id && mindWay(i, parent) === way);
  const placed = kids.flatMap((k) => [k, ...descendants([k.id], items).map(get)]).filter((i): i is Item => !!i);
  const at = { x: 0, y: 0 };
  if (way === 'down') at.y = parent.y + parent.h + MIND_GAP_DOWN;
  else at.x = way === 'right' ? parent.x + parent.w + MIND_GAP_X : parent.x - MIND_GAP_X - w;
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
  lineUp(branchesOf(p, way, all).sort((m, n) => middle(m, a) - middle(n, a)).map(block), a, middle(p, a));
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
  else node.y = start.y;
  node[a.at] = dir > 0 ? hi(own, a) + a.gap : lo(own, a) - a.gap - node[a.size];
  pushPast(start, node, (node[a.size] + a.gap) * dir, dir, all, byId, block, 1);
  clearCousins(p, way, all, byId);
  return moved(items, byId);
}

/**
 * New places (by id) for when node `id` has grown by dw × dh as it's typed in (a negative one when it
 * shrinks; it grows away from the centre and downwards): beside its parent, the branches below it
 * follow; under its parent, those after it move along, and what grows from it moves down with its
 * lower edge. The rest of the map stays put.
 */
export function makeRoom(id: string, dw: number, dh: number, items: Item[]): Map<string, Point> {
  const { all, byId, block } = working(items);
  const node = byId.get(id), p = node?.parent ? byId.get(node.parent) : undefined;
  if (node && p) {
    const way = mindWay(node, p);
    if (way === 'down') {
      pushPast(node, null, dw, 1, all, byId, block, 1);
      block(node).slice(1).forEach((n) => { n.y += dh; });
    } else pushPast(node, null, dh, 1, all, byId, block, 1);
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
 * the same level from other parents in the same part of the map (to the right, left or below the
 * centre): those that now overlap them move away along the line, just as far as it takes, and the ones
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
  let edge = hi(mine, a);
  for (const b of others.filter((b) => middle(get(b[0].parent!)!, a) >= middle(p, a)).sort((m, n) => lo(m, a) - lo(n, a))) {
    const need = edge + a.gap - lo(b, a);
    if (need > 0) shift(b, a, need);
    edge = Math.max(edge, hi(b, a));
  }
  edge = lo(mine, a);
  for (const b of others.filter((b) => middle(get(b[0].parent!)!, a) < middle(p, a)).sort((m, n) => hi(n, a) - hi(m, a))) {
    const need = hi(b, a) + a.gap - edge;
    if (need > 0) shift(b, a, -need);
    edge = Math.min(edge, lo(b, a));
  }
}

/** Lays out afresh what grows from `n`, growing `way`: its branches out from it, lined up and centred
 *  on it, each laid out the same way in turn (in the order they stood). */
function layOut(n: Item, way: Way, all: Item[], block: (k: Item) => Item[]): void {
  const a = axis(way), across = a.at === 'x' ? 'y' : 'x';
  const kids = all.filter((k) => k.type === 'mind' && k.parent === n.id).sort((m, q) => m[across] - q[across] || m[a.at] - q[a.at]);
  for (const k of kids) {
    if (way === 'down') k.y = n.y + n.h + MIND_GAP_DOWN;
    else k.x = way === 'right' ? n.x + n.w + MIND_GAP_X : n.x - MIND_GAP_X - k.w;
    k[a.at] = n[a.at];
    layOut(k, way, all, block);
  }
  lineUp(kids.map(block), a, middle(n, a));
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

/** Whether node `id` can be moved to hang from `to`: another node, not one growing from it. */
export function canMoveTo(id: string, to: string, items: Item[]): boolean {
  const it = items.find((i) => i.id === id), target = items.find((i) => i.id === to);
  return !!it?.parent && target?.type === 'mind' && id !== to && it.parent !== to && !descendants([id], items).includes(to);
}

/**
 * Where everything goes (and which nodes now grow down) when node `id`, with all that grows from it,
 * moves to hang from `to`: after the branches `to` has growing its way (`toward` picks the way for a
 * central topic), the whole branch mirrored if it changes sides, laid out afresh if it turns between
 * beside and under, and the branches round both its old and new place re-centred.
 */
export function moveBranch(id: string, to: string, items: Item[], toward: 1 | -1 | 'down'): Map<string, Point & { down?: boolean }> {
  const { all, byId, block } = working(items);
  const node = byId.get(id)!, target = byId.get(to)!, old = byId.get(node.parent!)!, get = (k: string) => byId.get(k);
  const sub = descendants([id], all).map((k) => byId.get(k)!);
  const moving = new Set([id, ...sub.map((d) => d.id)]);
  const oldWay = mindWay(node, old), way = wayFrom(target, get, toward);
  const at = childPlace(target, all.filter((i) => !moving.has(i.id)), get, node.w, node.h, toward);
  if ((oldWay === 'down') !== (way === 'down')) {
    // Turned between beside and under: everything in it grows the new way, laid out afresh.
    for (const n of [node, ...sub]) n.down = way === 'down' ? true : undefined;
    Object.assign(node, at, { parent: to });
    layOut(node, way, all, block);
  } else {
    // Over to the other side: the branch mirrored about its node.
    const cx = node.x + node.w / 2, flip = way !== oldWay && way !== 'down', dx = at.x - node.x, dy = at.y - node.y;
    for (const d of sub) {
      if (way === 'down') d.x += dx;
      else { const rel = d.x + d.w / 2 - cx; d.x = at.x + node.w / 2 + (flip ? -rel : rel) - d.w / 2; }
      d.y += dy;
    }
    Object.assign(node, at, { parent: to });
  }
  // Re-centre round the new place, then round the old one if anything is left there.
  for (const k of [id, all.find((i) => i.parent === old.id && i.type === 'mind' && mindWay(i, old) === oldWay && !moving.has(i.id))?.id]) {
    if (k) balance(k, all).forEach((pt, n) => Object.assign(byId.get(n)!, pt));
  }
  const out = new Map<string, Point & { down?: boolean }>();
  for (const i of items) {
    const n = byId.get(i.id)!, x = Math.round(n.x), y = Math.round(n.y);
    if (x !== i.x || y !== i.y || !!n.down !== !!i.down) out.set(i.id, { x, y, down: n.down });
  }
  return out;
}

/** How far the buttons' centres sit from the node, in screen pixels: their radius and 2 more. */
const BUTTON_OFF = 11;

/**
 * The buttons round a selected node: "+" on its far side for a branch of its own; "+" before and
 * after it (above and below beside its parent, left and right under it) for a parallel branch; and
 * on the side of its parent a circle with an arrow, dragged onto another node to move the branch
 * there. The central topic has "+" to the right and "+" below (a branch led down).
 */
export type MindButton = 'child' | 'down' | 'above' | 'below' | 'move';

/** Where each of a node's buttons is and its radius, sized in screen pixels whatever the zoom. */
export function mindButtons(it: Item, get: Get, zoom: number): Array<Point & { kind: MindButton; r: number }> {
  const up = it.parent ? get(it.parent) : undefined;
  const off = BUTTON_OFF / zoom, r = 9 / zoom, cx = it.x + it.w / 2, cy = it.y + it.h / 2;
  if (!up) return [{ kind: 'child', x: it.x + it.w + off, y: cy, r }, { kind: 'down', x: cx, y: it.y + it.h + off, r }];
  const way = mindWay(it, up);
  if (way === 'down') {
    return [
      { kind: 'child', x: cx, y: it.y + it.h + off, r },
      { kind: 'above', x: it.x - off, y: cy, r },
      { kind: 'below', x: it.x + it.w + off, y: cy, r },
      { kind: 'move', x: cx, y: it.y - off, r },
    ];
  }
  const right = way === 'right';
  return [
    { kind: 'child', x: right ? it.x + it.w + off : it.x - off, y: cy, r },
    { kind: 'above', x: cx, y: it.y - off, r },
    { kind: 'below', x: cx, y: it.y + it.h + off, r },
    { kind: 'move', x: right ? it.x - off : it.x + it.w + off, y: cy, r },
  ];
}

/** The connecting branch from a parent to a child: from the parent's facing side to the child's,
 *  leaving and arriving level (or, under it, upright). */
export function branchCurve(parent: Item, child: Item): [Point, Point, Point, Point] {
  if (child.down) {
    const a = { x: parent.x + parent.w / 2, y: parent.y + parent.h }, b = { x: child.x + child.w / 2, y: child.y };
    const dy = (b.y - a.y) / 2;
    return [a, { x: a.x, y: a.y + dy }, { x: b.x, y: b.y - dy }, b];
  }
  const side = mindSide(child, parent);
  const a = { x: side > 0 ? parent.x + parent.w : parent.x, y: parent.y + parent.h / 2 };
  const b = { x: side > 0 ? child.x : child.x + child.w, y: child.y + child.h / 2 };
  const dx = (b.x - a.x) / 2;
  return [a, { x: a.x + dx, y: a.y }, { x: b.x - dx, y: b.y }, b];
}
