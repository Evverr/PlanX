import type { Item } from './types';

/**
 * Folding frames: a double click folds a frame into a bar the size of a mind map's central topic, its
 * title inside, with what it holds hidden (and still carried along), and unfolds the bar again.
 * `fold` keeps its unfolded size.
 */
export const FOLD_H = 72, FOLD_FS = 18, FOLD_PAD = 24, FOLD_ICON = 24, FOLD_RIGHT = 20, FOLD_TITLE_GAP = 20;
/** The widest a folded frame's title is shown, in board units. */
export const FOLD_TITLE_MAX = 320;

export type FrameButton = 'peek';

/** A frame's buttons, each as the box its icon is drawn in (board units): on a folded one, a look at
 *  what it holds, at its right end; an unfolded one has none. */
export function frameButtons(it: Item): Array<{ kind: FrameButton; icon: string; x: number; y: number; s: number }> {
  if (it.type !== 'frame' || !it.fold) return [];
  return [{ kind: 'peek', icon: 'seen-items', x: it.x + it.w - FOLD_RIGHT - FOLD_ICON, y: it.y + (it.h - FOLD_ICON) / 2, s: FOLD_ICON }];
}
