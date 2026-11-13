import type { TableLine } from '../model/table';
import { colsOf, rowsOf } from '../model/table';
import { center, hitItem, hitLink, instanceBounds, linkBox, linkShape, onAudioButton } from '../canvas/geometry';
import { taskButtonAt } from './tasks';
import { tabAt, tabsFor } from '../labs/sideTabs';
import { taskPartAt } from '../canvas/task';
import { copyCode, onCodeCopy } from '../labs/codeBlock';
import { onFormButton } from '../labs/formObject';
import { pollPartAt, pressPoll } from '../labs/poll';
import { toggleAudio } from '../canvas/audio';
import { anyDotAt, dotAt, inFirstHalf, linkHandleAt, foldBadgeAt, frameButtonUnder, offComponent, sideAt, linkEndAt, onHandle, onInstanceGlyph, onRotate, onTopLeft, onBottomLeft, plusAt, ringAt, tickAt, pickedUnder } from './hover';
import { grabbableLine } from './tables';
import { cancelGesture, eraseAlong } from './gestures';
import { isPoly } from './tools';
import type { Editor } from './editor';
import { isLocked, labOn } from '../labs/labs';
import { zoomBoxHeld } from '../labs/zoomBox';
import { nibPress } from '../labs/nib';
import { nodeEditing, pressNode } from '../labs/paths';
import { swapKind } from '../labs/swap';
import { linkPartAt, openLink } from '../labs/textLink';
import { dotsOn, dotsUnder } from '../labs/linkTool';
import { startComment } from '../labs/comments';

/** A press on the board: works out what it starts (a gesture followed till it's let go) or does at
 *  once, from the tool, what's under it and what's selected. */
export function press(ed: Editor, e: PointerEvent): void {
  const board = ed.board;
  ed.byFinger = e.pointerType === 'touch';
  // Typing in a table's cell, one of its lines taken: it's resized, the typing going on (the text kept
  // where it is, its focus too).
  const typingIn = ed.editingId ? board.get(ed.editingId) : undefined;
  const at = ed.toWorld(ed.local(e).x, ed.local(e).y);
  const keepTyping = typingIn?.type === 'table' && e.button === 0 && !!grabbableLine(ed, at, hitItem(ed.shown(), at, ed.cam.z), e.pointerType);
  if (keepTyping) e.preventDefault();
  else ed.stopEditing();
  // Same as in newItem: once someone works on the board, leave the camera to them.
  ed.needsFit = false;
  const sp = ed.local(e);
  ed.canvas!.setPointerCapture(e.pointerId);
  ed.pointers.set(e.pointerId, sp);

  if (ed.pointers.size === 2) {
    ed.offComponent = null;
    cancelGesture(ed);
    const [p, q] = [...ed.pointers.values()];
    ed.gesture = { type: 'pinch', d0: Math.hypot(p.x - q.x, p.y - q.y) || 1, z0: ed.cam.z, anchor: ed.toWorld((p.x + q.x) / 2, (p.y + q.y) / 2) };
    return;
  }
  if (ed.pointers.size > 2) return;

  const w = ed.toWorld(sp.x, sp.y);
  const items = board.list();
  // A frame takes clicks anywhere on its empty area, but links drawn across it come first.
  // What's picked is taken first, over what lies on it (see pickedUnder); Shift picks what's on it.
  let hit = (e.button === 0 && !e.shiftKey ? pickedUnder(ed, w) : null) ?? hitItem(ed.shown(), w, ed.cam.z);
  const link = hit && hit.type !== 'frame' ? null : hitLink(ed.shownLinks(), (id) => board.get(id), w, ed.cam.z);
  if (link) hit = null;
  // Off the component being changed here: a click ends that once let go (see Editor.onPointerUp).
  ed.offComponent = ed.tool === 'select' && e.button === 0 && !ed.spaceDown && !zoomBoxHeld() && offComponent(ed, w, hit) ? sp : null;
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
    ed.setSelection([end.link.id]);
    ed.gesture = { type: 'relink', id: end.link.id, from: w, to: w, target: null, start: end.start };
    // Held: the open hand closes.
    ed.canvas!.style.cursor = 'grabbing';
    return;
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
  const onControl = (tabsFor(picked, ed.editingId) && !!tabAt(ed, picked, w)) || (!!picked && !ed.editingId && !isLocked(picked) && (onHandle(ed, picked, w) || onTopLeft(ed, picked, w) || onBottomLeft(ed, picked, w) || !!dotAt(ed, picked, w) || onRotate(ed, picked, w) || !!sideAt(ed, picked, w))) || (!!ed.plusNode() && !!plusAt(ed, ed.plusNode()!, w))
    || !!foldBadgeAt(ed, w) || !!tickAt(ed, w);
  const empty = ed.tool === 'select' && e.button === 0 && !ed.spaceDown && !e.shiftKey && !hit && !link && !onControl
    && !grabbableLine(ed, w, hit, e.pointerType) && !ed.editingId
    // With Z held ("Зум рамкой"), anywhere is as the empty board.
    || (e.button === 0 && !ed.spaceDown && zoomBoxHeld());
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
  if (e.button === 1 || ed.spaceDown || (ed.tool === 'hand' && !(zoomBoxHeld() && e.button === 0)) || touchPan) {
    // A finger on the empty board pans it; let go without moving, it's a tap that drops the selection.
    ed.gesture = { type: 'pan', sx: sp.x, sy: sp.y, cx: ed.cam.x, cy: ed.cam.y, tap: touchPan };
    ed.canvas!.classList.add('panning');
    return;
  }
  if (e.button !== 0) return;

  // Z held, whatever the tool (which it's back to once Z's let go): a box from anywhere, to zoom to ("Зум рамкой", src/labs).
  if (zoomBoxHeld()) {
    ed.gesture = { type: 'marquee', start: w, base: new Set(ed.selection), rect: null, zoom: true };
    return;
  }

  switch (ed.tool) {
    case 'sticky':
    case 'text':
    case 'task':
    case 'table':
    case 'mind':
    case 'timeline':
    case 'form':
    case 'poll':
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
      // (A triangle's text at its bottom, where it's widest.)
      const it = isPoly(t) ? ed.newItem('polygon', w.x, w.y, { w: 1, h: 1, shape: t, ...(t === 'triangle' && { va: 'bottom' as const }) }) : ed.newItem(t, w.x, w.y, { w: 1, h: 1 });
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
    // "Перо" (src/labs): a corner where clicked.
    case 'nib':
      nibPress(ed, w, sp, e.shiftKey);
      return;
    case 'eraser':
      board.beginGesture();
      ed.gesture = { type: 'erase', last: w };
      eraseAlong(ed, w, w);
      return;
  }

  // Select tool.
  // A path's nodes being changed ("Перо", src/labs): a corner or handle taken, or, elsewhere, that's over.
  if (nodeEditing() && e.button === 0 && pressNode(ed, sp, w)) return;
  const single = ed.selection.size === 1 ? board.get([...ed.selection][0]) : undefined;
  // A mind map node's buttons: the picked one's, or those of the one the pointer rests on.
  const node = ed.editingId && ed.editingId !== single?.id ? undefined : ed.plusNode(), plus = node && plusAt(ed, node, w);
  // The ring where a node's branches leave it one way (nearer than its "+" that way): folds them, nothing
  // left picked, the map to look at.
  const ring = e.button === 0 && !ed.editingId ? ringAt(ed, w) : null;
  if (ring && (!plus || ring.d < Math.hypot(w.x - plus.x, w.y - plus.y))) { ed.setCollapsed(ring.id, ring.way, true); ed.setSelection([]); return; }
  if (node && plus) {
    if (plus.kind === 'move') ed.gesture = { type: 'mindMove', id: node.id, from: w, to: w, target: null };
    // Folded by its chevron, nothing's left picked: the map to look at.
    else if (plus.kind === 'fold') { ed.setCollapsed(node.id, plus.way!, true); ed.setSelection([]); }
    else ed.addMindNode(node.id, plus.kind, true);
    return;
  }
  // The diamond before a picked instance's title brings its component out in its place, to be changed.
  if (single && onInstanceGlyph(ed, single, w)) {
    ed.editComponentAt(single.inst ? single.id : single.host!);
    return;
  }
  // A component's tick (picked or not) turns it into an instance where it stands.
  const tick = tickAt(ed, w);
  if (tick) {
    ed.addInstance(tick.id);
    return;
  }
  // Its arrow past the tick asks for a name, to make it one of the board's objects ("Объекты").
  // A folded mind map node's count unfolds it (that way), and leaves nothing picked: the map to look at.
  const unfold = e.shiftKey ? null : foldBadgeAt(ed, w);
  if (unfold) {
    ed.setCollapsed(unfold.id, unfold.way, false);
    ed.setSelection([]);
    return;
  }
  // "Связи инструментом" (src/labs) with its dots out: a dot under the pointer, of anything, starts a link.
  const modeIt = labOn('linkTool') && dotsOn() && ed.linkDots ? board.get(ed.linkDots) : undefined;
  const modeSide = modeIt && !isLocked(modeIt) && dotsUnder(modeIt, ed.selection) ? anyDotAt(ed, linkBox(modeIt), w) : null;
  if (modeIt && modeSide) {
    ed.gesture = { type: 'link', from: modeIt.id, fromSide: modeSide, to: w, target: null };
    return;
  }
  // «Полукруги на рамке» (src/labs): a half circle: a copy that way on a click, a link when dragged.
  // (Not on its resize handle: that comes first.)
  const tab = tabsFor(single ?? undefined, ed.editingId) && !onHandle(ed, single!, w) ? tabAt(ed, single!, w) : null;
  if (single && tab) {
    ed.gesture = { type: 'tab', id: single.id, side: tab, start: w };
    return;
  }
  const dot = single && !ed.editingId && !isLocked(single) ? dotAt(ed, single, w) : null;
  if (single && dot) {
    ed.gesture = { type: 'link', from: single.id, fromSide: dot, to: w, target: null };
    return;
  }
  // A side stretches it one way only (see sideAt).
  const side = single && !isLocked(single) ? sideAt(ed, single, w) : null;
  const topLeft = single && !isLocked(single) && !side && onTopLeft(ed, single, w);
  const bottomLeft = single && !isLocked(single) && !side && !topLeft && onBottomLeft(ed, single, w);
  if (single && !isLocked(single) && (side || topLeft || bottomLeft || onHandle(ed, single, w))) {
    board.beginGesture();
    ed.gesture = { type: 'resize', id: single.id, start: w, orig: { ...single }, box: single.inst ? instanceBounds(single, items) : undefined, only: side ?? (topLeft ? 'tl' : bottomLeft ? 'bl' : undefined) };
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
  const tl = (ed.editingId && !keepTyping) || entering ? null : grabbableLine(ed, w, hit, e.pointerType);
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
  // A block of code's copy button ("Код", src/labs).
  if (hit?.code && e.button === 0 && !e.shiftKey && ed.editingId !== hit.id && onCodeCopy(hit, w)) { copyCode(hit, () => ed.requestRender()); return; }
  // A form's button («Форма», src/labs): «Заполнить» keeps the values, «Редактировать» brings the fields
  // back; it's picked either way (its fields over it while it is, see FormFields).
  if (hit?.form && e.button === 0 && !e.shiftKey && onFormButton(hit, w)) {
    ed.board.update(hit.id, { fd: hit.fd ? undefined : true });
    ed.setSelection([hit.id]);
    return;
  }
  // A poll's answer voted for (or not), its «+», its start, «Редактировать» («Голосование», src/labs);
  // setting it up, it's picked (its fields over it, see PollFields).
  const pollPart = hit?.poll && e.button === 0 && !e.shiftKey ? pollPartAt(hit, w) : null;
  if (hit && pollPart) {
    pressPoll(ed.board, hit, pollPart);
    if (typeof pollPart !== 'object') ed.setSelection([hit.id]);
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
    // (Or as the system counts a double click, however slow it's set to be.)
    const dbl = (ed.lastTap.id === hit.id || enter) && (now - ed.lastTap.t < 380 || e.detail >= 2) && !e.shiftKey;
    ed.lastTap = { id: hit.id, t: now };
    // A slow click on the one item picked: let go without dragging, it may pick what's under it.
    const again = !dbl && !entering && !e.shiftKey && ed.selection.size === 1 && ed.selection.has(hit.id);
    // A click on a cell of the table already selected picks that cell (on letting go, if not dragged).
    const cell = hit.type === 'table' && ed.selection.size === 1 && ed.selection.has(hit.id);
    // (Picked by this press: its frame shows once it's let go without being dragged, see Scene.dragging.)
    const fresh = !e.shiftKey && !ed.selection.has(hit.id), was = fresh ? [...ed.selection] : undefined;
    if (cell) { /* keeps the table selected */ }
    else if (e.shiftKey) {
      const next = new Set(ed.selection);
      if (next.has(hit.id)) next.delete(hit.id); else next.add(hit.id);
      ed.setSelection(next);
    } else if (!ed.selection.has(hit.id)) { ed.setPicking(true); ed.setSelection([hit.id]); }
    // A link on a part of its text opens once let go, not dragged (see endGesture).
    const url = e.button === 0 && !e.shiftKey && !e.altKey && ed.editingId !== hit.id ? linkPartAt(hit, w) ?? undefined : undefined;
    // A task's buttons (its ring, arrows, a subtask's ring, the people…) alike: dragged, it moves.
    const tap = hit.type === 'task' && !entering && !e.shiftKey && e.button === 0 && ed.editingId !== hit.id && taskButtonAt(hit, w) ? sp : undefined;
    // A subtask pressed: dragged, it goes elsewhere among them ("Перетаскивание подзадач", src/labs).
    const part = tap && labOn('subDrag') ? taskPartAt(hit, w) : null, sub = typeof part === 'object' && part && !part.del ? part.sub : undefined;
    ed.gesture = { type: 'drag', start: w, orig: ed.dragSet(items), moved: false, id: hit.id, dbl, cell, enter, again, url, tap, sub, fresh, was };
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
      // The end it's led by: that of the half it's taken by.
      if (labOn('lineTool')) ed.gesture = { type: 'relink', id: link.id, from: w, to: w, target: null, body: true, start: inFirstHalf(ed, link, w) };
    }
    return;
  }
  if (!e.shiftKey) ed.setSelection([]);
  ed.gesture = { type: 'marquee', start: w, base: new Set(ed.selection), rect: null };
}
