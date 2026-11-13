import type { Item } from '../model/types';

/**
 * «Перестроение панели» (src/labs): with «Панель над элементом», picking something near what was picked, the
 * panel over it doesn't go and come back by the new one: it stays while the new one's being picked, and
 * once it's let go the same panel glides there (see overKey in App), the buttons both have staying as they
 * are and the new ones fading in once it's there (labs.css).
 */

/** How long it takes to glide there, in ms (labs.css too). */
export const GLIDE_MS = 200;

/** How near, on the screen, the next pick has to be to the last for the panel to glide: the gap between
 *  the boxes round them, in pixels. */
export const GLIDE_NEAR = 100;

function box(items: Item[]) {
  return {
    x0: Math.min(...items.map((i) => i.x)), y0: Math.min(...items.map((i) => i.y)),
    x1: Math.max(...items.map((i) => i.x + i.w)), y1: Math.max(...items.map((i) => i.y + i.h)),
  };
}

/** Whether two picks are near enough for the panel to glide from one to the other, at zoom `z`. */
export function nearPicks(a: Item[], b: Item[], z: number): boolean {
  if (!a.length || !b.length) return false;
  const p = box(a), q = box(b);
  const dx = Math.max(0, p.x0 - q.x1, q.x0 - p.x1), dy = Math.max(0, p.y0 - q.y1, q.y0 - p.y1);
  return Math.hypot(dx, dy) * z <= GLIDE_NEAR;
}
