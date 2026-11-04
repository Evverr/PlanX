import { labOn } from './labs';

/**
 * "Мелочи при отдалении" (src/labs): the small things drawn the same size on screen whatever the zoom
 * fade out as the board is zoomed out, so a far view isn't strewn with them. Each kind: the zoom it's
 * whole down to, and the zoom it's gone at (1 = 100%); between, it fades, and while gone it can't be
 * pressed. On what's picked they stay.
 */
export const ZOOM_FADE = {
  /** A component's tick and its arrow ("Объекты"). */
  comp: [0.5, 0.35],
  /** Reactions under items. */
  reactions: [0.4, 0.25],
  /** The padlock on locked items. */
  lock: [0.4, 0.25],
  /** A folded mind map node's count. */
  fold: [0.3, 0.2],
} satisfies Record<string, [number, number]>;

/** How much of it to draw at this zoom, from 1 (whole) to 0 (gone); always whole when picked. */
export function zoomFade(kind: keyof typeof ZOOM_FADE, z: number, picked = false): number {
  if (picked || !labOn('zoomFade')) return 1;
  const [whole, gone] = ZOOM_FADE[kind];
  return Math.max(0, Math.min(1, (z - gone) / (whole - gone)));
}
