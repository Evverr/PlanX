import * as Y from 'yjs';
import { IndexeddbPersistence } from 'y-indexeddb';
import { WebsocketProvider } from 'y-websocket';
import { Board } from '../model/board';
import { defaultServerUrl } from '../collab/connection';
import { newEntry, readShelf, writeShelf, writeThumb, type BoardEntry } from './boards';
import { previewOf } from './preview';
import { addTemplates } from './templates';

/** Resolves when `ready` does, or after `ms` at the latest (the server may be away). */
const within = (ready: Promise<unknown>, ms: number) => Promise.race([ready, new Promise((r) => setTimeout(r, ms))]);

/**
 * Renames a board from the shelf: the name lives in the board itself, so it's opened for a moment
 * (from this browser's copy and the server), named, and closed. Offline, the browser's copy keeps
 * the new name and hands it on the next time the board is opened.
 */
export async function renameBoard(id: string, title: string): Promise<void> {
  const doc = new Y.Doc();
  const local = new IndexeddbPersistence(`planx-${id}`, doc);
  const remote = new WebsocketProvider(defaultServerUrl(), id, doc);
  try {
    await within(Promise.all([local.whenSynced, new Promise((r) => remote.once('sync', r))]), 2500);
    new Board(doc).setTitle(title);
    // A moment for the change to be sent and stored.
    await new Promise((r) => setTimeout(r, 400));
  } finally {
    remote.destroy();
    await local.destroy();
    doc.destroy();
  }
}

/** Opens this browser's copy of a board for a moment, to read it. */
async function readLocal<T>(id: string, read: (board: Board) => T): Promise<T> {
  const doc = new Y.Doc(), local = new IndexeddbPersistence(`planx-${id}`, doc);
  try {
    await within(local.whenSynced, 1500);
    return read(new Board(doc));
  } finally {
    await local.destroy();
    doc.destroy();
  }
}

/**
 * Boards opened in this browser before there was a shelf: each left its copy in IndexedDB
 * ("planx-<id>"), which gives its name and how much is on it. Read once, the first time the shelf opens.
 */
export async function findEarlierBoards(): Promise<BoardEntry[]> {
  if (!indexedDB.databases) return [];
  const names = (await indexedDB.databases()).map((d) => d.name ?? '').filter((n) => /^planx-[A-Za-z0-9_-]{1,64}$/.test(n));
  const found: BoardEntry[] = [];
  for (const name of names) {
    const id = name.slice('planx-'.length);
    const entry = await readLocal(id, (board) => {
      const count = board.list().length;
      return count || board.title ? newEntry(id, { title: board.title, items: count, opened: 0, edited: 0, created: 0 }) : null;
    });
    if (entry) found.push(entry);
  }
  return found;
}

/**
 * Draws the tiles' pictures afresh from this browser's copies of the boards (someone may have changed
 * a board since it was last open here), calling back after each so the page shows it.
 */
export async function refreshPreviews(ids: string[], done: (id: string) => void): Promise<void> {
  for (const id of ids) {
    try {
      const url = await readLocal(id, (board) => (board.list().length ? previewOf(board) : null));
      if (url) { writeThumb(id, url); done(id); }
    } catch { /* keeps the picture it had */ }
  }
}

/** The shelf, filled from earlier boards on its first ever opening, with the templates' folder. */
export async function loadShelf(): Promise<BoardEntry[]> {
  if (!readShelf()) {
    let found: BoardEntry[] = [];
    try { found = await findEarlierBoards(); } catch { /* start empty */ }
    writeShelf(found);
  }
  addTemplates();
  return readShelf() ?? [];
}
