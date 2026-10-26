import * as Y from 'yjs';
import { IndexeddbPersistence } from 'y-indexeddb';
import type { Editor } from '../editor/editor';
import { Board } from '../model/board';
import { newBoardId } from '../collab/connection';
import { boardUrl, updateEntry } from '../shelf/boards';
import { fileName, saveFile } from './exportPng';

/**
 * "Файл доски": the whole board in a file of its own (.jjvg), and such a file opened as a new board.
 *
 * The file: "PLANJJVG" (8 bytes), the format's version (1 byte), flags (1 byte, none yet), the length
 * of what follows (4 bytes, little-endian), and that: the board's Yjs document as one update
 * (Y.encodeStateAsUpdate), everything on it as it is, its name too. A newer version can add flags or
 * fields after the length; a reader takes only versions it knows.
 */
export const MAGIC = 'PLANJJVG', VERSION = 1, HEAD = 14;

/** The board's document as a .jjvg file. */
export function encodeBoardFile(doc: Y.Doc): Uint8Array {
  const body = Y.encodeStateAsUpdate(doc), out = new Uint8Array(HEAD + body.length), view = new DataView(out.buffer);
  out.set(new TextEncoder().encode(MAGIC), 0);
  out[8] = VERSION;
  out[9] = 0;
  view.setUint32(10, body.length, true);
  out.set(body, HEAD);
  return out;
}

/** What's in a .jjvg file: the board's document as an update; why not, when it isn't one. */
export function decodeBoardFile(bytes: Uint8Array): { update: Uint8Array } | { error: string } {
  if (bytes.length < HEAD || new TextDecoder().decode(bytes.subarray(0, 8)) !== MAGIC) return { error: 'Это не файл доски' };
  if (bytes[8] > VERSION) return { error: 'Файл из более новой версии PlanX' };
  const n = new DataView(bytes.buffer, bytes.byteOffset).getUint32(10, true);
  if (HEAD + n > bytes.length) return { error: 'Файл повреждён: он короче, чем должен быть' };
  return { update: bytes.slice(HEAD, HEAD + n) };
}

/** Saves the board this is as a .jjvg file named after it. */
export function saveBoardFile(ed: Editor): void {
  saveFile(new Blob([encodeBoardFile(ed.board.doc)], { type: 'application/octet-stream' }), fileName(ed, 'jjvg'));
}

/** Opens a .jjvg file as a new board: put into this browser's copy of it (the server gets it when it's
 *  opened), on the shelf, and gone to. Gives back why not, when it can't be. */
export async function openBoardFile(file: File): Promise<string | null> {
  const got = decodeBoardFile(new Uint8Array(await file.arrayBuffer()));
  if ('error' in got) return got.error;
  const id = newBoardId(), doc = new Y.Doc(), local = new IndexeddbPersistence(`planx-${id}`, doc);
  try {
    await local.whenSynced;
    Y.applyUpdate(doc, got.update);
    const board = new Board(doc);
    if (!board.list().length && !board.title) return 'В файле пустая доска';
    updateEntry(id, { title: board.title, items: board.list().length });
    // A moment for it to be stored.
    await new Promise((r) => setTimeout(r, 300));
  } catch {
    return 'Не получилось прочитать файл';
  } finally {
    await local.destroy();
    doc.destroy();
  }
  location.href = boardUrl(id);
  return null;
}
