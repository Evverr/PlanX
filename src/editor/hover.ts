import type { Item, Link, Side } from '../model/types';
import { ROTATABLE } from '../model/types';
import type { Point } from '../canvas/geometry';
import { hitItem, hitLink, instanceBounds, linkHandles, linkShape, onAudioButton, onTaskBox, pointInRect, sidePoint, SIDES, toLocal } from '../canvas/geometry';
import { DOT_GAP, HANDLE } from '../canvas/renderer';
import { instanceGlyph, instancePlus } from '../model/components';
import { isBuiltin } from '../model/builtins';
import { branchWays, buttonKey, foldBadge, mindButtons, type MindButtonAt, type Way } from '../model/mind';
import { frameButtonAt } from './frames';
import { rotateCursor } from './cursors';
import { restOn, sameLine, tableLineAt } from './tables';
import type { Editor } from './editor';
import { isLocked } from '../labs/labs';

/** How far outside a corner (in screen pixels) the pointer turns the item. */
const ROTATE_ZONE = 18;

/** Whether the point is on the item's resize handle, at its lower right corner. */
export function onHandle(ed: Editor, it: Item, w: Point): boolean {
  // What's in an instance is as big as the instance makes it; the instance's handle is at its contents' corner.
  if (it.type === 'mind' || it.fold || it.host) return false;
  const hs = ed.reach((HANDLE + 6) / 2) * 2, off = 3 / ed.cam.z, b = it.inst ? instanceBounds(it, ed.board.list()) : it;
  return pointInRect(it.inst ? w : toLocal(it, w), { x: b.x + b.w + off - hs / 2, y: b.y + b.h + off - hs / 2, w: hs, h: hs });
}

/** Which side of the picked item the point is on, to stretch it one way only: its right side across
 *  ('w'), its bottom down ('h'), a timeline's left side to start it on another day ('l'); the corner
 *  (onHandle) does both. Not for what keeps its proportions or sizes itself, nor what's locked. An
 *  instance by its contents. */
export function sideAt(ed: Editor, it: Item, w: Point): 'w' | 'h' | 'l' | null {
  if (it.fold || it.host || ed.editingId || ['mind', 'icon', 'emoji', 'ink', 'audio', 'image'].includes(it.type)) return null;
  const b = it.inst ? instanceBounds(it, ed.board.list()) : it, p = it.inst ? w : toLocal(it, w);
  const near = ed.reach(4), corner = ed.reach(10);
  const along = (v: number, from: number, size: number) => v >= from + corner && v <= from + size - corner;
  if (Math.abs(p.x - (b.x + b.w)) <= near && along(p.y, b.y, b.h)) return 'w';
  if (it.tl && Math.abs(p.x - b.x) <= near && along(p.y, b.y, b.h)) return 'l';
  if (it.type !== 'text' && Math.abs(p.y - (b.y + b.h)) <= near && along(p.x, b.x, b.w)) return 'h';
  return null;
}

/** The handle of the link picked alone under the point: one of its nodes (`node`, its place in `via`),
 *  or the middle of a stretch to pull a new node out of (`at`, where it would go). */
export function linkHandleAt(ed: Editor, w: Point): { id: string; node?: number; at?: number } | null {
  if (ed.selection.size !== 1) return null;
  const link = ed.selectedLinks()[0], shape = link && linkShape(link, (id) => ed.board.get(id));
  if (!link || !shape) return null;
  const { nodes, middles } = linkHandles(link, shape), r = ed.reach(7);
  const node = nodes.findIndex((n) => Math.hypot(w.x - n.x, w.y - n.y) <= r);
  if (node >= 0) return { id: link.id, node };
  const mid = middles.find((m) => Math.hypot(w.x - m.p.x, w.y - m.p.y) <= r);
  return mid ? { id: link.id, at: mid.at } : null;
}

/** Which of a mind map node's buttons is under the point, once they're showing. */
export function plusAt(ed: Editor, it: Item, w: Point): MindButtonAt | null {
  if (it.type !== 'mind' || it.host || ed.plusFade() === 0) return null;
  // The nearest within reach: the "+" for a branch and the chevron past it are close.
  let best: MindButtonAt | null = null, near = Infinity;
  const fresh = ed.chevronless?.startsWith(`${it.id}:`) ? ed.chevronless.slice(it.id.length + 1) as Way : undefined;
  for (const b of mindButtons(it, (id) => ed.board.get(id), ed.cam.z, branchWays(it, ed.board.list()), fresh)) {
    const d = Math.hypot(w.x - b.x, w.y - b.y);
    if (d <= Math.max(b.r * 1.5, ed.reach(0)) && d < near) { best = b; near = d; }
  }
  return best;
}

/** The link whose arrowhead is under the point: taken hold of there, it's led to another item. */
export function linkEndAt(ed: Editor, w: Point): Link | null {
  const links = ed.shownLinks(), reach = Math.max(9 / ed.cam.z, ed.reach(0));
  for (let i = links.length - 1; i >= 0; i--) {
    const shape = linkShape(links[i], (id) => ed.board.get(id)), tip = shape?.pts[shape.pts.length - 1];
    if (tip && Math.hypot(w.x - tip.x, w.y - tip.y) <= reach) return links[i];
  }
  return null;
}

/** Whether the point is on the diamond before the title of the instance picked (or holding what's
 *  picked), the way to its component. */
export function onInstanceGlyph(ed: Editor, it: Item, w: Point): boolean {
  const inst = it.inst ? it : it.host ? ed.board.get(it.host) : undefined;
  return !!inst?.inst && !isBuiltin(inst.inst) && pointInRect(w, instanceGlyph(instanceBounds(inst, ed.board.list())));
}

/** Whether the point is on a picked component's "+" for a new instance. */
export function onInstancePlus(ed: Editor, it: Item, w: Point): boolean {
  if (!it.comp || ed.editingId === it.id) return false;
  const p = instancePlus(it, ed.cam.z);
  return Math.hypot(w.x - p.x, w.y - p.y) <= Math.max(p.r * 1.3, ed.reach(0));
}

/** The folded mind map node whose count is under the point, picked or not, and the way it's on. */
export function foldBadgeAt(ed: Editor, w: Point): { id: string; way: Way } | null {
  const pad = ed.reach(4);
  for (const [id, ways] of ed.folded()) {
    const it = ed.board.get(id);
    if (!it || ed.hidden().has(id)) continue;
    for (const [way, n] of ways) {
      const b = foldBadge(it, way, ed.cam.z, n, ed.slid.get(`${id}:${way}`) ?? 0);
      if (Math.abs(w.x - b.x) <= b.w / 2 + pad && Math.abs(w.y - b.y) <= b.h / 2 + pad) return { id, way };
    }
  }
  return null;
}

/** Whether the point is just outside the item's top right corner, where it is turned. */
export function onRotate(ed: Editor, it: Item, w: Point): boolean {
  if (!ROTATABLE.includes(it.type) || it.fold || it.inst || it.host) return false;
  const p = toLocal(it, w);
  return !pointInRect(p, it) && Math.hypot(p.x - (it.x + it.w), p.y - it.y) <= ed.reach(ROTATE_ZONE);
}

/** The link dot under the point, if any. */
export function dotAt(ed: Editor, it: Item, w: Point): Side | null {
  if (it.type === 'mind' || it.inst || it.host) return null;
  return anyDotAt(ed, it, w);
}

/** The same, for any item (with the line tool, every item has its dots). */
export function anyDotAt(ed: Editor, it: Item, w: Point): Side | null {
  const r = ed.reach(16.5);  // well beyond the dot itself, so it is easy to catch
  for (const side of SIDES) {
    const p = sidePoint(it, side, DOT_GAP / ed.cam.z);
    if (Math.hypot(w.x - p.x, w.y - p.y) <= r) return side;
  }
  return null;
}

/** With the line tool ("Линии", src/labs): the item under the pointer shows its link dots (any item,
 *  mind map nodes too), and keeps them while the pointer's on one, to be pressed and dragged from. */
function lineToolHover(ed: Editor, w: Point): void {
  const shown = ed.linkDots ? ed.board.get(ed.linkDots) : undefined, dot = shown ? anyDotAt(ed, shown, w) : null;
  const hit = dot ? shown : hitItem(ed.shown(), w, ed.cam.z);
  const id = hit && !hit.inst ? hit.id : null;
  if (id !== ed.linkDots || dot !== ed.hotDot) { ed.linkDots = id; ed.hotDot = dot; ed.requestRender(); }
  ed.canvas!.style.cursor = id ? 'crosshair' : '';
}

/** The frame button under the point, of the topmost frame in sight that has one there. */
export const frameButtonUnder = (ed: Editor, w: Point) => frameButtonAt(ed.shown(), w, ed.reach(4));

/** With the pointer over the board and nothing being done: what's under it lights up (a link dot,
 *  a table line it has rested on, a mind map button) and the cursor says what a press would do. */
export function updateCursor(ed: Editor, w: Point, alt: boolean): void {
  if (ed.canvas && !ed.gesture && ed.tool === 'link') { lineToolHover(ed, w); return; }
  if (!ed.canvas || ed.gesture || ed.tool !== 'select') return;
  const picked = ed.selection.size === 1 ? ed.board.get([...ed.selection][0]) : undefined;
  // A locked item has no handles to take.
  const single = isLocked(picked) ? undefined : picked;
  const dot = single && !ed.editingId ? dotAt(ed, single, w) : null;
  if (dot !== ed.hotDot) { ed.hotDot = dot; ed.requestRender(); }
  let cursor = '';
  const near = ed.editingId || dot ? null : tableLineAt(ed, w, hitItem(ed.shown(), w, ed.cam.z));
  restOn(ed, near);
  const line = ed.lineRest?.armed ? ed.lineRest.line : null;
  if (!sameLine(line, ed.hotLine)) { ed.hotLine = line; ed.requestRender(); }
  // A link the pointer is on (where no item is over it, as a press would find it) is faintly lit.
  const under = hitItem(ed.shown(), w, ed.cam.z);
  const link = under && under.type !== 'frame' ? null : hitLink(ed.shownLinks(), (id) => ed.board.get(id), w, ed.cam.z);
  if ((link?.id ?? null) !== ed.hotLink) { ed.hotLink = link?.id ?? null; ed.requestRender(); }
  // The picked instance's diamond (or that of the one holding what's picked) is lit as "glyph:<its id>".
  const glyph = picked && onInstanceGlyph(ed, picked, w) ? `glyph:${picked.inst ? picked.id : picked.host}` : null;
  const plus = picked ? plusAt(ed, picked, w) : null, hot = plus ? buttonKey(plus) : picked && onInstancePlus(ed, picked, w) ? 'instance' : glyph;
  if (hot !== ed.hotPlus) { ed.hotPlus = hot; ed.requestRender(); }
  if (hot || frameButtonUnder(ed, w) || foldBadgeAt(ed, w)) cursor = 'pointer';
  else if (linkHandleAt(ed, w)) cursor = 'move';
  else if (dot) cursor = 'crosshair';
  else if (single && onHandle(ed, single, w)) cursor = 'nwse-resize';
  else if (single && sideAt(ed, single, w)) cursor = sideAt(ed, single, w) === 'h' ? 'ns-resize' : 'ew-resize';
  else if (single && onRotate(ed, single, w)) cursor = rotateCursor((single.rot ?? 0) + 90);
  else if (line) cursor = line.axis === 'col' ? 'col-resize' : 'row-resize';
  else if (linkEndAt(ed, w)) cursor = 'grab';
  else if (link) cursor = 'pointer';
  else {
    const hit = hitItem(ed.shown(), w, ed.cam.z);
    // A task's ring (a component that comes with PlanX) is clicked through its states.
    const ring = hit?.host && hit.from?.startsWith('@task-') ? ed.board.get(`${hit.host}~@task-ring`) : undefined;
    if ((hit?.type === 'task' && onTaskBox(hit, w, ed.cam.z)) || (hit?.type === 'audio' && onAudioButton(hit, w)) || (ring && pointInRect(w, ring))) cursor = 'pointer';
    else if (hit && !isLocked(hit)) cursor = alt ? 'copy' : 'move';
  }
  ed.canvas.style.cursor = cursor;
}
