import { useSyncExternalStore } from 'react';
import { labOn } from './labs';

/**
 * "Режим настройки меню": in the board menu, a switch; on, the panels' buttons can be rearranged (taken
 * and dragged along their panel, held or not, or off the rail onto the board); off, they stay put. Not
 * kept: each time it's off at first.
 */
let on = false;
const fns = new Set<() => void>();
const show = () => document.documentElement.toggleAttribute('data-customize', on);
export const subscribeCustomize = (fn: () => void) => { fns.add(fn); return () => { fns.delete(fn); }; };
export const customizeOn = () => labOn('customize') && on;
export const useCustomize = () => useSyncExternalStore(subscribeCustomize, () => on);
/** Whether the panels' buttons can be rearranged now (always, with the feature off). */
export const canRearrange = () => !labOn('customize') || on;

export function setCustomize(v: boolean): void {
  on = v;
  show();
  fns.forEach((fn) => fn());
}
