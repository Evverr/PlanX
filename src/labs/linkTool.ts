import { useSyncExternalStore } from 'react';
import type { Editor } from '../editor/editor';
import type { Item } from '../model/types';

/**
 * "Связи инструментом": link dots don't come with what's picked; the «Связи» button on the zoom bar (in
 * place of the theme's, now in "Настройки") or C puts them out on every item at once instead (a mind map
 * node's under the pointer, instead of its buttons: so close together, theirs would run into each other;
 * a central topic's always; a picked node has its buttons, not its dots), the cursor as it was,
 * everything else as usual. Pressed again, they're away.
 */
let on = false;
const fns = new Set<() => void>();
export const subscribeDots = (fn: () => void) => { fns.add(fn); return () => { fns.delete(fn); }; };
export const dotsOn = () => on;
export const useDotsOn = () => useSyncExternalStore(subscribeDots, dotsOn);

/** Whether an item shows its dots with them out, the pointer anywhere: a mind map node only if it's a
 * central topic, not picked; an instance (by its contents, see linkBox), not what's in it. */
export const dotsAlways = (it: Item, picked: Set<string>) => (it.type === 'mind' ? !it.parent && !it.host && !picked.has(it.id) : !it.host);
/** And under the pointer: any mind map node too, unless it's picked. */
export const dotsUnder = (it: Item, picked: Set<string>) => dotsAlways(it, picked) || (it.type === 'mind' && !it.host && !picked.has(it.id));

export function toggleDots(ed: Editor): void {
  on = !on;
  ed.linkDots = null;
  ed.hotDot = null;
  fns.forEach((fn) => fn());
  ed.requestRender();
}
