import type { Item } from '../model/types';
import { DEFAULTS } from '../model/types';
import { mindSize } from '../canvas/text';
import { addChild, branchWays, childPlace, descendants, foldedWays, folding, insertBeside, mindSide, mindWay, type Toward } from '../model/mind';

/** The ways a node is added to a mind map (see addMindNode). */
export type MindAdd = 'child' | 'left' | 'down' | 'up' | 'above' | 'below';
import type { Editor } from './editor';

/** A mind map node's size for its text; one growing leftwards keeps its right edge where it is (one
 *  under or over its parent grows rightwards). Nothing for other items. */
export function mindFit(ed: Editor, it: Item, text: string): Partial<Item> {
  if (it.type !== 'mind') return {};
  const { w, h } = mindSize(it, text), up = it.parent ? ed.board.get(it.parent) : undefined;
  const left = up && !it.down && !it.up && mindSide(it, up) < 0;
  // New lines grow it downwards, or over its parent, upwards.
  return { w, h, x: left ? it.x + it.w - w : it.x, y: up && it.up ? it.y + it.h - h : it.y };
}

/** Adds a node to a mind map: a child of `from` (`left`, `down`, `up`: one led that way from a central
 *  topic), or another child of its parent right after it (`below`) or before it (`above`), and opens it
 *  for typing. */
export function addMindNode(ed: Editor, fromId: string, kind: MindAdd, byPlus = false): void {
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
  // down (or up), and all in it, grows down (or up).
  const toward: Toward | undefined = kind === 'left' ? -1 : kind === 'down' || kind === 'up' ? kind : undefined;
  const at = beside ? { x: from.x, y: from.y } : childPlace(parent, items, get, w, h, toward);
  const it = ed.newItem('mind', at.x, at.y, {
    w, h, fs: draft.fs, parent: parent.id, down: kind === 'down' || from.down || undefined, up: kind === 'up' || from.up || undefined,
  });
  board.beginGesture();
  // A node folded that way unfolds to show its new branch; one getting its first there by a "+" shows
  // no chevron for them till it's picked again.
  const way = mindWay(it, parent);
  if (byPlus && !beside && !branchWays(parent, items).includes(way)) ed.chevronless = `${parent.id}:${way}`;
  if (foldedWays(parent, parent.parent ? board.get(parent.parent) : undefined).includes(way)) board.update(parent.id, folding(parent, way, false));
  board.add(it);
  const moves = beside ? insertBeside(it.id, from.id, kind, board.list()) : addChild(it.id, board.list());
  board.transact(() => moves.forEach((pt, k) => board.update(k, pt)));
  board.endGesture();
  // From a "+", the node it was added from stays picked with its buttons under the pointer, so more
  // can be added one click after another; they're typed in later.
  if (byPlus) return;
  ed.setSelection([it.id]);
  ed.startEditing(it.id);
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
