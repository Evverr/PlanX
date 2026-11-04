import { labOn } from './labs';

/**
 * "Мелочи при отдалении" (src/labs): the small things drawn the same size on screen whatever the zoom
 * go when the board is zoomed out past their zoom (1 = 100%) and come back past it, fading as a popup
 * does (in .16s, out .08s, as in styles/moves.css); while gone they can't be pressed. On what's picked
 * they stay.
 */
export const ZOOM_GONE = {
  /** A component's tick and its arrow ("Объекты"). */
  comp: 0.4,
  /** Reactions under items. */
  reactions: 0.3,
  /** The padlock on locked items. */
  lock: 0.3,
  /** A folded mind map node's count. */
  fold: 0.25,
};
type Kind = keyof typeof ZOOM_GONE;
const IN = 160, OUT = 80;

// Each kind's last turn: shown or not, from what it looked like then, and when.
const turns = new Map<Kind, { on: boolean; from: number; at: number }>();

const ease = (t: number) => 1 - (1 - t) * (1 - t);
function look(t: { on: boolean; from: number; at: number }, now: number): number {
  const k = Math.min(1, (now - t.at) / (t.on ? IN : OUT));
  return t.from + ((t.on ? 1 : 0) - t.from) * ease(k);
}

/** Whether it's there at this zoom (to be pressed); always when picked. */
export const zoomShows = (kind: Kind, z: number, picked = false): boolean => picked || !labOn('zoomFade') || z >= ZOOM_GONE[kind];

/** How much of it to draw at this zoom, from 1 (whole) to 0 (gone), on its way in or out. */
export function zoomFade(kind: Kind, z: number, picked = false): number {
  if (picked || !labOn('zoomFade')) return 1;
  const on = z >= ZOOM_GONE[kind], now = performance.now();
  let t = turns.get(kind);
  if (!t) turns.set(kind, (t = { on, from: on ? 1 : 0, at: 0 }));
  else if (t.on !== on) turns.set(kind, (t = { on, from: look(t, now), at: now }));
  return look(t, now);
}

/** Whether something is still fading in or out (and wants another frame). */
export function zoomFading(): boolean {
  const now = performance.now();
  return [...turns.values()].some((t) => now - t.at < (t.on ? IN : OUT));
}
