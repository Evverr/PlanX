import { useRef, useSyncExternalStore } from 'react';
import type { Editor } from '../editor/editor';
import type { Item } from '../model/types';
import { subscribeTidy, tidyNow } from './tidy';
import { holds } from './tidyMind';

/**
 * "Панель над элементом" (src/labs): one selection panel, by what's picked (over it, or under it with
 * no room over it); at the bottom instead with the handles of «Авторасположение» up on a mind map node
 * (it would lie over them). (Several laid out so, it stays over them, its menu open where it was.)
 */
export function panelPlace(ed: Editor, items: Item[]): 'over' | 'bottom' {
  return !items.length || holds(ed) ? 'bottom' : 'over';
}

/** Where the selection panel goes (see panelPlace), worked out as something is picked (or the handles
 *  of «Авторасположение» come or go) and kept while it stays picked: moving or zooming the board, the
 *  panel stays by it. */
export function usePanelPlace(ed: Editor, items: Item[]): 'over' | 'bottom' {
  useSyncExternalStore(subscribeTidy, tidyNow);
  const key = `${items.map((i) => i.id).join()}|${holds(ed)}`;
  const kept = useRef<{ key: string; place: 'over' | 'bottom' } | null>(null);
  if (kept.current?.key !== key) kept.current = { key, place: panelPlace(ed, items) };
  return kept.current.place;
}
