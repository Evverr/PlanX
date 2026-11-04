import { useSyncExternalStore } from 'react';
import { readJSON, writeJSON } from '../storage';

/**
 * "Стекло" (in "Настройки", kept per browser), off at first: the panels and popups, instead of plain
 * white (or dark), see-through at 84% with what's behind them blurred 12px (see labs.css).
 */
const KEY = 'planx-glass';
let on = readJSON<boolean>(KEY) === true;
const listeners = new Set<() => void>();
const show = () => document.documentElement.toggleAttribute('data-glass', on);
show();

export const glassOn = () => on;
export const useGlass = () => useSyncExternalStore((fn) => { listeners.add(fn); return () => { listeners.delete(fn); }; }, glassOn);

export function setGlass(v: boolean): void {
  on = v;
  writeJSON(KEY, v);
  show();
  listeners.forEach((fn) => fn());
}
