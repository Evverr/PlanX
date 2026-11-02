import type { Editor } from '../editor/editor';
import { boxOf } from '../canvas/geometry';
import { isLocked } from './labs';

/** How the selected line up: by their left sides, middles or right sides, or their tops, middles or bottoms. */
export type AlignTo = 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom';

/** "Выравнивание" on the selection panel: each selected item moved (turned ones by their outer box) so
 *  that side or middle meets the selection's own; locked ones stay, and what's done is one undo step. */
export function alignItems(ed: Editor, to: AlignTo): void {
  const items = ed.selectedItems();
  if (items.length < 2) return;
  const boxes = items.map((it) => boxOf(it));
  const x1 = Math.min(...boxes.map((b) => b.x)), x2 = Math.max(...boxes.map((b) => b.x + b.w));
  const y1 = Math.min(...boxes.map((b) => b.y)), y2 = Math.max(...boxes.map((b) => b.y + b.h));
  ed.board.transact(() => items.forEach((it, i) => {
    if (isLocked(it)) return;
    const b = boxes[i];
    const dx = to === 'left' ? x1 - b.x : to === 'right' ? x2 - b.x - b.w : to === 'center' ? (x1 + x2) / 2 - b.x - b.w / 2 : 0;
    const dy = to === 'top' ? y1 - b.y : to === 'bottom' ? y2 - b.y - b.h : to === 'middle' ? (y1 + y2) / 2 - b.y - b.h / 2 : 0;
    if (dx || dy) ed.board.update(it.id, { x: Math.round(it.x + dx), y: Math.round(it.y + dy) });
  }));
}
