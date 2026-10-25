import type { Editor } from '../editor/editor';
import type { Camera } from '../canvas/renderer';
import type { Rect } from '../canvas/geometry';

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
