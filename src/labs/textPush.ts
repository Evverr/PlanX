import type { Item } from '../model/types';
import { labOn } from './labs';

/** How far apart text items may lie, one under the other, and still go together. */
const NEAR = 16;

/**
 * "Текст не слипается": a text item that grows (a line more) pushes along the text items lying just
 * under it, no more than 16 apart and side by side with it, and those the ones under them; one that
 * shrinks takes them back up. Where each goes, for `it` taller by `dh`.
 */
export function pushedBelow(it: Item, dh: number, items: Item[]): Map<string, { y: number }> {
  const moves = new Map<string, { y: number }>();
  if (!dh || it.type !== 'text' || it.rot || !labOn('textPush')) return moves;
  const texts = items.filter((i) => i.type === 'text' && !i.rot && !i.host && !i.lock && i.id !== it.id);
  const queue = [it];
  while (queue.length) {
    const top = queue.shift()!, bottom = top.y + top.h;
    for (const t of texts) {
      if (moves.has(t.id)) continue;
      const gap = t.y - bottom, side = t.x < top.x + top.w && top.x < t.x + t.w;
      if (side && gap >= 0 && gap <= NEAR) {
        moves.set(t.id, { y: t.y + dh });
        queue.push(t);
      }
    }
  }
  return moves;
}
