import type { Item } from './types';
import type { Point } from '../canvas/geometry';

/**
 * Mind maps, as in MindMeister: a central topic (a 'mind' item without a parent) and nodes that
 * branch from it, each pointing at its parent. Branches are blue unless coloured otherwise.
 */
export const MIND_COLOR = '#3E7BFA';

/** Colours a node can be given; what grows from it takes its colour unless given its own. */
export const MIND_PALETTE = ['#3E7BFA', '#0C8599', '#30A46C', '#E8892B', '#E5484D', '#D6409F', '#8E4EC6', '#5B6170'];

/** A node's colour: its own, or that of the nearest node it grows from that has one, or the blue. */
export function mindColor(it: Item, get: (id: string) => Item | undefined): string {
  let cur: Item | undefined = it;
  for (let i = 0; cur && i < 50; i++) {
    if (cur.color?.startsWith('#')) return cur.color;
    cur = cur.parent ? get(cur.parent) : undefined;
  }
  return MIND_COLOR;
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

/** Which way a node grows from its parent: 1 to the right, -1 to the left. */
export const mindSide = (it: Item, parent: Item): 1 | -1 => (it.x + it.w / 2 >= parent.x + parent.w / 2 ? 1 : -1);

/** Gaps between a parent and its children, and between siblings. */
export const MIND_GAP_X = 60, MIND_GAP_Y = 16;

/**
 * Where a new node of size w × h goes under `parent`: beside it, on the parent's own side of the
 * centre, below everything branching from the parent there (level with the parent when it's the
 * first), and further down still while that spot is taken by another node. `toward` picks the side
 * of a central topic, which has both.
 */
export function childPlace(parent: Item, items: Item[], get: Get, w: number, h: number, toward?: 1 | -1): Point {
  const up = parent.parent ? get(parent.parent) : undefined;
  const side = up ? mindSide(parent, up) : toward ?? 1;
  const x = side > 0 ? parent.x + parent.w + MIND_GAP_X : parent.x - MIND_GAP_X - w;
  const kids = items.filter((i) => i.type === 'mind' && i.parent === parent.id && mindSide(i, parent) === side);
  const below = kids.flatMap((k) => [k, ...descendants([k.id], items).map(get)]).filter((i): i is Item => !!i);
  let y = below.length ? Math.max(...below.map((k) => k.y + k.h)) + MIND_GAP_Y : parent.y + parent.h / 2 - h / 2;
  const nodes = items.filter((i) => i.type === 'mind');
  for (let tries = 0; tries < 100; tries++) {
    const hit = nodes.find((n) => n.x < x + w && n.x + n.w > x && n.y < y + h + MIND_GAP_Y / 2 && n.y + n.h + MIND_GAP_Y / 2 > y);
    if (!hit) break;
    y = hit.y + hit.h + MIND_GAP_Y;
  }
  return { x, y };
}

/**
 * New y positions (by id) after laying out the branches along the way from node `id` to the centre:
 * at each node on the way, its branches on that side stack one under another, each with everything
 * growing from it, centred on the node.
 */
export function balance(id: string, items: Item[]): Map<string, number> {
  const all = items.map((i) => ({ ...i })), byId = new Map(all.map((i) => [i.id, i]));
  let cur = byId.get(id);
  for (let guard = 0; cur?.parent && guard < 50; guard++) {
    const p: Item | undefined = byId.get(cur.parent);
    if (!p) break;
    const side = mindSide(cur, p), mid = (i: Item) => i.y + i.h / 2;
    const kids = all.filter((i) => i.type === 'mind' && i.parent === p.id && mindSide(i, p) === side).sort((a, b) => mid(a) - mid(b));
    const blocks = kids.map((k) => {
      const sub = [k, ...descendants([k.id], all).map((d) => byId.get(d)!)];
      return { sub, top: Math.min(...sub.map((n) => n.y)), bottom: Math.max(...sub.map((n) => n.y + n.h)) };
    });
    const total = blocks.reduce((t, b) => t + b.bottom - b.top, 0) + MIND_GAP_Y * (blocks.length - 1);
    let y = mid(p) - total / 2;
    for (const b of blocks) {
      const dy = y - b.top;
      b.sub.forEach((n) => { n.y += dy; });
      y += b.bottom - b.top + MIND_GAP_Y;
    }
    cur = p;
  }
  const out = new Map<string, number>();
  for (const i of items) {
    const y = Math.round(byId.get(i.id)!.y);
    if (y !== i.y) out.set(i.id, y);
  }
  return out;
}

/** Whether node `id` can be moved to hang from `to`: another node, not one growing from it. */
export function canMoveTo(id: string, to: string, items: Item[]): boolean {
  const it = items.find((i) => i.id === id), target = items.find((i) => i.id === to);
  return !!it?.parent && target?.type === 'mind' && id !== to && it.parent !== to && !descendants([id], items).includes(to);
}

/**
 * Where everything goes when node `id`, with all that grows from it, moves to hang from `to`: after
 * the branches `to` has on its side (`toward` picks the side of a central topic), the whole branch
 * mirrored if it changes sides, and the branches round both its old and new place re-centred.
 */
export function moveBranch(id: string, to: string, items: Item[], toward: 1 | -1): Map<string, Point> {
  const all = items.map((i) => ({ ...i })), byId = new Map(all.map((i) => [i.id, i]));
  const node = byId.get(id)!, target = byId.get(to)!, old = byId.get(node.parent!)!, get = (k: string) => byId.get(k);
  const sub = descendants([id], all).map((k) => byId.get(k)!);
  const moving = new Set([id, ...sub.map((d) => d.id)]);
  const oldSide = mindSide(node, old), up = target.parent ? byId.get(target.parent) : undefined;
  const side = up ? mindSide(target, up) : toward;
  const at = childPlace(target, all.filter((i) => !moving.has(i.id)), get, node.w, node.h, side);
  const cx = node.x + node.w / 2, flip = side !== oldSide, dy = at.y - node.y;
  for (const d of sub) {
    const rel = d.x + d.w / 2 - cx;
    d.x = at.x + node.w / 2 + (flip ? -rel : rel) - d.w / 2;
    d.y += dy;
  }
  Object.assign(node, at, { parent: to });
  // Re-centre round the new place, then round the old one if anything is left there.
  for (const k of [id, all.find((i) => i.parent === old.id && i.type === 'mind' && mindSide(i, old) === oldSide && !moving.has(i.id))?.id]) {
    if (k) balance(k, all).forEach((y, n) => { byId.get(n)!.y = y; });
  }
  const out = new Map<string, Point>();
  for (const i of items) {
    const n = byId.get(i.id)!, x = Math.round(n.x), y = Math.round(n.y);
    if (x !== i.x || y !== i.y) out.set(i.id, { x, y });
  }
  return out;
}

/** How far the buttons' centres sit from the node, in screen pixels: their radius and 2 more. */
const BUTTON_OFF = 11;

/**
 * The buttons round a selected node: "+" on its far side for a branch of its own, "+" above and
 * below for a parallel branch before or after it, and on the side of its parent a circle with an
 * arrow, dragged onto another node to move the branch there. The central topic has only the first.
 */
export type MindButton = 'child' | 'above' | 'below' | 'move';

/** Where each of a node's buttons is and its radius, sized in screen pixels whatever the zoom. */
export function mindButtons(it: Item, get: Get, zoom: number): Array<Point & { kind: MindButton; r: number }> {
  const up = it.parent ? get(it.parent) : undefined, side = up ? mindSide(it, up) : 1;
  const off = BUTTON_OFF / zoom, r = 9 / zoom, mid = it.y + it.h / 2, far = side > 0 ? it.x + it.w + off : it.x - off;
  const child = { kind: 'child' as const, x: far, y: mid, r };
  if (!up) return [child];
  return [
    child,
    { kind: 'above', x: it.x + it.w / 2, y: it.y - off, r },
    { kind: 'below', x: it.x + it.w / 2, y: it.y + it.h + off, r },
    { kind: 'move', x: side > 0 ? it.x - off : it.x + it.w + off, y: mid, r },
  ];
}

/** The connecting branch from a parent to a child: from the parent's facing side to the child's,
 *  leaving and arriving level. */
export function branchCurve(parent: Item, child: Item): [Point, Point, Point, Point] {
  const side = mindSide(child, parent);
  const a = { x: side > 0 ? parent.x + parent.w : parent.x, y: parent.y + parent.h / 2 };
  const b = { x: side > 0 ? child.x : child.x + child.w, y: child.y + child.h / 2 };
  const dx = (b.x - a.x) / 2;
  return [a, { x: a.x + dx, y: a.y }, { x: b.x - dx, y: b.y }, b];
}
