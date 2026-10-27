import type { Editor } from '../editor/editor';
import type { Item } from '../model/types';
import { hitItem, type Point } from '../canvas/geometry';
import { labOn } from './labs';

/**
 * "Клик сквозь": one item lying over another, a click on the one picked (a slow one, not half of a
 * double click, and not dragged) picks what's under it there; again, what's under that; past the
 * lowest, the topmost again. Not from a mind map node, which a click on opens for typing.
 */

/** What's at the board point, top first: items as a press would find them, but for what's in
 *  instances (they're picked with them). */
export function itemsAt(ed: Editor, w: Point): Item[] {
  return ed.shown().filter((it) => !it.host && hitItem([it], w, ed.cam.z)).reverse();
}

/** The item to pick for a click at `w` on `id`, picked already; null when nothing's under it. */
export function under(ed: Editor, id: string, w: Point): Item | null {
  if (!labOn('clickThrough')) return null;
  const all = itemsAt(ed, w), i = all.findIndex((it) => it.id === id);
  if (i < 0 || all.length < 2 || all[i].type === 'mind') return null;
  return all[(i + 1) % all.length];
}
