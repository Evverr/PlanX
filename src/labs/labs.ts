import { useSyncExternalStore } from 'react';
import type { Item } from '../model/types';
import { readJSON, readText, writeJSON, writeText } from '../storage';

/**
 * Features on trial ("Нововведения"): each can be switched on and off in the board menu, kept per
 * browser. Everything they need lives in this folder; the app only asks labOn() where a feature
 * changes what it does, so one that isn't kept comes out by deleting its file and those few lines.
 */
export type LabId = 'export' | 'pdf' | 'tidy' | 'lock' | 'search' | 'timer' | 'reactions' | 'laser' | 'follow' | 'cursors' | 'keys' | 'swap' | 'textPush' | 'wishlist' | 'clickThrough' | 'multi' | 'textLink';

export interface Lab { id: LabId; label: string; icon: string; hint: string }

/** In the order they're listed in the menu. `icon` is from the board's icon set. */
export const LABS: Lab[] = [
  { id: 'export', label: 'Экспорт в PNG', icon: 'download', hint: 'Скачать доску или выделенное картинкой' },
  { id: 'pdf', label: 'Экспорт в PDF', icon: 'file', hint: 'Скачать доску или выделенное PDF-файлом' },
  { id: 'tidy', label: 'Авторасположение', icon: 'apps', hint: 'Выделенное ровной сеткой; отступы между рядами и столбцами тянутся' },
  { id: 'lock', label: 'Замок', icon: 'lock-l', hint: 'Закреплённое не сдвинуть и не удалить' },
  { id: 'search', label: 'Поиск по доске', icon: 'search', hint: 'Ctrl+F: найти текст на доске' },
  { id: 'timer', label: 'Общий таймер', icon: 'timer', hint: 'Отсчёт, который видят все на доске' },
  { id: 'reactions', label: 'Реакции', icon: 'like', hint: 'Лайки и другие значки на элементах' },
  { id: 'laser', label: 'Лазерная указка', icon: 'magic-wand', hint: 'K: след, который тает за секунду' },
  { id: 'follow', label: 'Следовать за участником', icon: 'meeting-point', hint: 'Смотреть туда же, куда другой, и звать всех к себе' },
  { id: 'cursors', label: 'Курсоры участников', icon: 'user-profile', hint: 'Видеть, где мышь у других на доске' },
  { id: 'keys', label: 'Шпаргалка по клавишам', icon: 'keyboard', hint: '?: все сочетания клавиш' },
  { id: 'textPush', label: 'Текст не слипается', icon: 'arrow-down-l', hint: 'Текст, ставший выше, отодвигает текст прямо под ним (до 16 px), и в инстансе тоже' },
  { id: 'wishlist', label: 'Wishlist', icon: 'like', hint: 'На странице «Мои доски»: общий список пожеланий с лайками' },
  { id: 'textLink', label: 'Ссылка в тексте', icon: 'link', hint: 'Кнопка-цепочка на панели текста; Cmd+клик (Ctrl+клик) открывает ссылку' },
  { id: 'multi', label: 'Несколько сразу', icon: 'layers', hint: 'Выбрано несколько: общий текст на панели и один уголок, чтобы масштабировать всё вместе' },
  { id: 'clickThrough', label: 'Клик сквозь', icon: 'layers', hint: 'Медленный повторный клик по выбранному выбирает то, что под ним' },
  { id: 'swap', label: 'Замена двойным кликом', icon: 'refresh-l', hint: 'Двойной клик по смайлу, иконке или фигуре: выбрать другую на её место, и в инстансе тоже' },
];

const KEY = 'planx-labs';

/** What's switched off; anything not listed is on, so a new feature shows up switched on. */
let off = new Set<LabId>(readJSON<LabId[]>(KEY) ?? []);
let snapshot: Record<LabId, boolean> = makeSnapshot();
const listeners = new Set<() => void>();

function makeSnapshot(): Record<LabId, boolean> {
  return Object.fromEntries(LABS.map((l) => [l.id, !off.has(l.id)])) as Record<LabId, boolean>;
}

export function labOn(id: LabId): boolean {
  return !off.has(id);
}

export function setLab(id: LabId, on: boolean): void {
  off = new Set(off);
  if (on) off.delete(id); else off.add(id);
  writeJSON(KEY, [...off]);
  snapshot = makeSnapshot();
  listeners.forEach((fn) => fn());
}

export function subscribeLabs(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Which features are on, for React. */
export function useLabs(): Record<LabId, boolean> {
  return useSyncExternalStore(subscribeLabs, () => snapshot);
}

/** Whether an item is locked in place (and the lock is switched on). */
export const isLocked = (it: Item | undefined): boolean => !!it?.lock && labOn('lock');

/** This browser's own id, for telling whose reaction is whose (the people's ids change each visit). */
export function myId(): string {
  let id = readText('planx-labs-id');
  if (!id) {
    id = Math.random().toString(36).slice(2, 12);
    writeText('planx-labs-id', id);
  }
  return id;
}
