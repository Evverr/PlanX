import { useSyncExternalStore } from 'react';
import type { Editor } from '../editor/editor';

/**
 * "Связи инструментом": link dots don't come with what's picked; the «Линии» button on the left rail
 * (or C) puts them out on every item at once instead (a mind map node's under the pointer), the cursor
 * as it was, everything else as usual. Pressed again, they're away.
 */
let on = false;
const fns = new Set<() => void>();
export const subscribeDots = (fn: () => void) => { fns.add(fn); return () => { fns.delete(fn); }; };
export const dotsOn = () => on;
export const useDotsOn = () => useSyncExternalStore(subscribeDots, dotsOn);

export function toggleDots(ed: Editor): void {
  on = !on;
  ed.linkDots = null;
  ed.hotDot = null;
  fns.forEach((fn) => fn());
  ed.requestRender();
}
