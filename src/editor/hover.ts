import type { Item, Link, Side } from '../model/types';
import { DEFAULTS, EDITABLE, ROTATABLE, textPad, textPadY } from '../model/types';
import { fontOf, textBlockHeight, withList } from '../canvas/text';
import { taskPartAt } from '../canvas/task';
import type { Point } from '../canvas/geometry';
import { hitItem, hitLink, instanceBounds, linkBox, linkHandles, linkShape, onAudioButton, pointInRect, sidePoint, SIDES, toLocal } from '../canvas/geometry';
import { DOT_GAP, dotGap, HANDLE } from '../canvas/renderer';
import { instanceGlyph, instancePlus, objectArrow } from '../model/components';
import { taskButtonAt } from './tasks';
import { onCodeCopy } from '../labs/codeBlock';
import { branchBase, buttonKey, foldBadge, foldedWays, mindButtons, mindWay, ringRadius, type MindButtonAt, type Way } from '../model/mind';
import { frameButtonAt } from './frames';
import { rotateCursor } from './cursors';
import { restOn, sameLine, tableLineAt, warmTable } from './tables';
import type { Editor } from './editor';
import { isLocked, labOn } from '../labs/labs';
import { dotsAlways, dotsOn, dotsUnder } from '../labs/linkTool';
import { linkPartAt } from '../labs/textLink';
import { zoomShows, zoomSize } from '../labs/zoomFade';

/** How far outside a corner (in screen pixels) the pointer turns the item. */
const ROTATE_ZONE = 18;

/** Whether the point is on the item's resize handle, at its lower right corner (or `more` round it). */
export function onHandle(ed: Editor, it: Item, w: Point, more = 0): boolean {
  // What's in an instance is as big as the instance makes it; the instance's handle is at its contents' corner.
  if (it.type === 'mind' || it.fold || it.host) return false;
  const hs = ed.reach((HANDLE + 6 + more) / 2) * 2, off = 3 / ed.cam.z, b = it.inst ? instanceBounds(it, ed.board.list()) : it;
  return pointInRect(it.inst ? w : toLocal(it, w), { x: b.x + b.w + off - hs / 2, y: b.y + b.h + off - hs / 2, w: hs, h: hs });
}

/** Whether the point is on the picked item's top left corner (or with `bottom`, its bottom left one):
 *  stretched from there as by its handle (nothing drawn there, the pointer says so). */
export function onTopLeft(ed: Editor, it: Item, w: Point, bottom = false): boolean {
  if (it.type === 'mind' || it.fold || it.host || it.inst || ed.editingId) return false;
  const hs = ed.reach((HANDLE + 6) / 2) * 2, off = 3 / ed.cam.z, y = bottom ? it.y + it.h + off : it.y - off;
  return pointInRect(toLocal(it, w), { x: it.x - off - hs / 2, y: y - hs / 2, w: hs, h: hs });
}
export const onBottomLeft = (ed: Editor, it: Item, w: Point): boolean => onTopLeft(ed, it, w, true);

/** Which side of the picked item the point is on, to stretch it one way only: its right side across
 *  ('w'), its bottom down ('h'), a timeline's left side to start it on another day ('l'); the corner
 *  (onHandle) does both. Not for what keeps its proportions or sizes itself, nor what's locked. An
 *  instance by its contents. */
export function sideAt(ed: Editor, it: Item, w: Point): 'w' | 'h' | 'l' | 't' | null {
  if (it.fold || it.host || ed.editingId || ['mind', 'icon', 'emoji', 'ink', 'audio', 'image'].includes(it.type)) return null;
  const b = it.inst ? instanceBounds(it, ed.board.list()) : it, p = it.inst ? w : toLocal(it, w);
  const near = ed.reach(4), corner = ed.reach(10);
  const along = (v: number, from: number, size: number) => v >= from + corner && v <= from + size - corner;
  if (Math.abs(p.x - (b.x + b.w)) <= near && along(p.y, b.y, b.h)) return 'w';
  // (Text and tasks only wider or narrower: a task's top and bottom left to a double click on it.)
  if (it.type !== 'text' && it.type !== 'task' && Math.abs(p.y - (b.y + b.h)) <= near && along(p.x, b.x, b.w)) return 'h';
  // The left and top sides too, the other side staying put (an instance stretches from its corner only).
  if (it.inst) return null;
  if (Math.abs(p.x - b.x) <= near && along(p.y, b.y, b.h)) return 'l';
  if (it.type !== 'text' && it.type !== 'task' && Math.abs(p.y - b.y) <= near && along(p.x, b.x, b.w)) return 't';
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
  for (const b of mindButtons(it, (id) => ed.board.get(id), ed.cam.z)) {
    const d = Math.hypot(w.x - b.x, w.y - b.y);
    if (d <= Math.max(b.r * 1.5, ed.reach(0)) && d < near) { best = b; near = d; }
  }
  return best;
}

/** The ring folding a mind map node's branches growing one way, under the point: where they leave it
 *  (see branchBase), the nearest one, and how far off. */
export function ringAt(ed: Editor, w: Point): { id: string; way: Way; d: number } | null {
  const items = ed.board.list(), hidden = ed.hidden(), reach = Math.max(ringRadius(ed.cam.z), ed.reach(0));
  // (Each node's ways with branches, from one look at them all.)
  const ways = new Map<string, Set<Way>>();
  for (const k of items) {
    const up = k.type === 'mind' && k.parent ? ed.board.get(k.parent) : undefined;
    if (up && !hidden.has(k.id)) ways.set(up.id, (ways.get(up.id) ?? new Set()).add(mindWay(k, up)));
  }
  let best: { id: string; way: Way; d: number } | null = null;
  for (const [id, set] of ways) {
    const it = ed.board.get(id);
    // (A central topic's branches aren't folded: they are the map.)
    if (!it?.parent || hidden.has(id) || it.host) continue;
    const folded = foldedWays(it, it.parent ? ed.board.get(it.parent) : undefined);
    for (const way of set) {
      if (folded.includes(way)) continue;
      const b = branchBase(it, way), d = Math.hypot(w.x - b.x, w.y - b.y);
      if (d <= reach && (!best || d < best.d)) best = { id, way, d };
    }
  }
  return best;
}

/** The link whose end (its arrowhead, or its start) is under the point: taken hold of there, that end's
 *  led to another item. `start`: it's the start. */
export function linkEndAt(ed: Editor, w: Point): { link: Link; start: boolean } | null {
  const links = ed.shownLinks(), reach = Math.max(9 / ed.cam.z, ed.reach(0));
  for (let i = links.length - 1; i >= 0; i--) {
    const shape = linkShape(links[i], (id) => ed.board.get(id)), tip = shape?.pts[shape.pts.length - 1], first = shape?.pts[0];
    if (tip && Math.hypot(w.x - tip.x, w.y - tip.y) <= reach) return { link: links[i], start: false };
    if (first && Math.hypot(w.x - first.x, w.y - first.y) <= reach) return { link: links[i], start: true };
  }
  return null;
}

/** Whether the point on a link is in its first half (along it, from its start). */
export function inFirstHalf(ed: Editor, link: Link, w: Point): boolean {
  const pts = linkShape(link, (id) => ed.board.get(id))?.pts ?? [];
  let total = 0, at = 0, near = Infinity;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i], len = Math.hypot(b.x - a.x, b.y - a.y);
    const k = len ? Math.max(0, Math.min(1, ((w.x - a.x) * (b.x - a.x) + (w.y - a.y) * (b.y - a.y)) / len ** 2)) : 0;
    const d = Math.hypot(a.x + (b.x - a.x) * k - w.x, a.y + (b.y - a.y) * k - w.y);
    if (d < near) { near = d; at = total + len * k; }
    total += len;
  }
  return at < total / 2;
}

/** Whether the point is on the diamond before the title of the instance picked (or holding what's
 *  picked), the way to its component. */
export function onInstanceGlyph(ed: Editor, it: Item, w: Point): boolean {
  const inst = it.inst ? it : it.host ? ed.board.get(it.host) : undefined;
  return !!inst?.inst && !inst.inst.startsWith('@') && pointInRect(w, instanceGlyph(instanceBounds(inst, ed.board.list())));
}

/** Whether the point is on a component's tick for an instance of it. */
export function onInstancePlus(ed: Editor, it: Item, w: Point): boolean {
  if (!it.comp || it.stowed || !zoomShows('comp', ed.cam.z, ed.selection.has(it.id))) return false;
  const p = instancePlus(it, ed.cam.z / zoomSize('comp', ed.cam.z, ed.selection.has(it.id)));
  return Math.hypot(w.x - p.x, w.y - p.y) <= Math.max(p.r * 1.3, ed.reach(0));
}

/** The component in sight whose tick is under the point, picked or not. */
export const tickAt = (ed: Editor, w: Point): Item | null => ed.shown().find((it) => onInstancePlus(ed, it, w)) ?? null;

/** The component in sight whose arrow (made one of the board's objects, "Объекты") is under the point. */
export const objectArrowAt = (ed: Editor, w: Point): Item | null => !labOn('objects') ? null : ed.shown().find((it) => {
  if (!it.comp || it.stowed || it.obj || !zoomShows('comp', ed.cam.z, ed.selection.has(it.id))) return false;
  const p = objectArrow(it, ed.cam.z / zoomSize('comp', ed.cam.z, ed.selection.has(it.id)));
  return Math.hypot(w.x - p.x, w.y - p.y) <= Math.max(p.r * 1.3, ed.reach(0));
}) ?? null;

/** Whether a press is off the component being changed here: not on it, on what it holds or on the controls there. */
export function offComponent(ed: Editor, w: Point, hit: Item | null): boolean {
  const c = ed.compHere ? ed.board.get(ed.compHere) : undefined;
  if (!c?.comp || c.stowed) return false;
  if ((hit && ed.carried([c]).has(hit.id)) || pointInRect(toLocal(c, w), c)) return false;
  const picked = ed.selection.size === 1 ? ed.board.get([...ed.selection][0]) : undefined;
  return !tickAt(ed, w) && !objectArrowAt(ed, w) && frameButtonUnder(ed, w)?.id !== c.id
    && !(picked && (onHandle(ed, picked, w) || onTopLeft(ed, picked, w) || onBottomLeft(ed, picked, w) || !!dotAt(ed, picked, w) || onRotate(ed, picked, w) || !!sideAt(ed, picked, w)));
}

/** The folded mind map node whose count is under the point, picked or not, and the way it's on. */
export function foldBadgeAt(ed: Editor, w: Point): { id: string; way: Way } | null {
  const pad = ed.reach(4);
  for (const [id, ways] of ed.folded()) {
    const it = ed.board.get(id);
    if (!it || ed.hidden().has(id) || !zoomShows('fold', ed.cam.z, ed.selection.has(id))) continue;
    for (const [way, n] of ways) {
      const b = foldBadge(it, way, ed.cam.z / zoomSize('fold', ed.cam.z, ed.selection.has(id)), n, ed.slid.get(`${id}:${way}`) ?? 0);
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
  // ("Связи инструментом", src/labs: only with the line tool.)
  if (it.type === 'mind' || it.inst || it.host || labOn('linkTool')) return null;
  return anyDotAt(ed, it, w);
}

/** The same, for any item (with the line tool, every item has its dots). */
export function anyDotAt(ed: Editor, it: Item, w: Point): Side | null {
  const r = ed.reach(DOT_GAP + 0.5);  // well beyond the dot itself, so it is easy to catch, up to the item's edge
  for (const side of SIDES) {
    const p = sidePoint(it, side, dotGap(it, side) / ed.cam.z);
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

/** "Связи инструментом" (src/labs) with its dots out: the dot under the pointer, of any item (the topmost
 *  first; a mind map node's while the pointer's on it, if it isn't picked), taken to be pulled from.
 *  Whether there's one. */
function dotsModeHover(ed: Editor, w: Point): boolean {
  const was = ed.linkDots ? ed.board.get(ed.linkDots) : undefined;
  let it = was && dotsUnder(was, ed.selection) && anyDotAt(ed, linkBox(was), w) ? was : ed.shown().filter((i) => dotsAlways(i, ed.selection)).reverse().find((i) => anyDotAt(ed, linkBox(i), w));
  const dot = it ? anyDotAt(ed, linkBox(it), w) : null;
  if (!it) { const hit = hitItem(ed.shown(), w, ed.cam.z); it = hit?.type === 'mind' && dotsUnder(hit, ed.selection) ? hit : undefined; }
  const id = it?.id ?? null;
  if (id !== ed.linkDots || dot !== ed.hotDot) { ed.linkDots = id; ed.hotDot = dot; ed.requestRender(); }
  if (dot) ed.canvas!.style.cursor = 'crosshair';
  return !!dot;
}

/** The frame button under the point, of the topmost frame in sight that has one there. */
export const frameButtonUnder = (ed: Editor, w: Point) => frameButtonAt(ed.shown(), w, ed.reach(4));

/** What's picked, under the point (anywhere in its box), before what lies over it: a drawing covers
 *  little of its box, and whatever's on it would be taken in its place. Not frames, which hold others. */
/** Whether a point on a mind map node is on its text (inside its padding): a click there types in it. */
export const onMindText = (it: Item, w: Point): boolean => {
  const px = Math.min(textPad(it), 10), py = Math.min(textPadY(it), 10);
  return w.x > it.x + px && w.x < it.x + it.w - px && w.y > it.y + py && w.y < it.y + it.h - py;
};

/** Whether a click on an item already picked alone types in it there (a second single click, as a
 *  double click): on its text itself, a task's title, description or subtask (not elsewhere on it, where
 *  "Клик сквозь" goes down through it); not a table (a click picks its cell), a frame, an instance, a
 *  mind map node (one click does). */
export function clickTypes(it: Item | null | undefined, w: Point): boolean {
  if (!it || !EDITABLE.includes(it.type) || it.type === 'table' || it.type === 'frame' || it.type === 'mind' || it.inst || it.host || isLocked(it)) return false;
  if (it.type === 'task') {
    const part = taskPartAt(it, w);
    return part === 'title' || part === 'desc' || (typeof part === 'object' && !!part && !part.tick);
  }
  if (it.type === 'text' || (it.code && it.text)) return true;
  if (!it.text?.trim() || it.rot) return false;
  // Its lines as laid out across it: down from its top, or in its middle.
  const pad = textPad(it), padY = textPadY(it), width = it.w - pad * 2;
  const th = Math.min(it.h - padY * 2, textBlockHeight(withList(it.text, it.ls), width, it.fs ?? DEFAULTS[it.type].fs ?? 16, fontOf(it)));
  const top = it.va === 'top' ? it.y + padY : it.y + (it.h - th) / 2;
  return w.x >= it.x + pad && w.x <= it.x + it.w - pad && w.y >= top && w.y <= top + th;
}

/** What hides what's under it: a task, a sticker, a picture, a table, a shape filled in. */
const solid = (it: Item) => ['task', 'sticky', 'image', 'table'].includes(it.type) || ((it.type === 'rect' || it.type === 'ellipse' || it.type === 'polygon') && it.color !== 'none');

export function pickedUnder(ed: Editor, w: Point): Item | null {
  if (ed.tool !== 'select' || ed.editingId) return null;
  const picked = ed.selectedItems().filter((it) => it.type !== 'frame' && !isLocked(it));
  for (let i = picked.length - 1; i >= 0; i--) {
    const it = picked[i];
    if (!pointInRect(it.rot ? toLocal(it, w) : w, it)) continue;
    // (Not from under something solid over it there, a task or a sticker say: that's what's seen, and taken.)
    const top = hitItem(ed.shown(), w, ed.cam.z);
    return top && top.id !== it.id && top.z > it.z && solid(top) ? null : it;
  }
  return null;
}

/** With the pointer over the board and nothing being done: what's under it lights up (a link dot,
 *  a table line it has rested on, a mind map button) and the cursor says what a press would do. */
export function updateCursor(ed: Editor, w: Point, alt: boolean): void {
  if (ed.canvas && !ed.gesture && ed.tool === 'link') { lineToolHover(ed, w); return; }
  if (!ed.canvas || ed.gesture || ed.tool !== 'select') return;
  if (labOn('linkTool') && dotsOn() && dotsModeHover(ed, w)) return;
  const picked = ed.selection.size === 1 ? ed.board.get([...ed.selection][0]) : undefined;
  // A locked item has no handles to take.
  const single = isLocked(picked) ? undefined : picked;
  const dot = single && !ed.editingId ? dotAt(ed, single, w) : null;
  if (dot !== ed.hotDot) { ed.hotDot = dot; ed.requestRender(); }
  let cursor = '';
  // (Typing in a table's cell, its lines are still taken.)
  const typingCell = !!ed.editingId && ed.board.get(ed.editingId)?.type === 'table';
  const over = hitItem(ed.shown(), w, ed.cam.z), near = (ed.editingId && !typingCell) || dot ? null : tableLineAt(ed, w, over);
  // On the handle itself, or a little round it (not on the link dots): the handle stronger.
  const onIt = !dot && !!single && onHandle(ed, single, w, 8);
  if (onIt !== ed.hotHandle) { ed.hotHandle = onIt; ed.requestRender(); }
  // (Whether it's still ready is asked before it's kept ready by the pointer being on it.)
  restOn(ed, near);
  warmTable(ed, near?.id ?? (over?.type === 'table' ? over.id : undefined));
  const line = ed.lineRest?.armed ? ed.lineRest.line : null;
  if (!sameLine(line, ed.hotLine)) { ed.hotLine = line; ed.requestRender(); }
  // A link the pointer is on (where no item is over it, as a press would find it) is faintly lit.
  const under = pickedUnder(ed, w) ?? hitItem(ed.shown(), w, ed.cam.z);
  const link = under && under.type !== 'frame' ? null : hitLink(ed.shownLinks(), (id) => ed.board.get(id), w, ed.cam.z);
  if ((link?.id ?? null) !== ed.hotLink) { ed.hotLink = link?.id ?? null; ed.requestRender(); }
  // The picked instance's diamond (or that of the one holding what's picked) is lit as "glyph:<its id>".
  const glyph = picked && onInstanceGlyph(ed, picked, w) ? `glyph:${picked.inst ? picked.id : picked.host}` : null;
  // A mind map node the pointer is on, or on its buttons, shows them as if it were picked.
  const rest = ed.mindHover ? ed.board.get(ed.mindHover) : undefined;
  const mind = rest && (pointInRect(w, rest) || plusAt(ed, rest, w)) ? rest.id : over?.type === 'mind' && !over.host ? over.id : null;
  if (mind !== ed.mindHover) { ed.mindHover = mind; ed.requestRender(); }
  const node = ed.plusNode();
  const tick = tickAt(ed, w), arrow = tick ? null : objectArrowAt(ed, w), plus = node ? plusAt(ed, node, w) : null;
  // A task's arrow under the pointer, darker (see canvas/task.ts).
  const tp = over?.type === 'task' && ed.editingId !== over.id ? taskButtonAt(over, w) : null;
  // The ring where a node's branches leave it, nearer than its "+" that way: lit, to fold them.
  const ring = ringAt(ed, w), ringFirst = ring && (!plus || ring.d < Math.hypot(w.x - plus.x, w.y - plus.y));
  const hot = ringFirst ? `ring:${ring.id}:${ring.way}` : plus ? buttonKey(plus) : tick ? `tick:${tick.id}` : arrow ? `obj:${arrow.id}` : glyph ?? (tp === 'arrow' || tp === 'more' || tp === 'people' ? `task:${over!.id}:${tp}` : null)
    ?? (over?.code && ed.editingId !== over.id && onCodeCopy(over, w) ? `code:${over.id}` : null);
  if (hot !== ed.hotPlus) { ed.hotPlus = hot; ed.requestRender(); }
  if (hot || frameButtonUnder(ed, w) || foldBadgeAt(ed, w)) cursor = 'pointer';
  else if (linkHandleAt(ed, w)) cursor = 'move';
  else if (dot) cursor = 'crosshair';
  else if (single && (onHandle(ed, single, w) || onTopLeft(ed, single, w))) cursor = 'nwse-resize';
  else if (single && onBottomLeft(ed, single, w)) cursor = 'nesw-resize';
  else if (single && sideAt(ed, single, w)) cursor = sideAt(ed, single, w) === 'h' || sideAt(ed, single, w) === 't' ? 'ns-resize' : 'ew-resize';
  else if (single && onRotate(ed, single, w)) cursor = rotateCursor((single.rot ?? 0) + 90);
  else if (line) cursor = line.axis === 'col' ? 'col-resize' : 'row-resize';
  else if (linkEndAt(ed, w)) cursor = 'grab';
  else if (link) cursor = 'pointer';
  else {
    const hit = pickedUnder(ed, w) ?? hitItem(ed.shown(), w, ed.cam.z);
    // A task's ring (a component that comes with PlanX) is clicked through its states.
    if ((hit?.type === 'task' && ed.editingId !== hit.id && taskButtonAt(hit, w)) || (hit?.type === 'audio' && onAudioButton(hit, w))
      || (hit && ed.editingId !== hit.id && linkPartAt(hit, w))) cursor = 'pointer';
    // (Over items, text and all, the usual arrow: a click picks it, a drag takes it along; typed in on
    // a double click, or a second single one on its text.)
    else if (hit && !isLocked(hit) && alt) cursor = 'copy';
  }
  ed.canvas.style.cursor = cursor;
}
