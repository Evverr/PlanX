import type { Item } from './types';

/**
 * Folding frames: a folded frame shrinks to a bar the size of a mind map's central topic, its title
 * inside, with what it holds hidden (and still carried along). `fold` keeps its unfolded size.
 */
export const FOLD_H = 72, FOLD_FS = 18, FOLD_PAD = 24, FOLD_ICON = 24, FOLD_GAP = 8, FOLD_RIGHT = 20, FOLD_TITLE_GAP = 20;
/** The widest a folded frame's title is shown, in board units. */
export const FOLD_TITLE_MAX = 320;

export type FrameButton = 'fold' | 'unfold' | 'peek';

/**
 * A frame's buttons, each as the box its icon is drawn in (board units): on an unfolded frame, the
 * fold arrow in its lower right corner, the same size on screen whatever the zoom (and only while
 * the frame is big enough on screen to have room for it); on a folded one, a look at what it holds
 * and the unfold arrow, at its right end.
 */
export function frameButtons(it: Item, zoom: number): Array<{ kind: FrameButton; icon: string; x: number; y: number; s: number }> {
  if (it.type !== 'frame') return [];
  if (it.fold) {
    const y = it.y + (it.h - FOLD_ICON) / 2, x = it.x + it.w - FOLD_RIGHT - FOLD_ICON;
    return [
      { kind: 'peek', icon: 'seen-items', x: x - FOLD_GAP - FOLD_ICON, y, s: FOLD_ICON },
      { kind: 'unfold', icon: 'maximize', x, y, s: FOLD_ICON },
    ];
  }
  if (it.w * zoom < 120 || it.h * zoom < 90) return [];
  const s = 20 / zoom, inset = 12 / zoom;
  return [{ kind: 'fold', icon: 'minimize', x: it.x + it.w - inset - s, y: it.y + it.h - inset - s, s }];
}
