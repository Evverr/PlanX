import type { Item, ItemType } from '../model/types';

/** "Поиск по доске": what on the board has the words typed. */
export interface Found { id: string; kind: string; text: string; at: number; len: number }

const KINDS: Partial<Record<ItemType, string>> = {
  sticky: 'Стикер', text: 'Текст', rect: 'Фигура', ellipse: 'Фигура', polygon: 'Фигура', frame: 'Фрейм',
  task: 'Задача', table: 'Таблица', mind: 'Карта',
};

/** Letters as searched: any case, and ё as е. */
const norm = (s: string) => s.toLowerCase().replaceAll('ё', 'е');

/** The items whose text (a table's cells, one by one) has the query, top of the board first, at most `max`. */
export function findOnBoard(items: Item[], query: string, max = 50): Found[] {
  const q = norm(query.trim());
  if (!q) return [];
  const out: Found[] = [];
  const sorted = [...items].sort((a, b) => a.y - b.y || a.x - b.x);
  for (const it of sorted) {
    const kind = KINDS[it.type];
    if (!kind) continue;
    const texts = it.type === 'table' ? it.cells ?? [] : [it.text ?? ''];
    for (const text of texts) {
      const at = norm(text).indexOf(q);
      if (at < 0) continue;
      out.push({ id: it.id, kind, text, at, len: q.length });
      break;
    }
    if (out.length >= max) break;
  }
  return out;
}

/** A line of the text around the match: up to `room` characters before it, on one line. */
export function snippet(f: Found, room = 24): { before: string; match: string; after: string } {
  const flat = f.text.replace(/\s+/g, ' ');
  // Squashing the spaces may shift the match a little; find it again in the flat text.
  const at = Math.max(0, norm(flat).indexOf(norm(f.text.slice(f.at, f.at + f.len)).replace(/\s+/g, ' ')));
  const start = Math.max(0, at - room);
  return { before: (start > 0 ? '…' : '') + flat.slice(start, at), match: flat.slice(at, at + f.len), after: flat.slice(at + f.len, at + f.len + 60) };
}
