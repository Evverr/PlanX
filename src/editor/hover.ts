import type { Item, Side } from '../model/types';
import { ROTATABLE } from '../model/types';
import type { Point } from '../canvas/geometry';
import { hitItem, hitLink, onAudioButton, onTaskBox, pointInRect, sidePoint, SIDES, toLocal } from '../canvas/geometry';
import { DOT_GAP, HANDLE } from '../canvas/renderer';
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
  if (it.type === 'mind' || it.fold) return false;
  const hs = ed.reach((HANDLE + 6) / 2) * 2, off = 3 / ed.cam.z;
  return pointInRect(toLocal(it, w), { x: it.x + it.w + off - hs / 2, y: it.y + it.h + off - hs / 2, w: hs, h: hs });
}

/** Which of a mind map node's buttons is under the point, once they're showing. */
export function plusAt(ed: Editor, it: Item, w: Point): MindButtonAt | null {
  if (it.type !== 'mind' || ed.plusFade() === 0) return null;
  // The nearest within reach: the "+" for a branch and the chevron past it are close.
  let best: MindButtonAt | null = null, near = Infinity;
  const fresh = ed.chevronless?.startsWith(`${it.id}:`) ? ed.chevronless.slice(it.id.length + 1) as Way : undefined;
  for (const b of mindButtons(it, (id) => ed.board.get(id), ed.cam.z, branchWays(it, ed.board.list()), fresh)) {
    const d = Math.hypot(w.x - b.x, w.y - b.y);
    if (d <= Math.max(b.r * 1.5, ed.reach(0)) && d < near) { best = b; near = d; }
  }
  return best;
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
  if (!ROTATABLE.includes(it.type) || it.fold) return false;
  const p = toLocal(it, w);
  return !pointInRect(p, it) && Math.hypot(p.x - (it.x + it.w), p.y - it.y) <= ed.reach(ROTATE_ZONE);
}

/** The link dot under the point, if any. */
export function dotAt(ed: Editor, it: Item, w: Point): Side | null {
  if (it.type === 'mind') return null;
  const r = ed.reach(16.5);  // well beyond the dot itself, so it is easy to catch
  for (const side of SIDES) {
    const p = sidePoint(it, side, DOT_GAP / ed.cam.z);
    if (Math.hypot(w.x - p.x, w.y - p.y) <= r) return side;
  }
  return null;
}

/** The frame button under the point, of the topmost frame in sight that has one there. */
export const frameButtonUnder = (ed: Editor, w: Point) => frameButtonAt(ed.shown(), w, ed.reach(4));

/** With the pointer over the board and nothing being done: what's under it lights up (a link dot,
 *  a table line it has rested on, a mind map button) and the cursor says what a press would do. */
export function updateCursor(ed: Editor, w: Point, alt: boolean): void {
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
  const plus = picked ? plusAt(ed, picked, w) : null, hot = plus && buttonKey(plus);
  if (hot !== ed.hotPlus) { ed.hotPlus = hot; ed.requestRender(); }
  if (plus || frameButtonUnder(ed, w) || foldBadgeAt(ed, w)) cursor = 'pointer';
  else if (dot) cursor = 'crosshair';
  else if (single && onHandle(ed, single, w)) cursor = 'nwse-resize';
  else if (single && onRotate(ed, single, w)) cursor = rotateCursor((single.rot ?? 0) + 90);
  else if (line) cursor = line.axis === 'col' ? 'col-resize' : 'row-resize';
  else if (hitLink(ed.shownLinks(), (id) => ed.board.get(id), w, ed.cam.z)) cursor = 'pointer';
  else {
    const hit = hitItem(ed.shown(), w, ed.cam.z);
    if ((hit?.type === 'task' && onTaskBox(hit, w, ed.cam.z)) || (hit?.type === 'audio' && onAudioButton(hit, w))) cursor = 'pointer';
    else if (hit && !isLocked(hit)) cursor = alt ? 'copy' : 'move';
  }
  ed.canvas.style.cursor = cursor;
}
