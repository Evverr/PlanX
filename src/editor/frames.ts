import type { Board } from '../model/board';
import type { Item, Link } from '../model/types';
import type { Point } from '../canvas/geometry';
import { boxOf, center, nearestSide, pointInRect, rectContains, toLocal } from '../canvas/geometry';
import type { Scene, Theme } from '../canvas/renderer';
import { frameButtons, type FrameButton } from '../model/frame';
import { descendants, foldedAway } from '../model/mind';

/** What a frame holds: what was put in it, or, in a frame from before frames kept a list,
 *  everything lying inside. */
export function membersOf(board: Board, f: Item, items: Item[]): string[] {
  if (f.members) return f.members.filter((id) => board.get(id));
  return items.filter((i) => i.type !== 'frame' && rectContains(boxOf(f), boxOf(i))).map((i) => i.id);
}

/**
 * These items in the order they're drawn (and picked, from the top): as they're stacked, but every
 * frame under all it holds (frames in it and what those hold too), wherever it is in the stack, so a
 * frame put round things or things put into it never covers them.
 */
export function stacked(board: Board, items: Item[]): Item[] {
  const frames = items.filter((i) => i.type === 'frame');
  if (!frames.length) return items;
  const rank = new Map(items.map((it, i) => [it.id, i])), held = new Map(frames.map((f) => [f.id, membersOf(board, f, items)]));
  const memo = new Map<string, number>(), on = new Set<string>();
  // A frame goes just under the lowest of what it holds, if that's lower than it is.
  const place = (id: string): number => {
    const own = rank.get(id) ?? Infinity, kids = held.get(id);
    if (!kids || on.has(id)) return own;
    if (!memo.has(id)) {
      on.add(id);
      memo.set(id, kids.reduce((r, k) => Math.min(r, place(k) - 0.5), own));
      on.delete(id);
    }
    return memo.get(id)!;
  };
  return [...items].sort((a, b) => place(a.id) - place(b.id));
}

/** These items, what the frames among them hold (frames in frames too) and the branches of mind
 *  map nodes, each with where it is now. */
export function carried(board: Board, sel: Item[], items: Item[]): Map<string, Point> {
  const orig = new Map<string, Point>();
  sel.forEach((i) => orig.set(i.id, { x: i.x, y: i.y }));
  const frames = sel.filter((i) => i.type === 'frame');
  while (frames.length) {
    for (const id of membersOf(board, frames.pop()!, items)) {
      const i = board.get(id);
      if (!i || orig.has(id)) continue;
      orig.set(id, { x: i.x, y: i.y });
      if (i.type === 'frame') frames.push(i);
    }
  }
  // A mind map node brings its branches along.
  for (const id of descendants(orig.keys(), items)) {
    const i = board.get(id);
    if (i) orig.set(id, { x: i.x, y: i.y });
  }
  return orig;
}

/** What an item hides: all a folded frame holds (frames in it, and all those hold, too), or what a mind
 *  map node's folding hides (see foldedAway). */
function hiddenBy(board: Board, f: Item, items: Item[]): string[] {
  // A component (or an instance) put away: it and all it holds.
  if ((f.comp || f.inst) && f.stowed) return [...carried(board, [f], items).keys()];
  if (f.type === 'frame') return f.fold ? [...carried(board, [f], items).keys()].filter((id) => id !== f.id) : [];
  if (f.type === 'mind' && (f.collapsed || f.foldedWays)) return [...foldedAway(f, items, (id) => board.get(id)).values()].flat();
  return [];
}

/** Of these items, everything folded frames hold and folded mind map nodes hide, and components put
 *  away with what they hold. */
export function hiddenIn(board: Board, items: Item[]): Set<string> {
  const out = new Set<string>();
  for (const f of items) for (const id of hiddenBy(board, f, items)) out.add(id);
  return out;
}

/**
 * The links as they're seen: one whose end is hidden in a folded frame goes to that frame's bar
 * instead (the outermost one in sight, for frames in frames), one to a node folded away in a mind map
 * to the folded node, and one with both ends hidden in the same place isn't seen at all.
 */
export function linksIn(board: Board, items: Item[], hidden: Set<string>): Link[] {
  const links = board.linkList();
  if (!hidden.size) return links;
  const stand = new Map<string, string>();
  for (const f of items) {
    if (hidden.has(f.id)) continue;
    for (const id of hiddenBy(board, f, items)) stand.set(id, f.id);
  }
  // A curved link meets the bar on its side towards the other end.
  const moved = (l: Link): Link => {
    const from = stand.get(l.from) ?? l.from, to = stand.get(l.to) ?? l.to, a = board.get(from), b = board.get(to);
    if (!l.fromSide || !l.toSide || !a || !b) return { ...l, from, to };
    return { ...l, from, to, fromSide: from !== l.from ? nearestSide(a, center(b)) : l.fromSide, toSide: to !== l.to ? nearestSide(b, center(a)) : l.toSide };
  };
  return links.map((l) => (stand.has(l.from) || stand.has(l.to) ? moved(l) : l)).filter((l) => l.from !== l.to);
}

/** The frame button under the point, of the topmost frame among these that has one there; `pad`
 *  widens each button's reach. */
export function frameButtonAt(items: Item[], w: Point, pad: number): { id: string; kind: FrameButton } | null {
  for (let i = items.length - 1; i >= 0; i--) {
    const it = items[i];
    if (it.type !== 'frame') continue;
    const p = toLocal(it, w);
    const b = frameButtons(it).find((b) => pointInRect(p, { x: b.x - pad, y: b.y - pad, w: b.s + pad * 2, h: b.s + pad * 2 }));
    if (b) return { id: it.id, kind: b.kind };
  }
  return null;
}

/**
 * The frames' lists after putting each of these items in the innermost frame its middle lies in, or
 * taking it out of frames when it lies in none (`fresh`, a frame just made, starts empty): the new
 * list of each frame that changes. Only this puts things in frames: an item that merely ends up under
 * a frame (a frame put around others, or dragged over it) stays out until it's moved or made there.
 */
export function settled(board: Board, ids: Iterable<string>, fresh?: string): Map<string, string[]> {
  // Worked out on one look at the board (it reads back stale within a change).
  const items = board.list(), frames = items.filter((f) => f.type === 'frame');
  const held = new Map(frames.map((f) => [f.id, f.id === fresh ? [] : membersOf(board, f, items)]));
  const changed = new Set<string>();
  for (const id of ids) {
    const it = board.get(id);
    // Mind map branches go wherever their node goes, what's in an instance where its component has it.
    if (!it || it.host || (it.type === 'mind' && it.parent)) continue;
    const c = center(it);
    const inside = it.type === 'frame' ? new Set(carried(board, [it], items).keys()) : new Set([id]);
    const home = frames
      .filter((f) => !f.fold && !f.inst && !inside.has(f.id) && pointInRect(toLocal(f, c), f) && (it.type !== 'frame' || f.w * f.h > it.w * it.h))
      .sort((a, b) => a.w * a.h - b.w * b.h)[0];
    for (const f of frames) {
      const list = held.get(f.id)!, has = list.includes(id);
      if (f === home && (!has || !f.members)) { held.set(f.id, has ? list : [...list, id]); changed.add(f.id); }
      else if (f !== home && has) { held.set(f.id, list.filter((m) => m !== id)); changed.add(f.id); }
    }
  }
  if (fresh) changed.add(fresh);
  return new Map([...changed].map((f) => [f, held.get(f)!]));
}

/**
 * What the look into a folded frame shows: the frame as it is unfolded, with what it holds, fitted
 * into a w × h view with `pad` round it.
 */
export function peekView(board: Board, id: string, theme: Theme, w: number, h: number, dpr: number, pad: number): Scene | null {
  const f = board.get(id);
  if (f?.type !== 'frame') return null;
  const items = board.list(), held = carried(board, [f], items);
  const open: Item = { ...f, ...(f.fold ?? {}), fold: undefined, text: '' };
  // Frames inside it, folded or not, are shown as they are; what they hold stays hidden if folded.
  const inner = hiddenIn(board, items.filter((i) => held.has(i.id) && i.id !== f.id));
  const shown = [open, ...stacked(board, items.filter((i) => held.has(i.id) && i.id !== f.id && !inner.has(i.id)))];
  const ids = new Set(shown.map((i) => i.id));
  const z = Math.min((w - pad * 2) / open.w, (h - pad * 2) / open.h);
  return {
    items: shown,
    links: board.linkList().filter((l) => ids.has(l.from) && ids.has(l.to)),
    get: (k) => (k === id ? open : board.get(k)),
    cam: { x: (w - open.w * z) / 2 - open.x * z, y: (h - open.h * z) / 2 - open.y * z, z },
    theme, width: w, height: h, dpr,
    selection: new Set(), editingId: null, marquee: null, linkPreview: null, peers: [], showHandle: false, byFinger: false,
    hotDot: null, hotPlus: null, plusFade: 0, mindMove: null, tableLines: [], editingCell: null, guides: [], pickedCells: null, stroke: null,
  };
}
