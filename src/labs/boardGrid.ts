import { useSyncExternalStore } from 'react';
import { readJSON, writeJSON } from '../storage';
import { labOn } from './labs';

/**
 * "Фон доски": in the board menu, three dots to pick what's drawn on the board's background: lines,
 * dots, or nothing. Kept per browser.
 */
export type GridKind = 'lines' | 'dots' | 'none';

const KEY = 'planx-grid';
let kind: GridKind = readJSON<GridKind>(KEY) ?? 'lines';
const listeners = new Set<() => void>();

export const subscribeGrid = (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; };
/** What the board's background has on it now. */
export const gridKind = (): GridKind => (labOn('boardGrid') ? kind : 'lines');
export const useGridKind = () => useSyncExternalStore(subscribeGrid, () => kind);

export function setGridKind(k: GridKind): void {
  kind = k;
  writeJSON(KEY, k);
  listeners.forEach((fn) => fn());
}
