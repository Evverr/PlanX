import { readJSON, readText, writeJSON, writeText } from '../storage';

/**
 * The boards on this browser's shelf. The server keeps each board by its id but has no list of them,
 * so the shelf is this browser's own: a board gets on it when it's made here or opened here.
 */

export type Pattern = 'plain' | 'dots' | 'lines' | 'grid';

/** A board's cover, like a notebook's: a colour, a paper pattern, and the board peeking through a window. */
export interface Cover { color: string; pattern: Pattern; peek: boolean }

export interface BoardEntry {
  id: string;
  title: string;
  cover: Cover;
  created: number;
  /** When it was last opened here, and last changed (by anyone, seen here). */
  opened: number;
  edited: number;
  /** How many things are on it, as last seen. */
  items: number;
  pinned?: boolean;
}

export type SortBy = 'opened' | 'edited' | 'created' | 'title';

export const SORTS: { id: SortBy; label: string }[] = [
  { id: 'opened', label: 'Недавно открытые' },
  { id: 'edited', label: 'Недавно изменённые' },
  { id: 'created', label: 'Сначала новые' },
  { id: 'title', label: 'По названию' },
];

export const COVER_COLORS: { color: string; name: string }[] = [
  { color: '#2E5E8C', name: 'Океан' },
  { color: '#2F7A5B', name: 'Изумруд' },
  { color: '#B8573A', name: 'Терракота' },
  { color: '#D39B2C', name: 'Горчица' },
  { color: '#7A5BB0', name: 'Сирень' },
  { color: '#C95F80', name: 'Роза' },
  { color: '#A9825A', name: 'Крафт' },
  { color: '#3A404C', name: 'Графит' },
  { color: '#5FA3B8', name: 'Небо' },
  { color: '#8A9A3E', name: 'Олива' },
];

export const PATTERNS: { id: Pattern; label: string }[] = [
  { id: 'plain', label: 'Гладкая' },
  { id: 'dots', label: 'Точки' },
  { id: 'lines', label: 'Линейка' },
  { id: 'grid', label: 'Клетка' },
];

const KEY = 'planx-boards';
const THUMB = 'planx-thumb-';

export function randomCover(): Cover {
  return { color: COVER_COLORS[Math.floor(Math.random() * COVER_COLORS.length)].color, pattern: 'plain', peek: false };
}

/** The shelf as kept, or null before this browser has ever had one. */
export function readShelf(): BoardEntry[] | null {
  const list = readJSON<BoardEntry[]>(KEY);
  return Array.isArray(list) ? list : null;
}

export function writeShelf(list: BoardEntry[]): void {
  writeJSON(KEY, list);
  window.dispatchEvent(new Event('planx:shelf'));
}

export function newEntry(id: string, patch: Partial<BoardEntry> = {}, now = Date.now()): BoardEntry {
  return { id, title: '', cover: randomCover(), created: now, opened: now, edited: now, items: 0, ...patch };
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

/** A small picture of the board as it was left (a data URL), kept apart so the list stays small. */
export const readThumb = (id: string): string | null => readText(`${THUMB}${id}`);
export const writeThumb = (id: string, url: string | null): void => writeText(`${THUMB}${id}`, url);

/** Lower case, ё as е: what's looked for and where. */
const fold = (s: string) => s.toLocaleLowerCase('ru').replace(/ё/g, 'е');

/** The boards matching the search, in the chosen order (pinned ones aren't set apart here). */
export function arrange(list: BoardEntry[], query: string, sort: SortBy): BoardEntry[] {
  const q = fold(query.trim());
  const found = q ? list.filter((b) => fold(b.title || 'Без названия').includes(q)) : list.slice();
  const byTitle = (a: BoardEntry, b: BoardEntry) => (a.title || 'Без названия').localeCompare(b.title || 'Без названия', 'ru', { numeric: true });
  return found.sort(sort === 'title' ? byTitle : (a, b) => b[sort] - a[sort] || byTitle(a, b));
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
