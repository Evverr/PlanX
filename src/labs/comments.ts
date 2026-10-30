import * as Y from 'yjs';
import type { Board } from '../model/board';
import type { Item } from '../model/types';
import type { Point } from '../canvas/geometry';
import { catFor } from '../emoji/emoji';
import { labOn, myId } from './labs';

/**
 * "Комментарии" (src/labs), as in Figma: a pin on the board with its author's cat, opened to read it,
 * tick it off as solved, answer it once; its author can change or take it and their answer away.
 * Kept in the board's own document beside its items (a map of its own, not undone with them), so
 * everyone on the board sees them; pinned to an item when put on one, it goes where the item goes.
 */
export interface Note { text: string; author: string; by: string; at: number }
export interface Comment extends Note {
  id: string;
  /** Where it's pinned: on the board, or (`on`) `dx`, `dy` from an item's corner. */
  x: number; y: number; on?: string; dx?: number; dy?: number;
  done?: boolean;
  reply?: Note;
}

const map = (board: Board) => board.doc.getMap<Y.Map<unknown>>('comments');

export function comments(board: Board): Comment[] {
  return [...map(board).entries()].map(([id, m]) => ({ ...(m.toJSON() as Omit<Comment, 'id'>), id })).sort((a, b) => a.at - b.at);
}

export function onComments(board: Board, fn: () => void): () => void {
  const m = map(board), on = () => fn();
  m.observeDeep(on);
  return () => m.unobserveDeep(on);
}

/** Where a comment's pin points on the board now. */
export function pinAt(c: Comment, get: (id: string) => Item | undefined): Point {
  const it = c.on ? get(c.on) : undefined;
  return it ? { x: it.x + (c.dx ?? 0), y: it.y + (c.dy ?? 0) } : { x: c.x, y: c.y };
}

export function addComment(board: Board, at: Point, on: Item | undefined, text: string, by: string): string {
  const id = Math.random().toString(36).slice(2, 12), m = new Y.Map<unknown>();
  board.doc.transact(() => {
    map(board).set(id, m);
    const fields: Partial<Comment> = { x: Math.round(at.x), y: Math.round(at.y), text, author: myId(), by, at: Date.now() };
    if (on) Object.assign(fields, { on: on.id, dx: Math.round(at.x - on.x), dy: Math.round(at.y - on.y) });
    for (const [k, v] of Object.entries(fields)) m.set(k, v);
  });
  return id;
}

export function updateComment(board: Board, id: string, patch: Partial<Omit<Comment, 'id'>>): void {
  const m = map(board).get(id);
  if (!m) return;
  board.doc.transact(() => { for (const [k, v] of Object.entries(patch)) { if (v === undefined) m.delete(k); else m.set(k, v); } });
}

export const removeComment = (board: Board, id: string) => map(board).delete(id);

/** Takes every comment away (the board cleared); gives back what puts them back. */
export function clearComments(board: Board): () => void {
  const was = comments(board);
  board.doc.transact(() => map(board).clear());
  return () => board.doc.transact(() => {
    for (const { id, ...c } of was) {
      const m = new Y.Map<unknown>();
      map(board).set(id, m);
      for (const [k, v] of Object.entries(c)) if (v !== undefined) m.set(k, v);
    }
  });
}

/** Whether a note is this browser's own. */
export const mine = (n: Note) => n.author === myId();

/** The cat a note's author has: yours the smiling one, anyone else's one of the others, the same each time. */
export function catOf(n: Note): string {
  if (mine(n)) return catFor();
  let h = 0;
  for (const ch of n.author) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return catFor(h);
}

/** Asks for a new comment at a board point (on the item there, if any). */
export function startComment(at: Point, on?: Item): void {
  if (!labOn('comments')) return;
  window.dispatchEvent(new CustomEvent('planx:comment', { detail: { at, on: on?.id } }));
}
