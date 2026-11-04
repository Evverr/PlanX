import { useRef, useSyncExternalStore } from 'react';
import type { Editor } from '../editor/editor';
import type { Item } from '../model/types';
import { boxOf, instanceBounds } from '../canvas/geometry';
import { subscribeTidy, tidyMatches, tidyNow } from './tidy';
import { holds } from './tidyMind';

/**
 * "Панель над элементом" (src/labs): one selection panel, over what's picked; at the bottom instead
 * where it would be in the way there: what's picked more than half the screen across or high (big, or
 * several far apart) or partly off it, or the handles of «Авторасположение» up (it would lie over
 * them).
 */
export function panelPlace(ed: Editor, items: Item[]): 'over' | 'bottom' {
  if (!items.length || tidyMatches(ed) || holds(ed)) return 'bottom';
  const all = ed.board.list(), boxes = items.map((i) => (i.inst ? instanceBounds(i, all) : boxOf(i)));
  const a = ed.toScreen({ x: Math.min(...boxes.map((b) => b.x)), y: Math.min(...boxes.map((b) => b.y)) });
  const b = ed.toScreen({ x: Math.max(...boxes.map((r) => r.x + r.w)), y: Math.max(...boxes.map((r) => r.y + r.h)) });
  const W = ed.canvas?.clientWidth ?? innerWidth, H = ed.canvas?.clientHeight ?? innerHeight;
  const big = b.x - a.x > W / 2 || b.y - a.y > H / 2, off = a.x < 0 || a.y < 0 || b.x > W || b.y > H;
  return big || off ? 'bottom' : 'over';
}

/** Where the selection panel goes (see panelPlace), worked out as something is picked (or the handles
 *  of «Авторасположение» come or go) and kept while it stays picked: moving or zooming the board, the
 *  panel stays by it. */
export function usePanelPlace(ed: Editor, items: Item[]): 'over' | 'bottom' {
  useSyncExternalStore(subscribeTidy, tidyNow);
  const key = `${items.map((i) => i.id).join()}|${tidyMatches(ed)}|${holds(ed)}`;
  const kept = useRef<{ key: string; place: 'over' | 'bottom' } | null>(null);
  if (kept.current?.key !== key) kept.current = { key, place: panelPlace(ed, items) };
  return kept.current.place;
}
