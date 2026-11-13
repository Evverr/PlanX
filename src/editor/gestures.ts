import type { Item, Link, Side } from '../model/types';
import { DEFAULTS, ROTATABLE, uid } from '../model/types';
import type { PathNode, Point, Rect } from '../canvas/geometry';
import { anchorAt, angleOf, boxOf, center, hitItem, linkBox, linkShape, movedStretch, pathCrosses, nearestSide, nearInk, normRect, pointInRect, rectContains, rectsIntersect, resizedFrom, toLocal, turn } from '../canvas/geometry';
import { itemTextHeight, mindSize } from '../canvas/text';
import { setSubDrag, subDropAt, TASK_MIN_W, taskPartAt, taskSize } from '../canvas/task';
import { freshTask, moveSub, nextView, toggleSub } from '../model/task';
import { taskOpen } from '../labs/taskFull';
import { pressTask, taskFieldAt } from './tasks';
import { cellAt, MIN_COL, MIN_ROW, movedLines, freshTable, withScale, type TableLine } from '../model/table';
import { snapToGuides, type Guide } from '../canvas/guides';
import { shapeStyle } from './shapeStyle';
import { branchCrosses, canMoveTo, foldedWays, folding, mindWay, mindRoot, mindWays, moveBranch, nearestFamily, type Way } from '../model/mind';
import { clamp, MAX_Z } from './camera';
import { zoomToBox } from '../labs/zoomBox';
import { showGrips } from '../labs/tableMove';
import { pullOut } from '../labs/linkJoint';
import { noteMindMoved } from '../labs/tidyMind';
import { rotateCursor } from './cursors';
import { MIND_TOPIC, type PenTool } from './tools';
import { clickTypes, onMindText, updateCursor } from './hover';
import type { Editor } from './editor';
import { isLocked, labOn } from '../labs/labs';
import { tidyKanbans } from '../labs/kanban';
import { levelIn } from '../labs/groups';
import { eraseArea, eraserStyle } from '../labs/eraseArea';
import { nibDrag, nibRelease } from '../labs/nib';
import { editablePath, moveNode, startNodeEdit } from '../labs/paths';
import { openDoc } from '../labs/docx';
import { openSwap, swapKind } from '../labs/swap';
import { pushedBelow } from '../labs/textPush';
import { dayKey, dayOf, halfDay, TL_PAD, tlDays, tlStart } from '../canvas/timeline';
import { under } from '../labs/clickThrough';

/** What a press on the board has started, followed till it's let go. */
export type Gesture =
  | { type: 'pan'; sx: number; sy: number; cx: number; cy: number; tap?: boolean; moved?: boolean }
  | { type: 'pinch'; d0: number; z0: number; anchor: Point }
  | { type: 'drag'; start: Point; orig: Map<string, Point>; moved: boolean; id: string; dbl: boolean; fresh?: boolean; was?: string[]; stage?: number; sub?: number; subTo?: number; pulled?: boolean; guides?: Guide[]; cell?: boolean; enter?: boolean; again?: boolean; vias?: Map<string, Point[]>; url?: string; tap?: Point; mindTo?: string | null; mindWay?: Way }
  | { type: 'resize'; id: string; start: Point; orig: Item; box?: Rect; only?: 'w' | 'h' | 'l' | 't' | 'tl' | 'bl' }
  | { type: 'rotate'; id: string; c: Point; a0: number; rot0: number; held: Array<{ id: string; c: Point; rot0: number }> }
  | { type: 'create'; id: string; origin: Point; last?: Point }
  | { type: 'tab'; id: string; side: Side; start: Point }
  | { type: 'place'; at: Point; tool: 'sticky' | 'text' | 'task' | 'table' | 'mind' | 'timeline' | 'form' | 'poll' | 'kanban'; to?: Point }
  | { type: 'tableLine'; id: string; start: Point; lines: TableLine[]; cols0: number[]; rows0: number[] }
  | { type: 'link'; from: string; fromSide: Side | null; to: Point; target: string | null }
  | { type: 'relink'; id: string; from: Point; to: Point; target: string | null; away?: boolean; body?: boolean; going?: boolean;
      /** Its start's taken, not its end: let go on another item, it turns round, its arrow going there. */
      start?: boolean }
  | { type: 'linkNode'; id: string; node: number; via: Point[]; add?: boolean }
  | { type: 'linkStretch'; id: string; k: number; pts: Point[]; start: Point; moved?: boolean }
  | { type: 'mindMove'; id: string; from: Point; to: Point; target: string | null }
  | { type: 'marquee'; start: Point; base: Set<string>; rect: Rect | null; zoom?: boolean }
  | { type: 'draw'; tool: PenTool; pts: Point[]; end?: Point }
  | { type: 'erase'; last: Point }
  // "Перо" (src/labs): a corner being pressed (its handles dragged out); a node of a path being changed.
  | { type: 'nib' }
  | { type: 'pathNode'; id: string; index: number; part: 'p' | 'i' | 'o'; start: Point; nodes: PathNode[] };

/** How near (in screen pixels) an edge or middle has to come to another's to line up with it. */
const GUIDE_SNAP = 6;
/** «Направляющие по близким объектам» (src/labs): how near another must be (the gap between them, in
 *  screen pixels) for what's dragged to line up with it. */
const NEAR_GUIDES = 200;
/** How close to a square angle (in degrees) a turn sticks to it. */
const ROTATE_SNAP = 3;
/** What's resized to whole and half days on a timeline. */
const SNAPS_TO_DAYS = new Set(['task', 'sticky', 'rect', 'ellipse', 'polygon']);
/** «Угловые линии на таймлайне» (src/labs): moved, the right-angled lines between what's on a timeline
 *  (out of the right side, as they're made there) go into the other's left side if it starts after this
 *  one does, else round into its right side. (Not those with bends of their own, or led to a place on a side.) */
function timelineSides(ed: Editor, moved: string[]): void {
  if (!labOn('tlLinks')) return;
  const board = ed.board, ids = new Set(moved);
  for (const l of board.linkList()) {
    if ((!ids.has(l.from) && !ids.has(l.to)) || l.style !== 'elbow' || l.fromSide !== 'right' || (l.toSide !== 'left' && l.toSide !== 'right') || l.via?.length || l.toAt !== undefined) continue;
    const a = board.get(l.from), b = board.get(l.to);
    if (!a || !b || !timelineOf(ed, a) || !timelineOf(ed, b)) continue;
    const side = b.x >= a.x ? 'left' : 'right';
    if (side !== l.toSide) board.updateLink(l.id, { toSide: side });
  }
}

/** The timeline an item is on: the one holding it, else one its middle is over. */
function timelineOf(ed: Editor, it: Item): Item | undefined {
  const all = ed.shown(), c = { x: it.x + it.w / 2, y: it.y + it.h / 2 };
  return all.find((t) => t.tl && t.members?.includes(it.id)) ?? all.find((t) => t.tl && pointInRect(c, t));
}

/** The pointer moved to `sp` on screen (`w` on the board) with the gesture going on. */
export function moveGesture(ed: Editor, g: Gesture, e: PointerEvent, sp: Point, w: Point): void {
  const board = ed.board;
  switch (g.type) {
    case 'nib':
      nibDrag(ed, w, sp);
      return;
    case 'pathNode':
      moveNode(ed, g, w, e.altKey);
      ed.requestRender();
      return;
    case 'pinch': {
      const [p, q] = [...ed.pointers.values()];
      if (!q) return;
      const z = clamp(g.z0 * Math.hypot(p.x - q.x, p.y - q.y) / g.d0, ed.minZoom(), MAX_Z);
      const cx = (p.x + q.x) / 2, cy = (p.y + q.y) / 2;
      ed.cam = { z, x: cx - g.anchor.x * z, y: cy - g.anchor.y * z };
      ed.camChanged();
      return;
    }
    case 'pan':
      if (Math.hypot(sp.x - g.sx, sp.y - g.sy) > 4) g.moved = true;
      ed.cam = { ...ed.cam, x: g.cx + sp.x - g.sx, y: g.cy + sp.y - g.sy };
      ed.camChanged();
      return;
    case 'drag': {
      const dx = w.x - g.start.x, dy = w.y - g.start.y;
      // A subtask dragged ("Перетаскивание подзадач", src/labs): up or down among the others, the task
      // staying where it is.
      if (g.sub !== undefined) {
        const it = board.get(g.id);
        if (!it || (!g.moved && Math.abs(dy) * ed.cam.z < 3)) return;
        g.moved = true;
        g.subTo = subDropAt(it, g.sub, w.y - it.y);
        setSubDrag({ id: it.id, from: g.sub, to: g.subTo, dy });
        ed.requestRender();
        return;
      }
      if (!g.moved) {
        if (Math.hypot(dx, dy) * ed.cam.z < 3) return;
        g.moved = true;
        ed.setMoving(true);
        board.beginGesture();
        if (e.altKey) g.orig = ed.dragCopies(g.orig);
      }
      // ("Узел на линии", src/labs: Cmd or Ctrl held, from the start or on the way, what's in a line comes out of it.)
      if (!g.pulled && !e.altKey && (e.metaKey || e.ctrlKey) && labOn('linkJoint')) {
        g.pulled = true;
        pullOut(ed, g.orig.keys());
      }
      // With Shift held as it's dragged, what's dragged lines up with what's on screen around it when near.
      // With «Направляющие по близким объектам» (src/labs), without Shift too, but only with what's near it
      // (see NEAR_GUIDES); Shift then as ever. (Not a mind map's node: its map places it.) With Cmd (Ctrl)
      // held, none: put where it's let go.
      let sx = 0, sy = 0;
      g.guides = undefined;
      const free = e.metaKey || e.ctrlKey, near = !e.shiftKey && labOn('nearGuides') && board.get(g.id)?.type !== 'mind';
      if (!free && (e.shiftKey || near)) {
        const moving = [...g.orig].map(([id, o]) => { const it = board.get(id); return it && { ...it, x: o.x + dx, y: o.y + dy }; }).filter((i): i is Item => !!i);
        const bs = moving.map(boxOf), view = ed.viewRect();
        const x = Math.min(...bs.map((b) => b.x)), y = Math.min(...bs.map((b) => b.y));
        const box = bs.length ? { x, y, w: Math.max(...bs.map((b) => b.x + b.w)) - x, h: Math.max(...bs.map((b) => b.y + b.h)) - y } : null;
        const reach = NEAR_GUIDES / ed.cam.z, gap = (r: Rect, b: Rect) => Math.hypot(Math.max(0, r.x - b.x - b.w, b.x - r.x - r.w), Math.max(0, r.y - b.y - b.h, b.y - r.y - r.h));
        const others = ed.shown().filter((i) => !g.orig.has(i.id) && i.type !== 'ink').map(boxOf).filter((r) => rectsIntersect(r, view) && (!near || (!!box && gap(r, box) <= reach)));
        if (box) ({ dx: sx, dy: sy, guides: g.guides } = snapToGuides(box, others, GUIDE_SNAP / ed.cam.z));
      }
      // On a timeline ("Объекты", src/labs), what's dragged keeps its left side to whole and half days.
      const lead = board.get(g.id), from = g.orig.get(g.id);
      let halves = false;
      if (!e.shiftKey && lead && from && !lead.tl) {
        const c = { x: from.x + dx + lead.w / 2, y: from.y + dy + lead.h / 2 };
        const tl = ed.shown().find((t) => t.tl && !g.orig.has(t.id) && c.x >= t.x && c.x <= t.x + t.w && c.y >= t.y && c.y <= t.y + t.h);
        if (tl) { sx = halfDay(tl, from.x + dx) - (from.x + dx); halves = true; }
      }
      const round = (v: number) => (halves ? Math.round(v * 2) / 2 : Math.round(v));
      // Links with both ends moved take their nodes along.
      g.vias ??= new Map(board.linkList().filter((l) => l.via?.length && g.orig.has(l.from) && g.orig.has(l.to)).map((l) => [l.id, l.via!]));
      board.transact(() => {
        for (const [id, o] of g.orig) board.update(id, { x: round(o.x + dx + sx), y: Math.round(o.y + dy + sy) });
        for (const [id, via] of g.vias!) board.updateLink(id, { via: via.map((p) => ({ x: Math.round(p.x + dx + sx), y: Math.round(p.y + dy + sy) })) });
      });
      // A mind map branch dragged alone: the family it's nearest to, its line from there as it goes.
      // (Only on the side it grows from: as it stood when taken, up or down; right or left by the side of its
      // map's central topic it's on now, its middle the mark.)
      if (lead?.type === 'mind' && lead.parent && ed.selection.size === 1) {
        const up = board.get(lead.parent), o = g.orig.get(g.id), root = mindRoot(lead, (k) => board.get(k));
        if (up && o) g.mindWay ??= mindWay({ ...lead, ...o }, up);
        const way = g.mindWay === 'up' || g.mindWay === 'down' ? g.mindWay : lead.x + lead.w / 2 < root.x + root.w / 2 ? 'left' : 'right';
        g.mindTo = nearestFamily(g.id, board.list(), way);
        ed.requestRender();
      }
      if (g.guides) ed.requestRender();
      return;
    }
    case 'resize': {
      const it = board.get(g.id);
      if (!it) return;
      // An instance stretches what's in it (see stretched in model/components.ts), from its contents' corner.
      if (it.inst && g.box) {
        const g0 = g.orig.grow ?? { w: 0, h: 0 }, b = g.box;
        const nw = g.only === 'h' ? b.w : Math.max(20, Math.round(b.w + w.x - g.start.x)), nh = g.only === 'w' ? b.h : Math.max(20, Math.round(b.h + w.y - g.start.y));
        const grow = { w: g0.w + nw - b.w, h: g0.h + nh - b.h };
        board.update(g.id, { grow: grow.w || grow.h ? grow : undefined });
        return;
      }
      // A timeline's left side moves where it starts, a whole day at a time, what's on it staying.
      if (g.only === 'l' && g.orig.tl) {
        const day = dayOf(g.orig), days = Math.min(Math.round((w.x - g.start.x) / day), tlDays(g.orig) - 7);
        board.update(g.id, { x: g.orig.x + days * day, w: g.orig.w - days * day, tl: dayKey(tlStart(g.orig), days) });
        return;
      }
      const min = it.type === 'frame' ? 80 : it.type === 'ink' ? 4 : it.type === 'audio' ? 32 : it.type === 'icon' || it.type === 'emoji' || it.type === 'image' ? 16 : 40;
      // A turned item is stretched along its own sides.
      const { w: w0, h: h0 } = g.orig, d = turn({ x: w.x - g.start.x, y: w.y - g.start.y }, { x: 0, y: 0 }, -angleOf(g.orig));
      // Which way each side goes: by a side one way only, by the top left corner both back (the bottom left
      // one, across back and down on), by the handle both on; what's across stays put. With Alt, as in
      // Figma, from the middle: both sides as far.
      const sx = g.only === 'h' || g.only === 't' ? 0 : g.only === 'l' || g.only === 'tl' || g.only === 'bl' ? -1 : 1;
      const sy = g.only === 'w' || g.only === 'l' ? 0 : g.only === 't' || g.only === 'tl' ? -1 : 1, both = e.altKey ? 2 : 1;
      let nw = sx ? Math.max(min, Math.round(w0 + sx * d.x * both)) : w0;
      let nh = sy ? Math.max(min, Math.round(h0 + sy * d.y * both)) : h0;
      // A timeline holds whole days.
      if (it.tl) nw = TL_PAD * 2 + Math.max(7, Math.round((nw - TL_PAD * 2) / dayOf(it))) * dayOf(it);
      // Stickers, icons, emoji, drawings and pictures keep their proportions; Shift flips that: a sticker of any shape, or a shape kept in proportion.
      const keep = (!g.only || g.only === 'tl' || g.only === 'bl') && (it.type === 'sticky' || it.type === 'image' ? !e.shiftKey : it.type === 'icon' || it.type === 'emoji' || it.type === 'ink' || it.type === 'audio' || e.shiftKey);
      if (keep) {
        const k = Math.max(nw / w0, nh / h0);
        nw = Math.round(w0 * k);
        nh = Math.round(h0 * k);
      }
      // On a timeline ("Объекты", src/labs), a task, sticker or shape's side being moved goes to whole and
      // half days (Alt, from the middle: as it likes); a sticker keeping its proportions.
      const tl = sx && !e.altKey && !it.rot && SNAPS_TO_DAYS.has(it.type) ? timelineOf(ed, it) : undefined;
      if (tl) {
        const half = dayOf(tl) / 2, least = it.type === 'task' ? (it.tv ? 360 : TASK_MIN_W) : min;
        const right = g.orig.x + w0, side = halfDay(tl, sx > 0 ? g.orig.x + nw : right - nw);
        nw = sx > 0 ? side - g.orig.x : right - side;
        if (nw < least) nw += Math.ceil((least - nw) / half) * half;
        if (keep) nh = Math.round((h0 * nw) / w0);
      }
      // (A text drawn as a box, «Текст рамкой»: as stretched, what doesn't fit showing past it.)
      if (it.type === 'text' && !it.tb) nh = itemTextHeight(it, it.text, nw);
      // A task only wider or narrower, as tall as what's in it then (see canvas/task.ts).
      if (it.type === 'task') { nw = Math.max(it.tv ? 360 : TASK_MIN_W, nw); nh = taskSize(it, nw).h; }
      // Text wrapping onto more lines (or fewer) takes the text just under it along.
      const moves = pushedBelow(it, nh - it.h, board.list());
      board.transact(() => {
        const size = it.type === 'table' ? withScale(it, nw, nh) : { w: nw, h: nh };
        // How far its top left corner goes (along its own sides): half the growth from the middle, all of it
        // for a side going back.
        const dl = !sx ? 0 : e.altKey ? (w0 - nw) / 2 : sx < 0 ? w0 - nw : 0;
        const dt = !sy ? 0 : e.altKey ? (h0 - nh) / 2 : sy < 0 ? h0 - nh : 0;
        const at = resizedFrom(g.orig, nw, nh, dl, dt);
        board.update(g.id, { ...size, x: Math.round(at.x), y: Math.round(at.y) });
        moves.forEach((pt, k) => board.update(k, pt));
      });
      // A kanban («Канбан», src/labs): its columns and cards stretched with it as it goes.
      if (it.kb && labOn('kanban')) tidyKanbans(board);
      return;
    }
    case 'rotate': {
      // Shift turns in steps of 15°; otherwise the turn sticks to the square angles when near them.
      let deg = g.rot0 + ((Math.atan2(w.y - g.c.y, w.x - g.c.x) - g.a0) * 180) / Math.PI;
      if (e.shiftKey) deg = Math.round(deg / 15) * 15;
      else if (Math.abs(deg - Math.round(deg / 90) * 90) < ROTATE_SNAP) deg = Math.round(deg / 90) * 90;
      deg = Math.round((((deg % 360) + 540) % 360 - 180) * 10) / 10;
      // What a frame holds goes round its middle, turning as much (what can't turn just goes round).
      const d = deg - g.rot0, a = (d * Math.PI) / 180;
      board.transact(() => {
        board.update(g.id, { rot: deg || undefined });
        for (const h of g.held) {
          const it = board.get(h.id);
          if (!it) continue;
          const c = turn(h.c, g.c, a), patch: Partial<Item> = { x: Math.round(c.x - it.w / 2), y: Math.round(c.y - it.h / 2) };
          if (ROTATABLE.includes(it.type)) patch.rot = Math.round((((h.rot0 + d) % 360 + 540) % 360 - 180) * 10) / 10 || undefined;
          board.update(h.id, patch);
        }
      });
      if (ed.canvas) ed.canvas.style.cursor = rotateCursor(deg + 90);
      return;
    }
    case 'tableLine': {
      if (!board.get(g.id)) return;
      // The dragged lines move together, the gaps between them kept.
      const patch: Partial<Item> = {};
      const cols = g.lines.filter((l) => l.axis === 'col').map((l) => l.index);
      const rows = g.lines.filter((l) => l.axis === 'row').map((l) => l.index);
      if (cols.length) { patch.cols = movedLines(g.cols0, cols, w.x - g.start.x, MIN_COL); patch.w = patch.cols.reduce((a, b) => a + b, 0); }
      if (rows.length) { patch.rows = movedLines(g.rows0, rows, w.y - g.start.y, MIN_ROW); patch.h = patch.rows.reduce((a, b) => a + b, 0); }
      board.update(g.id, patch);
      return;
    }
    case 'create': {
      // With Space held, what's being drawn moves along with the pointer instead (as in Figma).
      if (ed.spaceDown && g.last) g.origin = { x: g.origin.x + w.x - g.last.x, y: g.origin.y + w.y - g.last.y };
      g.last = w;
      let r = normRect(g.origin, w);
      // Square with Shift, or, shapes set to come out square, free with it.
      const it = board.get(g.id), square = !!it && ['rect', 'ellipse', 'polygon'].includes(it.type) && shapeStyle().square;
      if (e.shiftKey !== square) { const s = Math.max(r.w, r.h); r = { ...r, w: s, h: s }; }
      board.update(g.id, { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.w), h: Math.round(r.h) });
      return;
    }
    case 'mindMove': {
      const t = hitItem(ed.shown(), w, ed.cam.z);
      g.to = w;
      g.target = t && canMoveTo(g.id, t.id, board.list()) ? t.id : null;
      ed.requestRender();
      return;
    }
    case 'link': {
      // (What's in an instance: the instance.)
      const hit = hitItem(ed.shown(), w, ed.cam.z), t = hit?.host ? board.get(hit.host) : hit;
      g.to = w;
      // (Not a timeline: a line led over one goes to what's on it, or stays where it's let go.)
      g.target = t && t.id !== g.from && !t.tl ? t.id : null;
      ed.requestRender();
      return;
    }
    case 'linkStretch': {
      // A right-angled link's stretch follows the pointer across (once it's moved a little).
      const a = g.pts[g.k], b = g.pts[g.k + 1], flat = Math.abs(a.y - b.y) <= 0.5;
      if (!g.moved && Math.abs(flat ? w.y - g.start.y : w.x - g.start.x) * ed.cam.z < 3) return;
      // Pinned to the sides it ran out of and into, so its bends don't send it round another way.
      const l = board.getLink(g.id), from = l && board.get(l.from), to = l && board.get(l.to);
      const sides = !g.moved && l && from && to && !l.fromSide ? { fromSide: nearestSide(from, center(to)), toSide: nearestSide(to, center(from)) } : {};
      g.moved = true;
      board.updateLink(g.id, { via: movedStretch(g.pts, g.k, Math.round(flat ? w.y : w.x)), ...sides });
      return;
    }
    case 'linkNode': {
      // A link's node follows the pointer, the line through it (a new one put in first).
      if (g.add) { g.via = [...g.via.slice(0, g.node), w, ...g.via.slice(g.node)]; g.add = false; }
      const via = g.via.map((p, i) => (i === g.node ? { x: Math.round(w.x), y: Math.round(w.y) } : p));
      board.updateLink(g.id, { via });
      return;
    }
    case 'relink': {
      // Taken by its head or by its line ("Линии", src/labs), it starts going once dragged 5 px: a press
      // with a twitch only picks it (to colour it, say), keeping where it goes.
      if (!g.going) {
        if (Math.hypot(w.x - g.from.x, w.y - g.from.y) * ed.cam.z < 5) return;
        g.going = true;
      }
      // Over the item it went to, nothing's lit until it's been taken off it once (more than a twitch).
      const l = board.getLink(g.id), t = hitItem(ed.shown(), w, ed.cam.z);
      // (Moved along it further than a twitch, the end's to go somewhere else on it.)
      const held = g.start ? l?.from : l?.to, other = g.start ? l?.to : l?.from, far = Math.hypot(w.x - g.from.x, w.y - g.from.y) * ed.cam.z > 12;
      if (t?.id !== held && far) g.away = true;
      g.to = w;
      // (On its other end's item too: it turns round, the arrow going into that.)
      g.target = t && !t.tl && (g.away || far) && (t.id !== other || t.id !== held) ? t.id : null;
      ed.requestRender();
      return;
    }
    case 'draw': {
      // Coalesced events keep fast strokes smooth; skip points closer than a pixel and a half. Each taken
      // halfway from the last towards the pointer (a steadied hand: its tremor smoothed out; the pointer's
      // own last place added once let go, see addInk).
      for (const ev of e.getCoalescedEvents?.() ?? [e]) {
        const l = ed.local(ev), raw = ed.toWorld(l.x, l.y), last = g.pts[g.pts.length - 1];
        const p = { x: last.x + (raw.x - last.x) * (1 - STEADY), y: last.y + (raw.y - last.y) * (1 - STEADY) };
        g.end = raw;
        if (Math.hypot(p.x - last.x, p.y - last.y) * ed.cam.z >= 1.5) g.pts.push(p);
      }
      ed.requestRender();
      return;
    }
    case 'erase':
      eraseAlong(ed, g.last, w);
      g.last = w;
      return;
    case 'tab':
      // Dragged off its half circle: a link from that side, as from a link dot.
      if (Math.hypot(w.x - g.start.x, w.y - g.start.y) * ed.cam.z > 4) {
        ed.gesture = { type: 'link', from: g.id, fromSide: g.side, to: w, target: null };
        moveGesture(ed, ed.gesture, e, sp, w);
      }
      return;
    case 'place':
      // «Текст рамкой» (src/labs): the text tool dragged, a box its text will fill the width of.
      if (g.tool === 'text' && labOn('textBox') && (g.to || Math.hypot(w.x - g.at.x, w.y - g.at.y) * ed.cam.z > 4)) { g.to = w; ed.requestRender(); }
      return;
    case 'marquee': {
      g.rect = normRect(g.start, w);
      // Drawn with Z held, it's where to zoom to, not what to pick ("Зум рамкой", src/labs).
      if (g.zoom) { ed.requestRender(); return; }
      ed.setPicking(true);
      const next = new Set(g.base), rect = g.rect;
      // A frame is taken in whole; a timeline (wide as it is) just touched, by a box started off it (one
      // started on it picks what lies on it).
      const whole = (it: Item) => it.type === 'frame' && !(it.tl && !pointInRect(g.start, it));
      const inside = (it: Item) => (whole(it) ? rectContains(rect, boxOf(it)) : rectsIntersect(rect, boxOf(it)));
      const shown = ed.shown(), any = shown.some(inside);
      for (const it of shown) {
        // A mind map branch the box takes in picks the node it leads to, only while the box has no
        // item in it yet: once it has, it's the items it takes in.
        const up = !any && it.type === 'mind' && it.parent ? board.get(it.parent) : undefined;
        if (inside(it) || (up && branchCrosses(up, it, rect))) next.add(it.id);
      }
      // And the links it runs into.
      for (const l of ed.shownLinks()) {
        const shape = linkShape(l, (id) => board.get(id));
        if (shape && pathCrosses(shape.pts, g.rect)) next.add(l.id);
      }
      ed.setSelection(next);
      return;
    }
  }
}

/** Whether a point is on a mind map node's text: inside its padding (but no more than 10 in). */

/** A mind map branch hung from another node, laid out there: on a central topic the way of the side
 *  `at` is nearest to (up or down only if it grows that way), on another the side it's on. A folded node
 *  unfolds to show it. */
function hangBranch(ed: Editor, id: string, to: string, at: Point): void {
  const board = ed.board, target = board.get(to);
  if (!target) return;
  const dx = (at.x - target.x) / target.w - 0.5, dy = (at.y - target.y) / target.h - 0.5;
  const upright = !target.parent && Math.abs(dy) > Math.abs(dx) && mindWays(target).includes(dy > 0 ? 'down' : 'up');
  const toward = upright ? (dy > 0 ? 'down' : 'up') : dx >= 0 ? 1 : -1;
  const moves = moveBranch(id, to, board.list(), toward, at);
  board.transact(() => {
    board.update(id, { parent: to });
    moves.forEach((p, k) => board.update(k, p));
    const way = mindWay(board.get(id)!, target);
    if (foldedWays(target, target.parent ? board.get(target.parent) : undefined).includes(way)) board.update(target.id, folding(target, way, false));
  });
}

/** The gesture let go of. */
export function endGesture(ed: Editor, g: Gesture, e: PointerEvent): void {
  const board = ed.board;
  switch (g.type) {
    case 'nib':
      nibRelease(ed);
      return;
    case 'pathNode':
      board.endGesture();
      return;
    case 'pinch':
      return;
    case 'pan':
      if (g.tap && !g.moved && (ed.selection.size || ed.pickedLines.length)) {
        ed.pickedLines = [];
        ed.setSelection([]);
      }
      return;
    case 'drag':
      if (g.sub !== undefined && g.moved) {
        const it = board.get(g.id);
        setSubDrag(null);
        if (it && g.subTo !== undefined) { moveSub(board, it, g.sub, g.subTo); ed.hotPlus = null; }
        ed.requestRender();
        return;
      }
      if (g.moved) {
        // What was dragged into a frame is in it now, and what was dragged out of one is out.
        ed.settle([...ed.selection].map((id) => board.get(id)?.host ?? id));
        // A mind map branch let go nearer another family: it hangs from that one now.
        const lead = board.get(g.id);
        if (g.mindTo && lead?.parent && g.mindTo !== lead.parent) hangBranch(ed, g.id, g.mindTo, { x: lead.x + lead.w / 2, y: lead.y + lead.h / 2 });
        // A mind map node let go by its own family: back where it was, unless its map's nodes may be moved
        // by hand («Передвигать вручную»); moved so, its map no longer laid out round what's folded.
        else if (lead?.type === 'mind' && lead.parent) {
          const root = mindRoot(lead, (k) => board.get(k));
          if (!root.mfree) board.transact(() => g.orig.forEach((o, k) => board.update(k, { x: o.x, y: o.y })));
          else if (!root.mhand) board.update(root.id, { mhand: true });
        }
        timelineSides(ed, [...g.orig.keys()]);
        board.endGesture();
        noteMindMoved(ed, [...ed.selection]);
        // Picked by the press that dragged it: let go, not picked (no frame, no panel; a click picks it), what
        // was picked before picked again, its panel back.
        if (g.fresh) ed.setSelection((g.was ?? []).filter((id) => board.get(id) || board.getLink(id)));
      } else if (g.stage !== undefined) {
        // A kanban's stage clicked, not dragged by it («Канбан», src/labs): what was picked before picked
        // again, and the stage's menu.
        ed.setSelection(g.was ?? []);
        window.dispatchEvent(new CustomEvent('planx:stage', { detail: { id: g.id, i: g.stage } }));
      } else if (g.url) {
        // A link on a part of its text, clicked ("Ссылка в тексте", src/labs): opened in a new tab.
        window.open(g.url, '_blank', 'noopener');
      } else if (g.tap) {
        // A task's button, clicked (`tap`: where on screen, for a popup): what it does.
        // (A subtask's text clicked twice: its tick as it was, it typed in.)
        const it = board.get(g.id), part = it && taskPartAt(it, g.start);
        if (it && g.dbl && typeof part === 'object' && part && !part.tick && !part.del) { toggleSub(board, it, part.sub); ed.startEditing(g.id, part.sub + 1, 'end'); }
        else if (it) {
          pressTask(ed, it, g.start, g.tap);
          // What's under the pointer now lit (opened or closed, what was there may have moved off it; what's
          // still there stays lit).
          if (ed.pointerAt) updateCursor(ed, ed.toWorld(ed.pointerAt.x, ed.pointerAt.y), e.altKey);
          else ed.hotPlus = null;
          ed.requestRender();
        }
      } else if (board.get(g.id)?.code && !board.get(g.id)?.text && !g.dbl && ed.editingId !== g.id) {
        // A block of code with nothing in it ("Код", src/labs), clicked: typed in at once, to paste into.
        ed.startEditing(g.id, null, 'end');
      } else if (g.dbl) {
        const it = board.get(g.id);
        // A group picked («Группы», src/labs/groups.ts): a level in, the group within it that's double
        // clicked in, or that alone.
        const inner = labOn('groups') && it ? levelIn(board.list(), ed.selection, it) : null;
        if (inner) { ed.setSelection(inner, false); return; }
        // A Word document's page ("Документы Word"): the document opens whole.
        if (labOn('docx') && it?.doc) { openDoc(it.id); return; }
        // A path drawn with "Перо" (src/labs): its nodes to change.
        if (labOn('nib') && editablePath(it)) { startNodeEdit(ed, it.id); return; }
        // "Замена двойным кликом": an emoji, an icon or a shape shows its neighbours, a shape opening for
        // typing too (unless that was the instance it's in being entered).
        if (swapKind(it)) {
          openSwap(g.id);
          if (it!.type !== 'emoji' && it!.type !== 'icon' && !g.enter) ed.startEditing(g.id, null);
          return;
        }
        // A frame folds on a double click, and unfolds (a component too, not an instance); on its title
        // over it, that opens for typing.
        // (A timeline neither folds nor has a title.)
        if (it?.tl) { /* nothing */ }
        else if (it?.type === 'frame' && !it.inst && (it.fold || toLocal(it, g.start).y >= it.y)) ed.setFolded(it.id, !it.fold);
        // A task's header (but its title, ring and arrow) goes on to the next of its views.
        else if (it?.type === 'task' && taskPartAt(it, g.start) === 'head') nextView(board, it, taskOpen());
        else if (!it?.inst) ed.startEditing(g.id, it?.type === 'table' ? cellAt(it, g.start) : it?.type === 'task' ? taskFieldAt(it, g.start) : null);
      } else if (g.again && !g.cell && clickTypes(board.get(g.id), g.start)) {
        // Picked already, clicked again on its text: typed in, as on a double click.
        const it = board.get(g.id)!;
        ed.startEditing(g.id, it.type === 'task' ? taskFieldAt(it, g.start) : null);
      } else if (g.again && !g.cell && under(ed, g.id, g.start)) {
        // "Клик сквозь": what's under it there is picked instead.
        ed.setSelection([under(ed, g.id, g.start)!.id]);
      } else if (g.cell) {
        const it = board.get(g.id), i = it ? cellAt(it, g.start) : null;
        if (i !== null) ed.pickCell(i, e.shiftKey ? 'range' : e.metaKey || e.ctrlKey ? 'toggle' : 'one');
      } else if (board.get(g.id)?.type === 'mind' && ed.selection.size === 1 && !e.shiftKey && onMindText(board.get(g.id)!, g.start)) {
        // A mind map node opens for typing on a single click on its text (inside its padding), the caret
        // after its text; on its edge, it's only picked (to be deleted, say).
        ed.startEditing(g.id, null, 'end');
      }
      return;
    case 'resize':
    case 'rotate':
    case 'tableLine':
      board.endGesture();
      return;
    case 'place': {
      if (g.tool === 'timeline') { ed.addTimeline(g.at); return; }
      if (g.tool === 'form') { ed.addForm(g.at); return; }
      if (g.tool === 'poll') { ed.addPoll(g.at); return; }
      if (g.tool === 'kanban') { ed.addKanban(g.at); return; }
      const d = DEFAULTS[g.tool];
      const box = g.to && normRect(g.at, g.to);
      const it = g.tool === 'text'
        // (Dragged, «Текст рамкой»: the box, at its top left, its size; a line tall at least.)
        ? box ? ed.newItem('text', box.x, box.y, { w: Math.max(40, Math.round(box.w)), h: Math.round(box.h), tb: true }) : ed.newItem('text', g.at.x - 4, g.at.y - 14)
        : ed.newItem(g.tool, g.at.x - d.w / 2, g.at.y - d.h / 2, g.tool === 'table' ? freshTable() : g.tool === 'mind' ? { text: MIND_TOPIC } : {});
      if (it.type === 'text') it.h = it.tb ? Math.max(it.h, itemTextHeight(it)) : itemTextHeight(it);
      if (it.type === 'mind') Object.assign(it, mindSize(it), { x: Math.round(g.at.x - mindSize(it).w / 2) });
      if (it.type === 'task') Object.assign(it, freshTask(board, it, g.at));
      ed.addItem(it);
      ed.setTool('select');
      ed.setSelection([it.id]);
      // A new table comes with its pills out ("Перестановка в таблице", src/labs), as one dropped off the
      // rail: no cell open for typing yet, or they'd stay away.
      if (it.type === 'table') { if (labOn('tableMove')) showGrips(ed, it.id); return; }
      ed.startEditing(it.id);
      return;
    }
    case 'create': {
      const it = board.get(g.id);
      if (it) {
        const d = DEFAULTS[it.type], side = ['rect', 'ellipse', 'polygon'].includes(it.type) && shapeStyle().square ? Math.max(d.w, d.h) : 0;
        const dw = side || d.w, dh = side || d.h;
        if (it.w < 10 && it.h < 10) board.update(it.id, { w: dw, h: dh, x: Math.round(g.origin.x - dw / 2), y: Math.round(g.origin.y - dh / 2) });
        else board.update(it.id, { w: Math.max(it.w, 30), h: Math.max(it.h, 30) });
        ed.settleNew(it.id);
      }
      board.endGesture();
      ed.setTool('select');
      ed.setSelection([g.id]);
      if (it?.type === 'frame') ed.startEditing(g.id);
      return;
    }
    case 'link':
      if (g.target && !board.hasLink(g.from, g.target)) {
        const target = linkBox(board.get(g.target)!);
        // Running the way the last one was made to; into the side it's let go by, as far along it (its
        // middle when near that), pinned by its sides then even if drawn without.
        const { side, at } = anchorAt(target, g.to, 10 / ed.cam.z), src = board.get(g.from);
        // Both on a timeline, the tool not set another way («Угловые линии на таймлайне», src/labs): right
        // angles, out of its right side into the other's left (its right if it starts before this one does;
        // the other way, it being to the left).
        const tl = !ed.linkStyle && labOn('tlLinks') && src && timelineOf(ed, src) && timelineOf(ed, board.get(g.target)!);
        const fs: Side = g.fromSide === 'top' || g.fromSide === 'bottom' ? g.fromSide : g.fromSide ?? (src && center(target).x < center(linkBox(src)).x ? 'left' : 'right');
        const l: Link = tl
          ? { id: uid(), from: g.from, to: g.target, fromSide: fs, toSide: fs === 'right' ? (target.x >= src!.x ? 'left' : 'right') : fs === 'left' ? 'right' : side, style: 'elbow' }
          : g.fromSide || at !== 0.5
          ? { id: uid(), from: g.from, to: g.target, fromSide: g.fromSide ?? (src ? nearestSide(src, center(target)) : 'right'), toSide: side, ...(at !== 0.5 && { toAt: at }) }
          : { id: uid(), from: g.from, to: g.target };
        if (ed.linkStyle) l.style = ed.linkStyle;
        board.addLink(l);
        ed.setTool('select');
        ed.setSelection([l.id]);
      } else if (!g.target && labOn('lineEnd')) {
        // Let go on nothing («Линия в пустоту», src/labs): to an unseen point there (not on its own item).
        const src = board.get(g.from);
        if (src && !pointInRect(g.to, linkBox(src))) {
          // (Curved as it was drawn: out of the side it was pulled from, into the point facing it.)
          // An arc, as it was drawn (straight or right-angled if the tool's set so); smooth, to be chosen.
          const l: Link = { id: uid(), from: g.from, to: '', fromSide: g.fromSide ?? nearestSide(src, g.to), toSide: facing(g.to, center(linkBox(src))), style: ed.linkStyle ?? 'arc' };
          board.transact(() => { l.to = ed.addLineEnd(g.to); board.addLink(l); });
          ed.setTool('select');
          ed.setSelection([l.id]);
        }
      }
      ed.requestRender();
      return;
    case 'linkNode':
    case 'linkStretch':
      board.endGesture();
      return;
    case 'relink': {
      // Let go on another item, the arrow goes to it; taken off its item (by its head or its line) and let
      // go on none, it's gone. A click on its line just picks it.
      const l = board.getLink(g.id), target = g.target ? board.get(g.target) : undefined;
      // («Линия в пустоту», src/labs: the end taken was an unseen point: it goes once the end's on an item.)
      const held = l && board.get(g.start ? l.from : l.to), point = held?.pt ? held : undefined;
      // (An unseen point's end let go on the line's own other item: nothing to turn round to, it stays.)
      if (l && g.going && target && point && target.id === (g.start ? l.to : l.from)) { /* as it was */ }
      else if (l && g.going && target) {
        board.transact(() => {
          relinkTo(ed, l, target, g.to, !!g.start);
          if (point && !board.linkList().some((k) => k.id !== l.id && (k.from === point.id || k.to === point.id))) board.remove([point.id]);
        });
      } else if (l && g.away && !target && g.going && labOn('lineEnd')) {
        // Let go on nothing: the end stays there, at an unseen point (moved, if it was one already).
        if (point) board.update(point.id, { x: Math.round(g.to.x), y: Math.round(g.to.y) });
        else board.transact(() => {
          const id = ed.addLineEnd(g.to);
          // (Curved: its other end pinned to a side, as it's drawn; the point's facing it.)
          const other = board.get(g.start ? l.to : l.from), oc = other ? center(linkBox(other)) : g.from;
          const otherSide = (g.start ? l.toSide : l.fromSide) ?? (other ? nearestSide(other, g.to) : undefined), mine = facing(g.to, oc);
          board.relink(l.id, g.start
            ? { from: id, to: l.to, fromSide: mine, toSide: otherSide, toAt: l.toAt }
            : { from: l.from, to: id, fromSide: otherSide, fromAt: l.fromAt, toSide: mine });
        });
      } else if (l && g.away && !target && g.going) {
        board.remove([l.id]);
        ed.setSelection([]);
      }
      ed.requestRender();
      return;
    }
    case 'mindMove':
      // The branch hangs from the node it's dropped on now, on a central topic the way of the side it's
      // let go nearest to: right, left, down or up. A folded node unfolds to show it.
      if (g.target) hangBranch(ed, g.id, g.target, g.to);
      ed.requestRender();
      return;
    case 'tab':
      // Clicked: a copy that way.
      ed.duplicateToward(g.side);
      return;
    case 'marquee':
      if (g.zoom) zoomToBox(ed, g.rect);
      ed.requestRender();
      return;
    case 'draw':
      addInk(ed, g.tool, g.end ? [...g.pts, g.end] : g.pts);
      return;
    case 'erase':
      board.endGesture();
      return;
  }
}

/** Drops the gesture going on (a second finger came, starting a pinch): a figure being drawn out
 *  goes, what was changed stays one undo step. */
export function cancelGesture(ed: Editor): void {
  const g = ed.gesture;
  if (!g) return;
  if (g.type === 'create') { ed.board.remove([g.id]); ed.board.endGesture(); }
  if ((g.type === 'drag' && g.moved) || g.type === 'resize' || g.type === 'rotate' || g.type === 'erase' || g.type === 'tableLine' || g.type === 'linkNode' || g.type === 'linkStretch' || g.type === 'pathNode') ed.board.endGesture();
  ed.gesture = null;
  ed.setMoving(false);
  ed.setPicking(false);
  ed.requestRender();
}

/** Turns a drawn line into an ink item boxed around it, its points kept relative to the box. */
function addInk(ed: Editor, tool: PenTool, drawn: Point[]): void {
  const style = ed.penStyle(tool), sw = style.size / ed.cam.z;
  // What hardly changes its shape left out (within 0.6 of a pixel on screen): fewer points, a smoother curve through them.
  const pts = simplified(drawn, 0.6 / ed.cam.z);
  // Fully see-through, nothing would show: no line left lying about unseen.
  if (style.op === 0) return;
  let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
  for (const p of pts) { x1 = Math.min(x1, p.x); y1 = Math.min(y1, p.y); x2 = Math.max(x2, p.x); y2 = Math.max(y2, p.y); }
  const x = Math.floor(x1 - sw / 2), y = Math.floor(y1 - sw / 2);
  const w = Math.ceil(x2 + sw / 2) - x, h = Math.ceil(y2 + sw / 2) - y;
  const r = (v: number) => Math.round(v * 10) / 10;
  ed.addItem(ed.newItem('ink', x, y, {
    w, h, iw: w, sw: r(sw), color: style.color, hl: tool === 'marker' || undefined, fo: style.op,
    pts: pts.flatMap((p) => [r(p.x - x), r(p.y - y)]),
  }));
}

/** How far each point of a line drawn stays where it was rather than going to the pointer (0: none). */
const STEADY = 0.5;

/** A line's points with those it hardly turns at left out (Ramer–Douglas–Peucker): none further than `eps`
 *  off the line through the ones kept either side. */
function simplified(pts: Point[], eps: number): Point[] {
  if (pts.length < 3) return pts;
  const keep = new Uint8Array(pts.length);
  keep[0] = keep[pts.length - 1] = 1;
  const stack: Array<[number, number]> = [[0, pts.length - 1]];
  while (stack.length) {
    const [i, j] = stack.pop()!, a = pts[i], b = pts[j], dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy) || 1;
    let far = -1, most = eps;
    for (let k = i + 1; k < j; k++) {
      const d = Math.abs(dy * (pts[k].x - a.x) - dx * (pts[k].y - a.y)) / len;
      if (d > most) { most = d; far = k; }
    }
    if (far >= 0) { keep[far] = 1; stack.push([i, far], [far, j]); }
  }
  return pts.filter((_, k) => keep[k]);
}

/** Removes every stroke the eraser touches between two points, checked at steps narrower than the eraser. */
export function eraseAlong(ed: Editor, a: Point, b: Point): void {
  // "Ластик кружком" (src/labs): only what's under its circle.
  if (labOn('softEraser') && !eraserStyle().whole) { eraseArea(ed, a, b); return; }
  const tol = 8 / ed.cam.z, steps = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / tol));
  const gone = new Set<string>();
  for (const it of ed.board.list()) {
    if (it.type !== 'ink' || isLocked(it)) continue;
    const box = { x: it.x - tol, y: it.y - tol, w: it.w + tol * 2, h: it.h + tol * 2 };
    for (let i = 0; i <= steps; i++) {
      const p = { x: a.x + (b.x - a.x) * i / steps, y: a.y + (b.y - a.y) * i / steps };
      if (pointInRect(toLocal(it, p), box) && nearInk(it, p, tol)) { gone.add(it.id); break; }
    }
  }
  if (gone.size) ed.board.remove(gone);
}

/**
 * A link's end let go on `target` at `p`: led there, to the side it's let go by and as far along it
 * (its middle within 10 px of it). Its start taken, it turns round: from its other end to there; its
 * one arrowhead (wherever it was) going there. Pinned by its sides only when it was, or now that it's let go off a side's middle.
 */
function relinkTo(ed: Editor, l: Link, target: Item, p: Point, start: boolean): void {
  const board = ed.board, from = start ? l.to : l.from;
  const { side, at } = anchorAt(target, p, 10 / ed.cam.z), keep = board.get(from);
  // Its end let go on the item it's at already: only somewhere else on it. (Its start let go on its own
  // item turns it round, as anywhere: the arrow into that.)
  if (!start && target.id === l.to) {
    const sided = !!l.fromSide || at !== 0.5, other = board.get(l.from);
    const otherSide = l.fromSide ?? (other ? nearestSide(other, center(target)) : undefined);
    board.relink(l.id, { from: l.from, to: l.to, fromSide: sided ? otherSide : undefined, fromAt: sided ? l.fromAt : undefined, toSide: sided ? side : undefined, toAt: sided && at !== 0.5 ? at : undefined });
    return;
  }
  // On its other end's item: it turns round, from the item the end was taken from, into that.
  if (target.id === from) {
    const heldId = start ? l.from : l.to, heldSide = start ? l.fromSide : l.toSide, heldAt = start ? l.fromAt : l.toAt;
    if (heldId === from || board.hasLink(heldId, from)) return;
    const sided = !!l.fromSide || at !== 0.5, held = board.get(heldId);
    board.transact(() => {
      if (l.heads === 'start') board.updateLink(l.id, { heads: undefined });
      board.relink(l.id, {
        from: heldId, to: from,
        fromSide: sided ? heldSide ?? (held ? nearestSide(held, center(target)) : undefined) : undefined, fromAt: sided ? heldAt : undefined,
        toSide: sided ? side : undefined, toAt: sided && at !== 0.5 ? at : undefined,
      });
    });
    return;
  }
  if (board.hasLink(from, target.id)) return;
  // (The end staying keeps its side and place, as the start if it was the end.)
  const fromSide = start ? l.toSide : l.fromSide, fromAt = start ? l.toAt : l.fromAt;
  const sided = !!l.fromSide || at !== 0.5;
  // One arrowhead goes with the end that's led on (at the end now): the arrow goes into what it's led to.
  board.transact(() => {
    if (l.heads === 'start') board.updateLink(l.id, { heads: undefined });
    board.relink(l.id, {
      from, to: target.id,
      fromSide: sided ? fromSide ?? (keep ? nearestSide(keep, center(target)) : undefined) : undefined,
      toSide: sided ? side : undefined,
      fromAt: sided ? fromAt : undefined,
      toAt: sided && at !== 0.5 ? at : undefined,
    });
  });
}

/** «Линия в пустоту» (src/labs): the side of a point (of no size) facing `to`. */
function facing(at: Point, to: Point): Side {
  const dx = to.x - at.x, dy = to.y - at.y;
  return Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'bottom' : 'top';
}
