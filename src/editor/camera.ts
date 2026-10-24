import type { Rect } from '../canvas/geometry';
import type { Camera } from '../canvas/renderer';
import { shownRects } from '../layout';

export const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
export const MIN_Z = 0.08, MAX_Z = 4;
/** Zoom change per mouse wheel notch: three percentage points. */
const WHEEL_STEP = 0.03;

/** The camera zoomed by `factor` about a screen point, which stays where it is. */
export function zoomedAt(cam: Camera, sx: number, sy: number, factor: number): Camera {
  const z = clamp(cam.z * factor, MIN_Z, MAX_Z);
  const wx = (sx - cam.x) / cam.z, wy = (sy - cam.y) / cam.z;
  return { z, x: sx - wx * z, y: sy - wy * z };
}

/** The camera showing all of `b` (board units) in the `free` part of the screen, with 5% of it left
 *  empty at each side, at most at 140%. */
export function fittedTo(b: Rect, free: Rect): Camera {
  const padX = free.w * 0.05, padY = free.h * 0.05;
  const z = clamp(Math.min((free.w - padX * 2) / b.w, (free.h - padY * 2) / b.h), MIN_Z, 1.4);
  return { z, x: free.x + free.w / 2 - (b.x + b.w / 2) * z, y: free.y + free.h / 2 - (b.y + b.h / 2) * z };
}

/** The part of a W × H canvas (at `at` on the page) clear of the panels: beside the tool rail, under
 *  the bars at the top and over those at the bottom (the whole canvas where that leaves too little). */
export function freeArea(W: number, H: number, at: { left: number; top: number }): Rect {
  let left = 0, right = W, top = 0, bottom = H;
  for (const r of shownRects('.tools')) {
    if (r.left - at.left < W / 2) left = Math.max(left, r.right - at.left);
    else right = Math.min(right, r.left - at.left);
  }
  for (const r of shownRects('.bar')) {
    if (r.top - at.top < H / 2) top = Math.max(top, r.bottom - at.top);
    else bottom = Math.min(bottom, r.top - at.top);
  }
  const free = { x: left, y: top, w: right - left, h: bottom - top };
  return free.w < W * 0.5 || free.h < H * 0.5 ? { x: 0, y: 0, w: W, h: H } : free;
}

/** What a wheel or trackpad turn does: scroll the board by (dx, dy), or zoom by a factor. */
export function wheelMove(e: WheelEvent, cam: Camera): { pan: [number, number] } | { zoom: number } {
  const mouseWheel = e.deltaMode !== 0 || (e.deltaX === 0 && Math.abs(e.deltaY) >= 50 && Number.isInteger(e.deltaY));
  // Cmd + wheel scrolls up and down, Shift + wheel sideways; a sideways swipe moves sideways.
  if (e.metaKey) return { pan: [e.deltaX, e.deltaY] };
  if (e.shiftKey) return { pan: [e.deltaX || e.deltaY, 0] };
  // A trackpad pinch (it comes as Ctrl + wheel) zooms with the fingers.
  if (e.ctrlKey) return { zoom: Math.exp(-e.deltaY * 0.004) };
  if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) return { pan: [e.deltaX, 0] };
  // The wheel zooms linearly: every notch adds or takes the same WHEEL_STEP, a smooth wheel as much per 100px.
  const step = mouseWheel ? Math.sign(e.deltaY) * WHEEL_STEP : (e.deltaY / 100) * WHEEL_STEP;
  return { zoom: (cam.z - step) / cam.z };
}
