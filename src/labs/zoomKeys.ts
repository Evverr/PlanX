import type { Editor } from '../editor/editor';
import { boundsOf } from '../canvas/geometry';
import { fittedTo, flyTo, freeArea, MAX_Z } from '../editor/camera';

/**
 * "Зум на 1 и 2" (src/labs): 1 flies to everything on the board, as Shift+1 shows it; 2 to what's
 * picked, as big as the part of the screen the panels leave free takes it, with 10% of that left
 * empty at each side so it doesn't touch its edges; nothing picked, to 100%, the pointer's place brought to the screen's middle.
 */
export function zoomKey(ed: Editor, e: KeyboardEvent): boolean {
  if (e.shiftKey || e.metaKey || e.ctrlKey || e.altKey || (e.code !== 'Digit1' && e.code !== 'Digit2')) return false;
  if (e.code === 'Digit2' && !ed.selection.size) {
    const w = ed.canvas?.clientWidth ?? innerWidth, h = ed.canvas?.clientHeight ?? innerHeight;
    // (About where the pointer is, that brought to the middle; off the board, the middle's own.)
    const sp = ed.pointerAt ?? { x: w / 2, y: h / 2 }, cx = (sp.x - ed.cam.x) / ed.cam.z, cy = (sp.y - ed.cam.y) / ed.cam.z;
    flyTo(ed, { z: 1, x: w / 2 - cx, y: h / 2 - cy });
    return true;
  }
  const b = boundsOf(e.code === 'Digit1' ? ed.shown() : ed.selectedItems());
  if (!b) return true;
  const c = ed.canvas, free = freeArea(c?.clientWidth ?? innerWidth, c?.clientHeight ?? innerHeight, c?.getBoundingClientRect() ?? { left: 0, top: 0 });
  flyTo(ed, e.code === 'Digit1' ? fittedTo(b, free, ed.minZoom()) : fittedTo(b, free, ed.minZoom(), 0.1, MAX_Z));
  return true;
}
