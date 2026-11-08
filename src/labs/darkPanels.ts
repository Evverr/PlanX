import { useSyncExternalStore } from 'react';
import { readJSON, writeJSON } from '../storage';

/**
 * "Панели тёмного цвета" (in "Настройки", kept per browser), off at first: the panels, menus and popups
 * as in the dark theme, the board and what's on it as light as ever (see labs.css).
 */
const KEY = 'planx-dark-panels';
let on = readJSON<boolean>(KEY) === true;
const listeners = new Set<() => void>();
const show = () => document.documentElement.toggleAttribute('data-dark-panels', on);
show();

export const darkPanelsOn = () => on;
export const useDarkPanels = () => useSyncExternalStore((fn) => { listeners.add(fn); return () => { listeners.delete(fn); }; }, darkPanelsOn);

export function setDarkPanels(v: boolean): void {
  on = v;
  writeJSON(KEY, v);
  show();
  listeners.forEach((fn) => fn());
}
