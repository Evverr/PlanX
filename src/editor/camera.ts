import type { Rect } from '../canvas/geometry';
import type { Editor } from './editor';
import type { Camera } from '../canvas/renderer';
import { shownRects } from '../layout';

export const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
export const MIN_Z = 0.08, MAX_Z = 4;
/** Furthest out a board too big to be seen whole at MIN_Z may be zoomed: as far as it all shows, not past this. */
export const FLOOR_Z = 0.04;

/** How far out the board may be zoomed: MIN_Z, or (when all of `b` doesn't fit in a W × H view at
 *  that) as far as it does, down to FLOOR_Z. */
export const minZoomFor = (b: Rect | null, W: number, H: number): number =>
  !b ? MIN_Z : clamp(Math.min((W * 0.9) / Math.max(1, b.w), (H * 0.9) / Math.max(1, b.h)), FLOOR_Z, MIN_Z);
/** Zoom change per mouse wheel notch: three percentage points. */
const WHEEL_STEP = 0.03;

/** The camera zoomed by `factor` about a screen point, which stays where it is. */
export function zoomedAt(cam: Camera, sx: number, sy: number, factor: number, min = MIN_Z): Camera {
  const z = clamp(cam.z * factor, min, MAX_Z);
  const wx = (sx - cam.x) / cam.z, wy = (sy - cam.y) / cam.z;
  return { z, x: sx - wx * z, y: sy - wy * z };
}

/** The camera showing all of `b` (board units) in the `free` part of the screen, with 5% of it left
 *  empty at each side, at most at 140%. */
export function fittedTo(b: Rect, free: Rect, min = MIN_Z): Camera {
  const padX = free.w * 0.05, padY = free.h * 0.05;
  const z = clamp(Math.min((free.w - padX * 2) / b.w, (free.h - padY * 2) / b.h), min, 1.4);
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

/** What a wheel or trackpad turn does: scroll the board by (dx, dy), or zoom by a factor. With
 *  `zoomByKey` (see labs/wheelZoom.ts) the wheel zooms with Cmd or Ctrl and scrolls without. */
export function wheelMove(e: WheelEvent, cam: Camera, zoomByKey = false): { pan: [number, number] } | { zoom: number } {
  const mouseWheel = e.deltaMode !== 0 || (e.deltaX === 0 && Math.abs(e.deltaY) >= 50 && Number.isInteger(e.deltaY));
  if (zoomByKey) {
    if (e.shiftKey) return { pan: [e.deltaX || e.deltaY, 0] };
    if (e.ctrlKey && !mouseWheel) return { zoom: Math.exp(-e.deltaY * 0.004) };
    if (!e.metaKey && !e.ctrlKey) return { pan: [e.deltaX, e.deltaY] };
    const step = mouseWheel ? Math.sign(e.deltaY) * WHEEL_STEP : (e.deltaY / 100) * WHEEL_STEP;
    return { zoom: (cam.z - step) / cam.z };
  }
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
  // With the zoom changing, the one screen point showing the same board point before and after stays
  // put, and the zoom grows about it: everything runs straight towards or away from it, nothing swerves.
  // With the zoom as it was, the board just slides.
  const dz = to.z - from.z, still = Math.abs(dz) > 1e-6 * from.z;
  const w = still ? { x: (from.x - to.x) / dz, y: (from.y - to.y) / dz } : null;
  const p = w && { x: from.x + w.x * from.z, y: from.y + w.y * from.z };
  const step = () => {
    const k = Math.min(1, (performance.now() - t0) / ms), e = 1 - (1 - k) ** 3;
    if (w && p) {
      const z = k < 1 ? from.z * (to.z / from.z) ** e : to.z;
      ed.cam = k < 1 ? { z, x: p.x - w.x * z, y: p.y - w.y * z } : { ...to };
    } else ed.cam = { z: to.z, x: from.x + (to.x - from.x) * e, y: from.y + (to.y - from.y) * e };
    ed.camChanged();
    if (k < 1) flight = requestAnimationFrame(step);
  };
  step();
}

/** Stops a flight midway (when the person takes the board themselves). */
export const stopFlight = () => cancelAnimationFrame(flight);
