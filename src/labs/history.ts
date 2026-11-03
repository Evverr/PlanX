import { useSyncExternalStore } from 'react';
import * as Y from 'yjs';
import type { Editor } from '../editor/editor';
import { Board } from '../model/board';
import { boardIdFromUrl, serverHttpUrl } from '../collab/connection';

/**
 * "История" (src/labs): points the board can go back to, kept on the server (see server/history.ts). The
 * switch between making them by hand and the server's doing so now and then is the board's, shared.
 */
export type PointKind = 'manual' | 'auto' | 'before';
export interface Point { id: string; t: number; kind: PointKind }

const base = () => `${serverHttpUrl()}/history/${boardIdFromUrl()}`;

async function ask(path: string, init?: RequestInit): Promise<Response> {
  const r = await fetch(`${base()}${path}`, init);
  if (!r.ok) throw new Error(`history: ${r.status}`);
  return r;
}

export const listPoints = async (): Promise<Point[]> => (await ask('')).json();
export const addPoint = async (kind: PointKind = 'manual'): Promise<Point> => (await ask(`?kind=${kind}`, { method: 'POST' })).json();
export const removePoint = async (id: string): Promise<void> => { await ask(`/${id}`, { method: 'DELETE' }); };

// (The real board's, also while a point's on the canvas.)
const settings = (b: Board) => b.doc.getMap('labs');
export const autoPoints = (b: Board) => settings(b).get('historyAuto') === true;
export const setAutoPoints = (b: Board, on: boolean) => { settings(b).set('historyAuto', on); };
export const subscribeAuto = (b: Board, fn: () => void) => { const m = settings(b); m.observe(fn); return () => m.unobserve(fn); };

/** The board as it was at a point: not joined to anything. */
async function boardAt(id: string): Promise<Board> {
  const doc = new Y.Doc();
  Y.applyUpdate(doc, new Uint8Array(await (await ask(`/${id}`)).arrayBuffer()));
  return new Board(doc);
}

/* The point on the canvas now, if any. */
let looked: { point: Point; board: Board } | null = null;
const listeners = new Set<() => void>();
const setLooked = (next: typeof looked) => {
  looked?.board.doc.destroy();
  looked = next;
  listeners.forEach((fn) => fn());
};
const subscribeLooked = (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; };
/** The point being looked at, for React. */
export const useLooked = () => useSyncExternalStore(subscribeLooked, () => looked?.point ?? null);

/** The board as it was at a point, on the canvas, in the real one's place, till endLook. */
export async function lookAt(ed: Editor, point: Point): Promise<void> {
  const board = await boardAt(point.id);
  ed.showBoard(board);
  setLooked({ point, board });
}

/** The real board back on the canvas. */
export function endLook(ed: Editor): void {
  ed.showBoard(null);
  if (looked) setLooked(null);
}

/**
 * The board as it was at a point, for everyone on it, as one undo step (the layers too); what it is now
 * kept as a point first, to come back to.
 */
export async function goBackTo(ed: Editor, id: string): Promise<void> {
  const then = await boardAt(id);
  await addPoint('before');
  endLook(ed);
  const layers = ed.board.doc.getMap('layers'), was = then.doc.getMap('layers').toJSON();
  ed.stopEditing();
  ed.setSelection([]);
  ed.board.undoManager.addToScope(layers);
  ed.board.transact(() => {
    ed.board.replaceAll(then.list(), then.linkList(), (then.meta.get('title') as string | undefined) ?? '');
    layers.clear();
    for (const [k, v] of Object.entries(was)) layers.set(k, v);
  });
  then.doc.destroy();
}
