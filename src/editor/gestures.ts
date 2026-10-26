import type { Item, Link, Side } from '../model/types';
import { DEFAULTS, ROTATABLE, uid } from '../model/types';
import type { Point, Rect } from '../canvas/geometry';
import { angleOf, boxOf, hitItem, nearestSide, nearInk, normRect, pointInRect, rectContains, rectsIntersect, resizedAt, toLocal, turn } from '../canvas/geometry';
import { fitHeight, itemTextHeight, mindSize } from '../canvas/text';
import { cellAt, MIN_COL, MIN_ROW, movedLines, newTable, withScale, type TableLine } from '../model/table';
import { snapToGuides, type Guide } from '../canvas/guides';
import { branchCrosses, canMoveTo, foldedWays, folding, mindWay, moveBranch } from '../model/mind';
import { clamp, MAX_Z, MIN_Z } from './camera';
import { rotateCursor } from './cursors';
import { MIND_TOPIC, type PenTool } from './tools';
import type { Editor } from './editor';
import { isLocked } from '../labs/labs';

/** What a press on the board has started, followed till it's let go. */
export type Gesture =
  | { type: 'pan'; sx: number; sy: number; cx: number; cy: number; tap?: boolean; moved?: boolean }
  | { type: 'pinch'; d0: number; z0: number; anchor: Point }
  | { type: 'drag'; start: Point; orig: Map<string, Point>; moved: boolean; id: string; dbl: boolean; guides?: Guide[]; cell?: boolean }
  | { type: 'resize'; id: string; start: Point; orig: Item }
  | { type: 'rotate'; id: string; c: Point; a0: number; rot0: number; held: Array<{ id: string; c: Point; rot0: number }> }
  | { type: 'create'; id: string; origin: Point }
  | { type: 'place'; at: Point; tool: 'sticky' | 'text' | 'task' | 'table' | 'mind' }
  | { type: 'tableLine'; id: string; start: Point; lines: TableLine[]; cols0: number[]; rows0: number[] }
  | { type: 'link'; from: string; fromSide: Side | null; to: Point; target: string | null }
  | { type: 'relink'; id: string; to: Point; target: string | null }
  | { type: 'mindMove'; id: string; from: Point; to: Point; target: string | null }
  | { type: 'marquee'; start: Point; base: Set<string>; rect: Rect | null }
  | { type: 'draw'; tool: PenTool; pts: Point[] }
  | { type: 'erase'; last: Point };

/** How near (in screen pixels) an edge or middle has to come to another's to line up with it. */
const GUIDE_SNAP = 6;
/** How close to a square angle (in degrees) a turn sticks to it. */
const ROTATE_SNAP = 3;

/** The pointer moved to `sp` on screen (`w` on the board) with the gesture going on. */
export function moveGesture(ed: Editor, g: Gesture, e: PointerEvent, sp: Point, w: Point): void {
  const board = ed.board;
  switch (g.type) {
    case 'pinch': {
      const [p, q] = [...ed.pointers.values()];
      if (!q) return;
      const z = clamp(g.z0 * Math.hypot(p.x - q.x, p.y - q.y) / g.d0, MIN_Z, MAX_Z);
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
      if (!g.moved) {
        if (Math.hypot(dx, dy) * ed.cam.z < 3) return;
        g.moved = true;
        ed.setMoving(true);
        board.beginGesture();
        if (e.altKey) g.orig = ed.dragCopies(g.orig);
      }
      // With guides on (or Shift held as it's dragged), what's dragged lines up with what's on screen
      // around it when near.
      let sx = 0, sy = 0;
      g.guides = undefined;
      if (ed.guides || e.shiftKey) {
        const moving = [...g.orig].map(([id, o]) => { const it = board.get(id); return it && { ...it, x: o.x + dx, y: o.y + dy }; }).filter((i): i is Item => !!i);
        const bs = moving.map(boxOf), view = ed.viewRect();
        const x = Math.min(...bs.map((b) => b.x)), y = Math.min(...bs.map((b) => b.y));
        const box = bs.length ? { x, y, w: Math.max(...bs.map((b) => b.x + b.w)) - x, h: Math.max(...bs.map((b) => b.y + b.h)) - y } : null;
        const others = ed.shown().filter((i) => !g.orig.has(i.id) && i.type !== 'ink').map(boxOf).filter((r) => rectsIntersect(r, view));
        if (box) ({ dx: sx, dy: sy, guides: g.guides } = snapToGuides(box, others, GUIDE_SNAP / ed.cam.z));
      }
      board.transact(() => {
        for (const [id, o] of g.orig) board.update(id, { x: Math.round(o.x + dx + sx), y: Math.round(o.y + dy + sy) });
      });
      if (g.guides) ed.requestRender();
      return;
    }
    case 'resize': {
      const it = board.get(g.id);
      if (!it) return;
      const min = it.type === 'frame' ? 80 : it.type === 'ink' ? 4 : it.type === 'audio' ? 32 : it.type === 'icon' || it.type === 'emoji' || it.type === 'image' ? 16 : 40;
      // A turned item is stretched along its own sides.
      const { w: w0, h: h0 } = g.orig, d = turn({ x: w.x - g.start.x, y: w.y - g.start.y }, { x: 0, y: 0 }, -angleOf(g.orig));
      let nw = Math.max(min, Math.round(w0 + d.x));
      let nh = Math.max(min, Math.round(h0 + d.y));
      // Stickers, icons, emoji, drawings and pictures keep their proportions; Shift flips that: a sticker of any shape, or a shape kept in proportion.
      const keep = it.type === 'sticky' || it.type === 'image' ? !e.shiftKey : it.type === 'icon' || it.type === 'emoji' || it.type === 'ink' || it.type === 'audio' || e.shiftKey;
      if (keep) {
        const k = Math.max(nw / w0, nh / h0);
        nw = Math.round(w0 * k);
        nh = Math.round(h0 * k);
      }
      if (it.type === 'text') nh = itemTextHeight(it, it.text, nw);
      // A task can be made taller by hand, never shorter than its text.
      if (it.type === 'task') nh = Math.max(nh, fitHeight(it, it.text, nw)!);
      board.update(g.id, it.type === 'table' ? withScale(it, nw, nh) : g.orig.rot ? { w: nw, h: nh, ...resizedAt(g.orig, nw, nh) } : { w: nw, h: nh });
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
      let r = normRect(g.origin, w);
      if (e.shiftKey) { const s = Math.max(r.w, r.h); r = { ...r, w: s, h: s }; }
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
      const t = hitItem(ed.shown(), w, ed.cam.z);
      g.to = w;
      g.target = t && t.id !== g.from ? t.id : null;
      ed.requestRender();
      return;
    }
    case 'relink': {
      const t = hitItem(ed.shown(), w, ed.cam.z), from = board.getLink(g.id)?.from;
      g.to = w;
      g.target = t && t.id !== from ? t.id : null;
      ed.requestRender();
      return;
    }
    case 'draw': {
      // Coalesced events keep fast strokes smooth; skip points closer than a pixel and a half.
      for (const ev of e.getCoalescedEvents?.() ?? [e]) {
        const l = ed.local(ev), p = ed.toWorld(l.x, l.y), last = g.pts[g.pts.length - 1];
        if (Math.hypot(p.x - last.x, p.y - last.y) * ed.cam.z >= 1.5) g.pts.push(p);
      }
      ed.requestRender();
      return;
    }
    case 'erase':
      eraseAlong(ed, g.last, w);
      g.last = w;
      return;
    case 'marquee': {
      g.rect = normRect(g.start, w);
      const next = new Set(g.base);
      for (const it of ed.shown()) {
        const inside = it.type === 'frame' ? rectContains(g.rect, boxOf(it)) : rectsIntersect(g.rect, boxOf(it));
        // A mind map branch the box takes in picks the node it leads to.
        const up = it.type === 'mind' && it.parent ? board.get(it.parent) : undefined;
        if (inside || (up && branchCrosses(up, it, g.rect))) next.add(it.id);
      }
      ed.setSelection(next);
      return;
    }
  }
}

/** The gesture let go of. */
export function endGesture(ed: Editor, g: Gesture, e: PointerEvent): void {
  const board = ed.board;
  switch (g.type) {
    case 'pinch':
      return;
    case 'pan':
      if (g.tap && !g.moved && (ed.selection.size || ed.pickedLines.length)) {
        ed.pickedLines = [];
        ed.setSelection([]);
      }
      return;
    case 'drag':
      if (g.moved) {
        // What was dragged into a frame is in it now, and what was dragged out of one is out.
        ed.settle([...ed.selection]);
        board.endGesture();
      } else if (g.dbl) {
        const it = board.get(g.id);
        // In an instance, a double click picks what's under it there (its colours to change); another
        // opens its text for typing.
        const inner = it?.inst ? hitItem(ed.shown().filter((i) => i.host === it.id), g.start, ed.cam.z) : null;
        if (inner) {
          ed.setSelection([inner.id]);
        // A frame folds on a double click, and unfolds (a component too, not an instance); on its title
        // over it, that opens for typing.
        } else if (it?.type === 'frame' && !it.inst && (it.fold || toLocal(it, g.start).y >= it.y)) ed.setFolded(it.id, !it.fold);
        else if (!it?.inst) ed.startEditing(g.id, it?.type === 'table' ? cellAt(it, g.start) : null);
      } else if (g.cell) {
        const it = board.get(g.id), i = it ? cellAt(it, g.start) : null;
        if (i !== null) ed.pickCell(i, e.shiftKey ? 'range' : e.metaKey || e.ctrlKey ? 'toggle' : 'one');
      } else if (board.get(g.id)?.type === 'mind' && ed.selection.size === 1 && !e.shiftKey) {
        // A mind map node opens for typing on a single click, the caret after its text.
        ed.startEditing(g.id, null, 'end');
      }
      return;
    case 'resize':
    case 'rotate':
    case 'tableLine':
      board.endGesture();
      return;
    case 'place': {
      const d = DEFAULTS[g.tool];
      const it = g.tool === 'text'
        ? ed.newItem('text', g.at.x - 4, g.at.y - 14)
        : ed.newItem(g.tool, g.at.x - d.w / 2, g.at.y - d.h / 2, g.tool === 'table' ? newTable() : g.tool === 'mind' ? { text: MIND_TOPIC } : {});
      if (it.type === 'text') it.h = itemTextHeight(it);
      if (it.type === 'mind') Object.assign(it, mindSize(it), { x: Math.round(g.at.x - mindSize(it).w / 2) });
      ed.addItem(it);
      ed.setTool('select');
      ed.setSelection([it.id]);
      ed.startEditing(it.id);
      return;
    }
    case 'create': {
      const it = board.get(g.id);
      if (it) {
        const d = DEFAULTS[it.type];
        if (it.w < 10 && it.h < 10) board.update(it.id, { w: d.w, h: d.h, x: Math.round(g.origin.x - d.w / 2), y: Math.round(g.origin.y - d.h / 2) });
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
        const target = board.get(g.target)!;
        const l: Link = g.fromSide
          ? { id: uid(), from: g.from, to: g.target, fromSide: g.fromSide, toSide: nearestSide(target, g.to) }
          : { id: uid(), from: g.from, to: g.target };
        board.addLink(l);
        ed.setTool('select');
        ed.setSelection([l.id]);
      }
      ed.requestRender();
      return;
    case 'relink': {
      // Let go on another item, the arrow goes to it; anywhere else, it stays where it was.
      const l = board.getLink(g.id), target = g.target ? board.get(g.target) : undefined;
      if (l && target && target.id !== l.to && !board.hasLink(l.from, target.id)) board.retarget(l.id, target.id, nearestSide(target, g.to));
      ed.requestRender();
      return;
    }
    case 'mindMove':
      // The branch hangs from the node it's dropped on now, on a central topic the way of the side it's
      // let go nearest to: right, left, down or up. A folded node unfolds to show it.
      if (g.target) {
        const target = board.get(g.target)!;
        const dx = (g.to.x - target.x) / target.w - 0.5, dy = (g.to.y - target.y) / target.h - 0.5;
        const toward = !target.parent && Math.abs(dy) > Math.abs(dx) ? (dy > 0 ? 'down' : 'up') : dx >= 0 ? 1 : -1;
        const moves = moveBranch(g.id, g.target, board.list(), toward);
        board.transact(() => {
          board.update(g.id, { parent: g.target! });
          moves.forEach((p, id) => board.update(id, p));
          const way = mindWay(board.get(g.id)!, target);
          if (foldedWays(target, target.parent ? board.get(target.parent) : undefined).includes(way)) board.update(target.id, folding(target, way, false));
        });
      }
      ed.requestRender();
      return;
    case 'marquee':
      ed.requestRender();
      return;
    case 'draw':
      addInk(ed, g.tool, g.pts);
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
  if ((g.type === 'drag' && g.moved) || g.type === 'resize' || g.type === 'rotate' || g.type === 'erase' || g.type === 'tableLine') ed.board.endGesture();
  ed.gesture = null;
  ed.setMoving(false);
  ed.requestRender();
}

/** Turns a drawn line into an ink item boxed around it, its points kept relative to the box. */
function addInk(ed: Editor, tool: PenTool, pts: Point[]): void {
  const style = ed.penStyle(tool), sw = style.size / ed.cam.z;
  let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
  for (const p of pts) { x1 = Math.min(x1, p.x); y1 = Math.min(y1, p.y); x2 = Math.max(x2, p.x); y2 = Math.max(y2, p.y); }
  const x = Math.floor(x1 - sw / 2), y = Math.floor(y1 - sw / 2);
  const w = Math.ceil(x2 + sw / 2) - x, h = Math.ceil(y2 + sw / 2) - y;
  const r = (v: number) => Math.round(v * 10) / 10;
  ed.addItem(ed.newItem('ink', x, y, {
    w, h, iw: w, sw: r(sw), color: style.color, hl: tool === 'marker' || undefined,
    pts: pts.flatMap((p) => [r(p.x - x), r(p.y - y)]),
  }));
}

/** Removes every stroke the eraser touches between two points, checked at steps narrower than the eraser. */
export function eraseAlong(ed: Editor, a: Point, b: Point): void {
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
