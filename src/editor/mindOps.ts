import type { Item } from '../model/types';
import { DEFAULTS } from '../model/types';
import { mindSize } from '../canvas/text';
import { addChild, childPlace, descendants, insertBeside, mindSide } from '../model/mind';
import type { Editor } from './editor';

/** A mind map node's size for its text; one growing leftwards keeps its right edge where it is (one
 *  under its parent grows rightwards). Nothing for other items. */
export function mindFit(ed: Editor, it: Item, text: string): Partial<Item> {
  if (it.type !== 'mind') return {};
  const { w, h } = mindSize(it, text), up = it.parent ? ed.board.get(it.parent) : undefined;
  const left = up && !it.down && mindSide(it, up) < 0;
  // New lines grow it downwards.
  return { w, h, x: left ? it.x + it.w - w : it.x };
}

/** Adds a node to a mind map: a child of `from` (`down`: one led down from a central topic), or
 *  another child of its parent right after it (`below`) or before it (`above`), and opens it for typing. */
export function addMindNode(ed: Editor, fromId: string, kind: 'child' | 'down' | 'above' | 'below', byPlus = false): void {
  const board = ed.board, from = board.get(fromId);
  if (from?.type !== 'mind') return;
  const beside = kind === 'above' || kind === 'below';
  const parent = beside && from.parent ? board.get(from.parent) : from;
  if (!parent) return;
  const items = board.list(), get = (id: string) => board.get(id);
  const depth = (n: Item): number => (n.parent ? 1 + depth(board.get(n.parent) ?? n) : 0);
  const level = depth(parent) + 1;
  // Sized as it will be once typed in: a branch, not a central topic (which has more padding).
  const draft = { ...DEFAULTS.mind, type: 'mind', fs: level === 1 ? 14 : 12, text: '', parent: parent.id } as Item;
  const { w, h } = mindSize(draft, '');
  // A branch of its own goes out from the node, the way its branches grow (and re-centres them); a
  // parallel one goes right before or after the node it's added beside, which stays put (so more can
  // be added from the same spot), the branches past it making room (see insertBeside). A branch led
  // down, and all in it, grows down.
  const at = beside ? { x: from.x, y: from.y } : childPlace(parent, items, get, w, h, kind === 'down' ? 'down' : undefined);
  const it = ed.newItem('mind', at.x, at.y, { w, h, fs: draft.fs, parent: parent.id, down: kind === 'down' || from.down || undefined });
  board.beginGesture();
  // A folded node unfolds to show its new branch.
  if (parent.collapsed) board.update(parent.id, { collapsed: undefined });
  board.add(it);
  const moves = beside ? insertBeside(it.id, from.id, kind, board.list()) : addChild(it.id, board.list());
  board.transact(() => moves.forEach((pt, k) => board.update(k, pt)));
  board.endGesture();
  // From the "+" before or after, the node stays picked with its buttons under the pointer, so more
  // can be added one click after another; they're typed in later.
  if (byPlus && beside) return;
  ed.setSelection([it.id]);
  // From a "+", it opens for typing once the press is over, or the browser's focus moving on press
  // closes it again.
  if (byPlus) setTimeout(() => ed.startEditing(it.id), 0);
  else ed.startEditing(it.id);
}

/** Takes away a mind map node being typed in once it's emptied and Delete or Backspace is pressed
 *  again, with whatever grows from it; its parent is picked instead. */
export function removeMindNode(ed: Editor, id: string): void {
  const it = ed.board.get(id);
  if (it?.type !== 'mind' || !it.parent) return;
  ed.editingId = null;
  ed.board.remove([id, ...descendants([id], ed.board.list())]);
  ed.setSelection(ed.board.get(it.parent) ? [it.parent] : []);
}

/** Mind map nodes already checked against the padding they're sized with now. */
const fitted = new WeakMap<Editor, Set<string>>();

/** Mind map nodes sized before their padding grew are made to fit their text again, once each. */
export function refitMind(ed: Editor): void {
  if (!fitted.has(ed)) fitted.set(ed, new Set());
  const seen = fitted.get(ed)!, stale: Array<[Item, Partial<Item>]> = [];
  for (const it of ed.board.list()) {
    if (it.type !== 'mind' || seen.has(it.id) || it.id === ed.editingId) continue;
    seen.add(it.id);
    const fit = mindFit(ed, it, it.text ?? '');
    if (fit.w !== it.w || fit.h !== it.h) stale.push([it, fit]);
  }
  if (stale.length) setTimeout(() => ed.board.transact(() => stale.forEach(([it, fit]) => ed.board.update(it.id, fit))), 0);
}
