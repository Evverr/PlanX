import { readJSON, readText, writeJSON, writeText } from '../storage';

/**
 * The boards and folders on this browser's shelf. The server keeps each board by its id but has no
 * list of them, so the shelf is this browser's own: a board gets on it when it's made here or opened
 * here. Folders stand on the shelves; inside a folder are its boards and folders.
 */

export interface BoardEntry {
  id: string;
  title: string;
  /** The folder it's in; none (or a folder since deleted) is the top of the shelf. */
  folder?: string | null;
  created: number;
  /** When it was last opened here, and last changed (by anyone, seen here). */
  opened: number;
  edited: number;
  /** How many things are on it, as last seen. */
  items: number;
  pinned?: boolean;
}

export interface FolderEntry {
  id: string;
  title: string;
  color: string;
  /** The folder it's in, or none at the top. */
  parent?: string | null;
  created: number;
  opened: number;
}

export type SortBy = 'opened' | 'edited' | 'created' | 'title';

export const SORTS: { id: SortBy; label: string }[] = [
  { id: 'opened', label: 'Недавно открытые' },
  { id: 'edited', label: 'Недавно изменённые' },
  { id: 'created', label: 'Сначала новые' },
  { id: 'title', label: 'По названию' },
];

export const FOLDER_COLORS: { color: string; name: string }[] = [
  { color: '#4A7FC1', name: 'Синяя' },
  { color: '#3C9A72', name: 'Зелёная' },
  { color: '#D0693F', name: 'Оранжевая' },
  { color: '#E0A93A', name: 'Жёлтая' },
  { color: '#8A68C4', name: 'Фиолетовая' },
  { color: '#D46A8A', name: 'Розовая' },
  { color: '#B38B5D', name: 'Крафт' },
  { color: '#5B6271', name: 'Серая' },
];

const KEY = 'planx-boards', FOLDERS = 'planx-folders', THUMB = 'planx-thumb-';

export const randomColor = () => FOLDER_COLORS[Math.floor(Math.random() * FOLDER_COLORS.length)].color;

/** The boards as kept, or null before this browser has ever had a shelf. */
export function readShelf(): BoardEntry[] | null {
  const list = readJSON<BoardEntry[]>(KEY);
  return Array.isArray(list) ? list : null;
}

export function writeShelf(list: BoardEntry[]): void {
  writeJSON(KEY, list);
  window.dispatchEvent(new Event('planx:shelf'));
}

export function readFolders(): FolderEntry[] {
  const list = readJSON<FolderEntry[]>(FOLDERS);
  return Array.isArray(list) ? list : [];
}

export function writeFolders(list: FolderEntry[]): void {
  writeJSON(FOLDERS, list);
  window.dispatchEvent(new Event('planx:shelf'));
}

export function newEntry(id: string, patch: Partial<BoardEntry> = {}, now = Date.now()): BoardEntry {
  return { id, title: '', created: now, opened: now, edited: now, items: 0, ...patch };
}

/** Changes one board on the shelf, putting it there first if it isn't. */
export function updateEntry(id: string, patch: Partial<BoardEntry>): BoardEntry {
  const list = readShelf() ?? [];
  const at = list.findIndex((b) => b.id === id);
  const next = at < 0 ? newEntry(id, patch) : { ...list[at], ...patch };
  if (at < 0) list.push(next);
  else list[at] = next;
  writeShelf(list);
  return next;
}

export function removeEntry(id: string): void {
  writeShelf((readShelf() ?? []).filter((b) => b.id !== id));
}

export function addFolder(id: string, patch: Partial<FolderEntry>, now = Date.now()): FolderEntry {
  const f: FolderEntry = { id, title: '', color: randomColor(), parent: null, created: now, opened: now, ...patch };
  writeFolders([...readFolders(), f]);
  return f;
}

export function updateFolder(id: string, patch: Partial<FolderEntry>): void {
  writeFolders(readFolders().map((f) => (f.id === id ? { ...f, ...patch } : f)));
}

/** Deletes a folder; what was in it moves up into the folder it was in. */
export function removeFolder(id: string): void {
  const folders = readFolders(), gone = folders.find((f) => f.id === id);
  if (!gone) return;
  const up = gone.parent ?? null;
  writeFolders(folders.filter((f) => f.id !== id).map((f) => (f.parent === id ? { ...f, parent: up } : f)));
  writeShelf((readShelf() ?? []).map((b) => (b.folder === id ? { ...b, folder: up } : b)));
}

/** The folder a board or folder is really in: none when it names a folder that's gone. */
export function placeOf(parent: string | null | undefined, folders: FolderEntry[]): string | null {
  return parent && folders.some((f) => f.id === parent) ? parent : null;
}

/** The folders from the top down to this one, itself included. */
export function pathTo(id: string | null, folders: FolderEntry[]): FolderEntry[] {
  const out: FolderEntry[] = [];
  const seen = new Set<string>();
  for (let f = folders.find((x) => x.id === id); f && !seen.has(f.id); f = folders.find((x) => x.id === f!.parent)) {
    seen.add(f.id);
    out.unshift(f);
  }
  return out;
}

/** This folder and every folder inside it, however deep: where it can't be moved into. */
export function withInside(id: string, folders: FolderEntry[]): Set<string> {
  const out = new Set([id]);
  for (let grew = true; grew;) {
    grew = false;
    for (const f of folders) if (f.parent && out.has(f.parent) && !out.has(f.id)) { out.add(f.id); grew = true; }
  }
  return out;
}

/** The boards in a folder or any folder inside it. */
export function boardsInside(id: string, boards: BoardEntry[], folders: FolderEntry[]): BoardEntry[] {
  const all = withInside(id, folders);
  return boards.filter((b) => b.folder && all.has(b.folder));
}

/** A small picture of everything on the board (a data URL), kept apart so the list stays small. */
export const readThumb = (id: string): string | null => readText(`${THUMB}${id}`);
export const writeThumb = (id: string, url: string | null): void => writeText(`${THUMB}${id}`, url);

/** Lower case, ё as е: what's looked for and where. */
export const fold = (s: string) => s.toLocaleLowerCase('ru').replace(/ё/g, 'е');

export const nameOf = (x: { title: string }, untitled = 'Без названия') => x.title || untitled;

/** Those matching the search, in the chosen order. `when` gives the time each is sorted by. */
export function arrange<T extends { title: string }>(list: T[], query: string, sort: SortBy, when: (x: T, by: Exclude<SortBy, 'title'>) => number): T[] {
  const q = fold(query.trim());
  const found = q ? list.filter((x) => fold(nameOf(x)).includes(q)) : list.slice();
  const byTitle = (a: T, b: T) => nameOf(a).localeCompare(nameOf(b), 'ru', { numeric: true });
  return found.sort(sort === 'title' ? byTitle : (a, b) => when(b, sort) - when(a, sort) || byTitle(a, b));
}

/** "только что", "5 мин назад", "вчера", "3 дня назад", "12 марта". */
export function ago(t: number, now = Date.now()): string {
  const min = Math.floor((now - t) / 60000);
  if (min < 1) return 'только что';
  if (min < 60) return `${min} мин назад`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} ч назад`;
  const d = Math.floor(h / 24);
  if (d === 1) return 'вчера';
  if (d < 7) return `${d} ${plural(d, 'день', 'дня', 'дней')} назад`;
  const date = new Date(t), sameYear = date.getFullYear() === new Date(now).getFullYear();
  return date.toLocaleDateString('ru', sameYear ? { day: 'numeric', month: 'long' } : { day: 'numeric', month: 'long', year: 'numeric' });
}

export function plural(n: number, one: string, few: string, many: string): string {
  const a = n % 10, b = n % 100;
  if (a === 1 && b !== 11) return one;
  if (a >= 2 && a <= 4 && (b < 12 || b > 14)) return few;
  return many;
}

/** A board's id from a link to it, or from the id itself. */
export function idFromLink(text: string): string | null {
  const s = text.trim();
  let id: string | null = s;
  try { id = new URL(s).searchParams.get('board'); } catch { /* not a link: maybe the id */ }
  return id && /^[A-Za-z0-9_-]{1,64}$/.test(id) ? id : null;
}

export const boardUrl = (id: string) => `${location.pathname}?board=${id}`;
export const folderUrl = (id: string | null) => (id ? `${location.pathname}?folder=${id}` : location.pathname);
