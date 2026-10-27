import type { TableLine } from '../model/table';
import { colsOf, rowsOf } from '../model/table';
import { center, hitItem, hitLink, onAudioButton, onTaskBox } from '../canvas/geometry';
import { toggleAudio } from '../canvas/audio';
import { dotAt, foldBadgeAt, frameButtonUnder, linkEndAt, onHandle, onInstancePlus, onRotate, plusAt } from './hover';
import { grabbableLine } from './tables';
import { cancelGesture, eraseAlong } from './gestures';
import { isPoly } from './tools';
import type { Editor } from './editor';
import { isLocked } from '../labs/labs';

/** A press on the board: works out what it starts (a gesture followed till it's let go) or does at
 *  once, from the tool, what's under it and what's selected. */
export function press(ed: Editor, e: PointerEvent): void {
  const board = ed.board;
  ed.byFinger = e.pointerType === 'touch';
  ed.stopEditing();
  // Same as in newItem: once someone works on the board, leave the camera to them.
  ed.needsFit = false;
  const sp = ed.local(e);
  ed.canvas!.setPointerCapture(e.pointerId);
  ed.pointers.set(e.pointerId, sp);

  if (ed.pointers.size === 2) {
    cancelGesture(ed);
    const [p, q] = [...ed.pointers.values()];
    ed.gesture = { type: 'pinch', d0: Math.hypot(p.x - q.x, p.y - q.y) || 1, z0: ed.cam.z, anchor: ed.toWorld((p.x + q.x) / 2, (p.y + q.y) / 2) };
    return;
  }
  if (ed.pointers.size > 2) return;

  const w = ed.toWorld(sp.x, sp.y);
  const items = board.list();
  // A frame takes clicks anywhere on its empty area, but links drawn across it come first.
  let hit = hitItem(ed.shown(), w, ed.cam.z);
  const link = hit && hit.type !== 'frame' ? null : hitLink(ed.shownLinks(), (id) => board.get(id), w, ed.cam.z);
  if (link) hit = null;
  // An arrowhead taken hold of leads its arrow to another item, let go on it.
  const end = ed.tool === 'select' && e.button === 0 && !e.shiftKey && !ed.spaceDown && !ed.editingId ? linkEndAt(ed, w) : null;
  if (end) {
    ed.setSelection([end.id]);
    ed.gesture = { type: 'relink', id: end.id, from: w, to: w, target: null };
    // Held: the open hand closes.
    ed.canvas!.style.cursor = 'grabbing';
    return;
  }
  // First pick the instance; the next press enters it, without depending on double-click timing.
  // With a child picked, its siblings can be picked directly too. Shift keeps group selection.
  const inside = !!hit?.host && !e.shiftKey && ed.selection.size === 1
    && (ed.selection.has(hit.host) || board.get([...ed.selection][0])?.host === hit.host);
  const entering = inside && !!hit && !ed.selection.has(hit.id);
  if (hit?.host && !ed.selection.has(hit.id) && !inside) hit = board.get(hit.host) ?? hit;

  // A finger on the empty board moves the board, but not on the controls of what's selected (its
  // resize handle, link dots, turning corner, mind map buttons), on a folded mind map node's count
  // or on a table's line.
  const picked = ed.selection.size === 1 ? board.get([...ed.selection][0]) : undefined;
  const onControl = (!!picked && !ed.editingId && !isLocked(picked) && (onHandle(ed, picked, w) || !!dotAt(ed, picked, w) || onRotate(ed, picked, w) || !!plusAt(ed, picked, w) || onInstancePlus(ed, picked, w)))
    || !!foldBadgeAt(ed, w);
  const empty = ed.tool === 'select' && e.button === 0 && !ed.spaceDown && !e.shiftKey && !hit && !link && !onControl
    && !grabbableLine(ed, w, hit, e.pointerType) && !ed.editingId;
  // Pressed twice on the empty board: everything on it comes into view, as with the "show all" button.
  if (empty) {
    const now = performance.now(), last = ed.lastEmpty;
    ed.lastEmpty = { t: now, x: sp.x, y: sp.y };
    if (now - last.t < 380 && Math.hypot(sp.x - last.x, sp.y - last.y) < 12) {
      ed.lastEmpty = { t: 0, x: 0, y: 0 };
      ed.fit();
      return;
    }
  }
  const touchPan = e.pointerType === 'touch' && ed.tool === 'select' && !hit && !link && !onControl && !grabbableLine(ed, w, hit, e.pointerType);
  if (e.button === 1 || ed.spaceDown || ed.tool === 'hand' || touchPan) {
    // A finger on the empty board pans it; let go without moving, it's a tap that drops the selection.
    ed.gesture = { type: 'pan', sx: sp.x, sy: sp.y, cx: ed.cam.x, cy: ed.cam.y, tap: touchPan };
    ed.canvas!.classList.add('panning');
    return;
  }
  if (e.button !== 0) return;

  switch (ed.tool) {
    case 'sticky':
    case 'text':
    case 'task':
    case 'table':
    case 'mind':
      ed.gesture = { type: 'place', at: w, tool: ed.tool };
      return;
    case 'rect':
    case 'ellipse':
    case 'triangle':
    case 'rhombus':
    case 'pentagon':
    case 'star':
    case 'hexagon':
    case 'parallelogram':
    case 'trapezoid':
    case 'arrow':
    case 'cross':
    case 'frame': {
      board.beginGesture();
      const t = ed.tool;
      const it = isPoly(t) ? ed.newItem('polygon', w.x, w.y, { w: 1, h: 1, shape: t }) : ed.newItem(t, w.x, w.y, { w: 1, h: 1 });
      board.add(it);
      ed.gesture = { type: 'create', id: it.id, origin: w };
      return;
    }
    case 'link':
      if (hit) ed.gesture = { type: 'link', from: hit.id, fromSide: null, to: w, target: null };
      return;
    case 'pen':
    case 'marker':
      if (ed.selection.size) ed.setSelection([]);
      ed.gesture = { type: 'draw', tool: ed.tool, pts: [w] };
      ed.requestRender();
      return;
    case 'eraser':
      board.beginGesture();
      ed.gesture = { type: 'erase', last: w };
      eraseAlong(ed, w, w);
      return;
  }

  // Select tool.
  const single = ed.selection.size === 1 ? board.get([...ed.selection][0]) : undefined;
  const plus = single && plusAt(ed, single, w);
  if (single && plus) {
    if (plus.kind === 'move') ed.gesture = { type: 'mindMove', id: single.id, from: w, to: w, target: null };
    // Folded by its chevron, nothing's left picked: the map to look at.
    else if (plus.kind === 'fold') { ed.setCollapsed(single.id, plus.way!, true); ed.setSelection([]); }
    else ed.addMindNode(single.id, plus.kind, true);
    return;
  }
  // A picked component's "+" makes an instance of it.
  if (single && onInstancePlus(ed, single, w)) {
    ed.addInstance(single.id);
    return;
  }
  // A folded mind map node's count unfolds it (that way), and leaves nothing picked: the map to look at.
  const unfold = e.shiftKey ? null : foldBadgeAt(ed, w);
  if (unfold) {
    ed.setCollapsed(unfold.id, unfold.way, false);
    ed.setSelection([]);
    return;
  }
  const dot = single && !ed.editingId && !isLocked(single) ? dotAt(ed, single, w) : null;
  if (single && dot) {
    ed.gesture = { type: 'link', from: single.id, fromSide: dot, to: w, target: null };
    return;
  }
  if (single && !isLocked(single) && onHandle(ed, single, w)) {
    board.beginGesture();
    ed.gesture = { type: 'resize', id: single.id, start: w, orig: { ...single } };
    ed.setMoving(true);
    return;
  }
  if (single && !isLocked(single) && onRotate(ed, single, w)) {
    board.beginGesture();
    const c = center(single);
    // A frame turns with everything it holds, which keeps a list from then on.
    if (single.type === 'frame' && !single.members) board.update(single.id, { members: ed.membersOf(single) });
    const held = single.type === 'frame' ? [...ed.carried([single]).keys()].filter((id) => id !== single.id) : [];
    ed.gesture = {
      type: 'rotate', id: single.id, c, a0: Math.atan2(w.y - c.y, w.x - c.x), rot0: single.rot ?? 0,
      held: held.map((id) => board.get(id)!).map((i) => ({ id: i.id, c: center(i), rot0: i.rot ?? 0 })),
    };
    ed.setMoving(true);
    return;
  }
  // A table's lines resize the column or row before them, the table selected or not. Shift-clicking
  // picks several lines (or drops one); dragging any picked line moves them all.
  const tl = ed.editingId || entering ? null : grabbableLine(ed, w, hit, e.pointerType);
  if (tl) {
    const same = (l: TableLine) => l.id === tl.id && l.axis === tl.axis && l.index === tl.index;
    const picked = ed.pickedLines.filter((l) => l.id === tl.id), was = picked.some(same);
    // A click picks the line (it stays blue), Shift-click adds one or drops it; pressing a picked
    // line keeps the others picked, to drag them all.
    ed.pickedLines = e.shiftKey ? (was ? picked.filter((l) => !same(l)) : [...picked, tl]) : was ? picked : [tl];
    const table = board.get(tl.id)!;
    const lines = e.shiftKey || was ? ed.pickedLines : [tl];
    board.beginGesture();
    ed.hotLine = tl;
    ed.gesture = { type: 'tableLine', id: tl.id, start: w, lines, cols0: colsOf(table), rows0: rowsOf(table) };
    ed.setMoving(true);
    ed.requestRender();
    return;
  }
  if (ed.pickedLines.length) { ed.pickedLines = []; ed.requestRender(); }
  // A folded frame's button: a look at what it holds.
  const fb = e.shiftKey || (hit && hit.type !== 'frame') ? null : frameButtonUnder(ed, w);
  if (fb) {
    window.dispatchEvent(new CustomEvent('planx:peek', { detail: fb.id }));
    return;
  }
  // A task's checkbox ticks it off (or back on) instead of picking the task up.
  if (hit?.type === 'task' && !entering && !e.shiftKey && onTaskBox(hit, w, ed.cam.z)) {
    board.update(hit.id, { done: hit.done ? undefined : true });
    return;
  }
  // An audio note's button plays it (or stops it) instead of picking it up.
  if (hit?.type === 'audio' && !entering && !e.shiftKey && onAudioButton(hit, w)) {
    toggleAudio(hit, () => ed.requestRender());
    return;
  }
  if (hit) {
    const now = performance.now();
    const dbl = ed.lastTap.id === hit.id && now - ed.lastTap.t < 380 && !e.shiftKey;
    ed.lastTap = { id: hit.id, t: now };
    // A click on a cell of the table already selected picks that cell (on letting go, if not dragged).
    const cell = hit.type === 'table' && ed.selection.size === 1 && ed.selection.has(hit.id);
    if (cell) { /* keeps the table selected */ }
    else if (e.shiftKey) {
      const next = new Set(ed.selection);
      if (next.has(hit.id)) next.delete(hit.id); else next.add(hit.id);
      ed.setSelection(next);
    } else if (!ed.selection.has(hit.id)) ed.setSelection([hit.id]);
    ed.gesture = { type: 'drag', start: w, orig: ed.dragSet(items), moved: false, id: hit.id, dbl, cell };
    return;
  }
  ed.lastTap = { id: '', t: 0 };
  if (link) {
    if (e.shiftKey) {
      const next = new Set(ed.selection);
      if (next.has(link.id)) next.delete(link.id); else next.add(link.id);
      ed.setSelection(next);
    } else ed.setSelection([link.id]);
    return;
  }
  if (!e.shiftKey) ed.setSelection([]);
  ed.gesture = { type: 'marquee', start: w, base: new Set(ed.selection), rect: null };
}
