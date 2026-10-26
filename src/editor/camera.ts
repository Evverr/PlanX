import type { Rect } from '../canvas/geometry';
import type { Editor } from './editor';
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

/** The camera that shows `r` in the middle of the screen, at most `fill` of it across, zoomed in no
 *  further than `maxZ`. */
export function cameraFor(ed: Editor, r: Rect, fill = 0.6, maxZ = Infinity): Camera {
  const W = ed.canvas?.clientWidth ?? innerWidth, H = ed.canvas?.clientHeight ?? innerHeight;
  const z = Math.min(maxZ, (W * fill) / Math.max(1, r.w), (H * fill) / Math.max(1, r.h));
  return { z, x: W / 2 - (r.x + r.w / 2) * z, y: H / 2 - (r.y + r.h / 2) * z };
}

let flight = 0;

/** Moves the camera there smoothly over `ms` (zooming evenly, not in jumps). */
export function flyTo(ed: Editor, to: Camera, ms = 380): void {
  cancelAnimationFrame(flight);
  const from = { ...ed.cam }, t0 = performance.now();
  // The board point in the middle of the screen, and the zoom, go from one to the other.
  const W = ed.canvas?.clientWidth ?? innerWidth, H = ed.canvas?.clientHeight ?? innerHeight;
  const mid = (c: Camera) => ({ x: (W / 2 - c.x) / c.z, y: (H / 2 - c.y) / c.z });
  const a = mid(from), b = mid(to);
  const step = () => {
    const k = Math.min(1, (performance.now() - t0) / ms), e = 1 - (1 - k) ** 3;
    const z = from.z * (to.z / from.z) ** e, m = { x: a.x + (b.x - a.x) * e, y: a.y + (b.y - a.y) * e };
    ed.cam = { z, x: W / 2 - m.x * z, y: H / 2 - m.y * z };
    ed.camChanged();
    if (k < 1) flight = requestAnimationFrame(step);
  };
  step();
}

/** Stops a flight midway (when the person takes the board themselves). */
export const stopFlight = () => cancelAnimationFrame(flight);
