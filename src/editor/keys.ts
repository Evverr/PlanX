import type { Tool } from './tools';
import type { Editor } from './editor';
import { isLocked } from '../labs/labs';

/** Keys a tool is picked with. */
const TOOL_KEYS: Record<string, Tool> = { KeyV: 'select', KeyH: 'hand', KeyN: 'sticky', KeyS: 'sticky', KeyT: 'text', KeyR: 'rect', KeyO: 'ellipse', KeyC: 'link', KeyL: 'link', KeyF: 'frame', KeyP: 'pen', KeyM: 'marker', KeyE: 'eraser' };

/** The keyboard on the board (not while typing in a field). */
export function onKeyDown(ed: Editor, e: KeyboardEvent): void {
  const t = e.target as HTMLElement | null;
  if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
  const mod = e.ctrlKey || e.metaKey;
  if (e.code === 'Space') { e.preventDefault(); ed.setSpace(true); return; }
  if (mod) {
    switch (e.code) {
      case 'KeyZ': e.preventDefault(); if (e.shiftKey) ed.redo(); else ed.undo(); return;
      case 'KeyY': e.preventDefault(); ed.redo(); return;
      case 'KeyC': ed.copy(); return;
      case 'KeyX': if (ed.copy()) ed.deleteSelection(); return;
      case 'KeyV': e.preventDefault(); ed.paste(); return;
      case 'KeyD': e.preventDefault(); ed.duplicate(); return;
      case 'KeyA': e.preventDefault(); ed.setSelection(ed.shown().map((i) => i.id)); return;
      case 'KeyG': e.preventDefault(); ed.frameSelection(); return;
    }
    return;
  }
  if ((e.key === 'Delete' || e.key === 'Backspace') && ed.cells.length) {
    // With cells picked, their text goes, not the table.
    e.preventDefault();
    const it = ed.selectedItems()[0];
    if (it?.type === 'table') ed.board.update(it.id, { cells: (it.cells ?? []).map((c, i) => (ed.cells.includes(i) ? '' : c)) });
    return;
  }
  if (e.key === 'Delete' || e.key === 'Backspace') { if (ed.selection.size) { e.preventDefault(); ed.deleteSelection(); } return; }
  if (e.key === 'Escape' && ed.cells.length) { ed.cells = []; ed.emit(); ed.requestRender(); return; }
  if (e.key === 'Escape') { ed.pickedLines = []; ed.setSelection([]); ed.setTool('select'); window.dispatchEvent(new CustomEvent('planx:close-popovers')); return; }
  // On a mind map node, Tab adds a branch to it and Enter one beside it (to the centre: a branch).
  const one = ed.selection.size === 1 ? ed.board.get([...ed.selection][0]) : undefined;
  if (one?.type === 'mind' && (e.key === 'Tab' || e.key === 'Enter')) {
    e.preventDefault();
    ed.addMindNode(one.id, e.key === 'Enter' && one.parent ? 'below' : 'child');
    return;
  }
  if (e.key === 'Enter' && ed.selection.size === 1) { e.preventDefault(); ed.startEditing([...ed.selection][0]); return; }
  if (e.shiftKey && e.code === 'Digit1') { ed.fit(); return; }
  if (e.shiftKey && e.code === 'Digit0') { ed.zoomCenter(1 / ed.cam.z); return; }
  if (e.key === '+' || e.key === '=') { ed.zoomCenter(1.2); return; }
  if (e.key === '-' || e.key === '_') { ed.zoomCenter(1 / 1.2); return; }
  if (e.key.startsWith('Arrow') && ed.selection.size) {
    e.preventDefault();
    const s = e.shiftKey ? 10 : 1;
    const dx = e.key === 'ArrowLeft' ? -s : e.key === 'ArrowRight' ? s : 0;
    const dy = e.key === 'ArrowUp' ? -s : e.key === 'ArrowDown' ? s : 0;
    ed.board.transact(() => ed.selectedItems().filter((it) => !isLocked(it)).forEach((it) => ed.board.update(it.id, { x: it.x + dx, y: it.y + dy })));
    return;
  }
  if (e.code === 'KeyI') { window.dispatchEvent(new CustomEvent('planx:toggle-icons')); return; }
  if (TOOL_KEYS[e.code]) ed.setTool(TOOL_KEYS[e.code]);
}
