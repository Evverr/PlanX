import type { Item } from '../model/types';
import { textsUnder } from '../model/components';
import { labOn } from './labs';

/**
 * "Текст не слипается": a text item that grows (a line more) pushes along the text items lying just
 * under it, no more than 16 apart and side by side with it, and those the ones under them; one that
 * shrinks takes them back up. Where each goes, for `it` taller by `dh`. In an instance, its sync does
 * it (from how the text lies in the component, see textShifts in model/components.ts).
 */
export function pushedBelow(it: Item, dh: number, items: Item[]): Map<string, Pick<Item, 'y'>> {
  const moves = new Map<string, Pick<Item, 'y'>>();
  if (!dh || it.type !== 'text' || it.rot || it.host || !labOn('textPush')) return moves;
  const texts = items.filter((i) => !i.host && !i.lock);
  const queue = [it];
  while (queue.length) {
    for (const t of textsUnder(queue.shift()!, texts)) {
      if (moves.has(t.id) || t.id === it.id) continue;
      moves.set(t.id, { y: t.y + dh });
      queue.push(t);
    }
  }
  return moves;
}
