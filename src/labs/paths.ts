import type { Editor } from '../editor/editor';
import type { Item } from '../model/types';
import { flattenPath, pathNodes, samePoint, type PathNode, type Point } from '../canvas/geometry';

/**
 * Paths drawn with "Перо" (src/labs): a figure (a polygon with corners of its own) or a line (an ink
 * line through its corners), each corner sharp or smooth, with handles for the curves either side.
 * Their nodes are changed in "правка узлов": a double click on one shows them all, each corner and
 * handle dragged (a handle turning its pair along, but with Alt), a double click on a corner making it
 * sharp or smooth; Esc, Enter or a click elsewhere leaves it.
 */

/** Whether an item is a path whose nodes can be changed (not turned: its nodes are on the board). */
export const editablePath = (it?: Item | null): it is Item => !!it && !it.rot && !it.host && !it.inst
  && ((it.type === 'polygon' && !!it.vx && !it.shape) || (it.type === 'ink' && !!it.sharp));

/** A path's nodes on the board. */
export function nodesOf(it: Item): PathNode[] {
  if (it.type === 'polygon') return pathNodes(it.vx ?? [], it.vh, (x, y) => ({ x: it.x + x * it.w, y: it.y + y * it.h }));
  const k = it.w / (it.iw || it.w || 1);
  return pathNodes(it.pts ?? [], it.ph, (x, y) => ({ x: it.x + x * k, y: it.y + y * k }));
}

const curved = (nodes: PathNode[]) => nodes.some((n) => !samePoint(n.i, n.p) || !samePoint(n.o, n.p));
const r1 = (v: number) => Math.round(v * 10) / 10, r4 = (v: number) => Math.round(v * 10000) / 10000;

/** What makes an item (a figure or a line) go through these nodes, boxed around its outline. */
export function shapedBy(it: Pick<Item, 'type' | 'sw' | 'w' | 'iw'>, nodes: PathNode[]): Partial<Item> {
  const figure = it.type === 'polygon', flat = flattenPath(nodes, figure);
  const k = figure ? 1 : it.w / (it.iw || it.w || 1), sw = figure ? 0 : (it.sw ?? 2) * k, pad = sw / 2;
  const x = r1(Math.min(...flat.map((p) => p.x)) - pad), y = r1(Math.min(...flat.map((p) => p.y)) - pad);
  const w = Math.max(1, r1(Math.max(...flat.map((p) => p.x)) + pad - x)), h = Math.max(1, r1(Math.max(...flat.map((p) => p.y)) + pad - y));
  const has = curved(nodes);
  if (figure) {
    const u = (p: Point) => [r4((p.x - x) / w), r4((p.y - y) / h)];
    return { x, y, w, h, vx: nodes.flatMap((n) => u(n.p)), vh: has ? nodes.flatMap((n) => [...u(n.i), ...u(n.o)]) : undefined };
  }
  const u = (p: Point) => [r1(p.x - x), r1(p.y - y)];
  return { x, y, w, h, iw: w, sw: r1(sw), pts: nodes.flatMap((n) => u(n.p)), ph: has ? nodes.flatMap((n) => [...u(n.i), ...u(n.o)]) : undefined };
}

// The path whose nodes are being changed, and the last press on a corner (a double click there).
let editing: string | null = null;
let lastTap = { t: 0, index: -1 };

export const nodeEditing = () => editing;

export function startNodeEdit(ed: Editor, id: string): void {
  editing = id;
  ed.setSelection([id]);
  ed.requestRender();
}

export function stopNodeEdit(ed: Editor): void {
  if (!editing) return;
  editing = null;
  ed.requestRender();
}

/** What of the path being changed is at screen point `sp`: a handle (of a smooth corner) or a corner. */
function partAt(ed: Editor, it: Item, sp: Point): { index: number; part: 'p' | 'i' | 'o' } | null {
  const nodes = nodesOf(it), near = (q: Point) => { const s = ed.toScreen(q); return Math.hypot(s.x - sp.x, s.y - sp.y) <= 7; };
  for (const [index, n] of nodes.entries()) {
    if (!samePoint(n.o, n.p) && near(n.o)) return { index, part: 'o' };
    if (!samePoint(n.i, n.p) && near(n.i)) return { index, part: 'i' };
  }
  for (const [index, n] of nodes.entries()) if (near(n.p)) return { index, part: 'p' };
  return null;
}

/** A press while nodes are being changed: a corner or a handle taken to drag (a corner pressed twice
 *  made sharp or smooth); false when it's elsewhere (and changing them is over). */
export function pressNode(ed: Editor, sp: Point, w: Point): boolean {
  const it = editing ? ed.board.get(editing) : undefined;
  if (!editablePath(it)) { editing = null; return false; }
  const at = partAt(ed, it, sp);
  if (!at) { stopNodeEdit(ed); return false; }
  const now = performance.now();
  if (at.part === 'p' && lastTap.index === at.index && now - lastTap.t < 380) {
    lastTap = { t: 0, index: -1 };
    toggleSmooth(ed, it, at.index);
    return true;
  }
  if (at.part === 'p') lastTap = { t: now, index: at.index };
  ed.board.beginGesture();
  ed.gesture = { type: 'pathNode', id: it.id, index: at.index, part: at.part, start: w, nodes: nodesOf(it) };
  return true;
}

/** A corner or handle dragged by `d` from where it was: a handle turns its pair along, opposite, keeping
 *  that one's length (but with Alt, or when the pair is on its corner). */
export function moveNode(ed: Editor, g: { id: string; index: number; part: 'p' | 'i' | 'o'; start: Point; nodes: PathNode[] }, w: Point, alt: boolean): void {
  const it = ed.board.get(g.id);
  if (!it) return;
  const d = { x: w.x - g.start.x, y: w.y - g.start.y }, add = (p: Point) => ({ x: p.x + d.x, y: p.y + d.y });
  const nodes = g.nodes.map((n) => ({ ...n })), n = nodes[g.index], was = g.nodes[g.index];
  if (g.part === 'p') nodes[g.index] = { p: add(was.p), i: add(was.i), o: add(was.o) };
  else {
    const other = g.part === 'o' ? 'i' : 'o', moved = add(was[g.part]);
    n[g.part] = moved;
    const len = Math.hypot(was[other].x - was.p.x, was[other].y - was.p.y), dx = moved.x - was.p.x, dy = moved.y - was.p.y, l = Math.hypot(dx, dy);
    if (!alt && len > 0.5 && l > 0.5) n[other] = { x: was.p.x - (dx / l) * len, y: was.p.y - (dy / l) * len };
  }
  ed.board.update(it.id, shapedBy(it, nodes));
}

/** A corner made smooth (handles along its neighbours, a third of the way to each) or sharp. */
function toggleSmooth(ed: Editor, it: Item, index: number): void {
  const nodes = nodesOf(it), n = nodes[index], closed = it.type === 'polygon';
  if (!samePoint(n.i, n.p) || !samePoint(n.o, n.p)) nodes[index] = { p: n.p, i: n.p, o: n.p };
  else {
    const prev = nodes[index - 1] ?? (closed ? nodes[nodes.length - 1] : null), next = nodes[index + 1] ?? (closed ? nodes[0] : null);
    const a = prev?.p ?? n.p, b = next?.p ?? n.p, dx = b.x - a.x, dy = b.y - a.y, l = Math.hypot(dx, dy) || 1;
    const li = prev ? Math.hypot(n.p.x - a.x, n.p.y - a.y) / 3 : 0, lo = next ? Math.hypot(b.x - n.p.x, b.y - n.p.y) / 3 : 0;
    nodes[index] = { p: n.p, i: { x: n.p.x - (dx / l) * li, y: n.p.y - (dy / l) * li }, o: { x: n.p.x + (dx / l) * lo, y: n.p.y + (dy / l) * lo } };
  }
  ed.board.update(it.id, shapedBy(it, nodes));
}

/** Handles as lines from their corner to a dot; corners as small squares. Screen points `s`. */
export function drawNodes(ctx: CanvasRenderingContext2D, ed: Editor, nodes: PathNode[], hot = -1): void {
  ctx.save();
  ctx.strokeStyle = '#4DA3FF';
  ctx.lineWidth = 1;
  for (const n of nodes) {
    const p = ed.toScreen(n.p);
    for (const h of [n.i, n.o]) {
      if (samePoint(h, n.p)) continue;
      const q = ed.toScreen(h);
      ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(q.x, q.y); ctx.stroke();
      ctx.beginPath(); ctx.arc(q.x, q.y, 3.5, 0, Math.PI * 2); ctx.fillStyle = '#fff'; ctx.fill(); ctx.stroke();
    }
  }
  nodes.forEach((n, i) => {
    const p = ed.toScreen(n.p);
    ctx.fillStyle = i === hot ? '#4DA3FF' : '#fff';
    ctx.fillRect(Math.round(p.x) - 3.5, Math.round(p.y) - 3.5, 7, 7);
    ctx.strokeRect(Math.round(p.x) - 3.5, Math.round(p.y) - 3.5, 7, 7);
  });
  ctx.restore();
}

/** The nodes of the path being changed, while it's still the one picked. */
export function drawEditedPath(ctx: CanvasRenderingContext2D, ed: Editor): void {
  const it = editing ? ed.board.get(editing) : undefined;
  if (!editablePath(it) || !ed.selection.has(it.id) || ed.selection.size !== 1) { editing = null; return; }
  drawNodes(ctx, ed, nodesOf(it));
}
