import type { TableLine } from '../model/table';
import { colsOf, rowsOf } from '../model/table';
import { center, hitItem, hitLink, instanceBounds, linkShape, onAudioButton, onTaskBox, pointInRect } from '../canvas/geometry';
import { copyId } from '../model/components';
import { TASK_STATES } from '../model/builtins';
import { toggleAudio } from '../canvas/audio';
import { anyDotAt, dotAt, linkHandleAt, foldBadgeAt, frameButtonUnder, sideAt, linkEndAt, onHandle, onInstanceGlyph, onInstancePlus, onRotate, plusAt } from './hover';
import { grabbableLine } from './tables';
import { cancelGesture, eraseAlong } from './gestures';
import { isPoly } from './tools';
import type { Editor } from './editor';
import { isLocked, labOn } from '../labs/labs';
import { swapKind } from '../labs/swap';
import { openLink } from '../labs/textLink';
import { startComment } from '../labs/comments';

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
  // A picked link's node is moved, or a new one pulled out of a stretch's middle; a node pressed twice
  // quickly goes.
  const handle = ed.tool === 'select' && e.button === 0 && !e.shiftKey && !ed.spaceDown && !ed.editingId ? linkHandleAt(ed, w) : null;
  if (handle) {
    const via = [...(board.getLink(handle.id)?.via ?? [])], now = performance.now(), key = `${handle.id}:${handle.node}`;
    if (handle.node !== undefined && ed.lastTap.id === key && now - ed.lastTap.t < 380) {
      via.splice(handle.node, 1);
      board.updateLink(handle.id, { via: via.length ? via : undefined });
      ed.lastTap = { id: '', t: 0 };
      return;
    }
    ed.lastTap = { id: key, t: now };
    board.beginGesture();
    // A right-angled one: the stretch pressed moves across, the route kept square.
    const l = board.getLink(handle.id), shape = l && linkShape(l, (id) => board.get(id));
    if (l?.style === 'elbow' && shape) {
      ed.gesture = { type: 'linkStretch', id: l.id, k: handle.at!, pts: shape.pts, start: w };
      return;
    }
    // A new one only once it's pulled out (a click on a stretch's middle leaves the line as it is).
    ed.gesture = { type: 'linkNode', id: handle.id, node: handle.node ?? handle.at!, via, add: handle.node === undefined };
    return;
  }
  const end = ed.tool === 'select' && e.button === 0 && !e.shiftKey && !ed.spaceDown && !ed.editingId ? linkEndAt(ed, w) : null;
  if (end) {
    ed.setSelection([end.id]);
    ed.gesture = { type: 'relink', id: end.id, from: w, to: w, target: null };
    // Held: the open hand closes.
    ed.canvas!.style.cursor = 'grabbing';
    return;
  }
  // A task's ring ("Задача-компонент", src/labs) moves it on to its next state, picked or not.
  if (ed.tool === 'select' && e.button === 0 && !e.shiftKey && !e.altKey && hit?.host) {
    const task = board.get(hit.host), ring = task?.inst && TASK_STATES.includes(task.inst) ? board.get(copyId(task.id, '@task-ring')) : undefined;
    if (task && ring && !isLocked(task) && pointInRect(w, ring)) { ed.nextTaskState(task.id); return; }
  }
  // First pick the instance; the next press enters it, without depending on double-click timing.
  // With a child picked, its siblings can be picked directly too. Shift keeps group selection, and
  // Alt the whole instance, to drag a copy of it.
  const inside = !!hit?.host && !e.shiftKey && !e.altKey && ed.selection.size === 1
    && (ed.selection.has(hit.host) || board.get([...ed.selection][0])?.host === hit.host);
  const entering = inside && !!hit && !ed.selection.has(hit.id);
  if (hit?.host && !ed.selection.has(hit.id) && !inside) hit = board.get(hit.host) ?? hit;

  // A finger on the empty board moves the board, but not on the controls of what's selected (its
  // resize handle, link dots, turning corner, mind map buttons), on a folded mind map node's count
  // or on a table's line.
  const picked = ed.selection.size === 1 ? board.get([...ed.selection][0]) : undefined;
  const onControl = (!!picked && !ed.editingId && !isLocked(picked) && (onHandle(ed, picked, w) || !!dotAt(ed, picked, w) || onRotate(ed, picked, w) || !!plusAt(ed, picked, w) || onInstancePlus(ed, picked, w) || !!sideAt(ed, picked, w)))
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
    case 'timeline':
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
    // "Комментарии" (src/labs): a new comment where pressed, on what's there.
    case 'comment':
      startComment(w, hit ?? undefined);
      ed.setTool('select');
      return;
    case 'link': {
      // From the dot pressed of the item showing them (see lineToolHover), or from the item pressed.
      const shown = ed.linkDots ? board.get(ed.linkDots) : undefined, side = shown ? anyDotAt(ed, shown, w) : null;
      if (shown && side) ed.gesture = { type: 'link', from: shown.id, fromSide: side, to: w, target: null };
      else if (hit) ed.gesture = { type: 'link', from: hit.id, fromSide: null, to: w, target: null };
      return;
    }
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
  // The diamond before a picked instance's title, double-clicked, brings its component back and goes there.
  // (Pressed twice: once is just taken, so the instance stays picked.)
  if (single && onInstanceGlyph(ed, single, w)) {
    const inst = single.inst ? single.id : single.host!, now = performance.now(), key = `glyph:${inst}`;
    if (ed.lastTap.id === key && now - ed.lastTap.t < 380) { ed.lastTap = { id: '', t: 0 }; ed.goToComponent(inst); }
    else ed.lastTap = { id: key, t: now };
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
  // A side stretches it one way only (see sideAt).
  const side = single && !isLocked(single) ? sideAt(ed, single, w) : null;
  if (single && !isLocked(single) && (side || onHandle(ed, single, w))) {
    board.beginGesture();
    ed.gesture = { type: 'resize', id: single.id, start: w, orig: { ...single }, box: single.inst ? instanceBounds(single, items) : undefined, only: side ?? undefined };
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
  // Cmd+click (Ctrl+click) on what leads somewhere opens it ("Ссылка в тексте", src/labs).
  if ((e.metaKey || e.ctrlKey) && openLink(hit, w)) return;
  if (hit) {
    const now = performance.now();
    // Pressed twice: on the same item, or (an emoji, an icon, a shape) as the second press enters
    // the instance it's in.
    const enter = entering && ed.lastTap.id === hit.host && !!swapKind(hit);
    const dbl = (ed.lastTap.id === hit.id || enter) && now - ed.lastTap.t < 380 && !e.shiftKey;
    ed.lastTap = { id: hit.id, t: now };
    // A slow click on the one item picked: let go without dragging, it may pick what's under it.
    const again = !dbl && !entering && !e.shiftKey && ed.selection.size === 1 && ed.selection.has(hit.id);
    // A click on a cell of the table already selected picks that cell (on letting go, if not dragged).
    const cell = hit.type === 'table' && ed.selection.size === 1 && ed.selection.has(hit.id);
    if (cell) { /* keeps the table selected */ }
    else if (e.shiftKey) {
      const next = new Set(ed.selection);
      if (next.has(hit.id)) next.delete(hit.id); else next.add(hit.id);
      ed.setSelection(next);
    } else if (!ed.selection.has(hit.id)) ed.setSelection([hit.id]);
    ed.gesture = { type: 'drag', start: w, orig: ed.dragSet(items), moved: false, id: hit.id, dbl, cell, enter, again };
    return;
  }
  ed.lastTap = { id: '', t: 0 };
  if (link) {
    if (e.shiftKey) {
      const next = new Set(ed.selection);
      if (next.has(link.id)) next.delete(link.id); else next.add(link.id);
      ed.setSelection(next);
    } else {
      ed.setSelection([link.id]);
      // Dragged by its line ("Линии", src/labs), it's led to another item as by its head.
      if (labOn('lineTool')) ed.gesture = { type: 'relink', id: link.id, from: w, to: w, target: null, body: true };
    }
    return;
  }
  if (!e.shiftKey) ed.setSelection([]);
  ed.gesture = { type: 'marquee', start: w, base: new Set(ed.selection), rect: null };
}
