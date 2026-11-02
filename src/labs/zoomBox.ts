import type { Editor } from '../editor/editor';
import type { Rect } from '../canvas/geometry';
import { cameraFor, flyTo, MAX_Z } from '../editor/camera';
import { labOn } from './labs';

/**
 * "Зум рамкой" (src/labs): Z held down, a box drawn on the board (from anywhere, over items too) and let
 * go: what's in it fills the screen.
 */
let held = false;
export const zoomBoxHeld = () => held && labOn('zoomBox');
/** While Z is held the board's cursor is the magnifier, whatever's under the pointer (see labs.css). */
export const holdZoomBox = (on: boolean) => {
  held = on;
  document.querySelector('.board-canvas')?.toggleAttribute('data-zoom-box', zoomBoxHeld());
};

/** The box let go of: the camera flies to show it whole, as big as the screen takes (a click or a twitch, nothing). */
export function zoomToBox(ed: Editor, r: Rect | null): void {
  if (!r || r.w * ed.cam.z < 8 || r.h * ed.cam.z < 8) return;
  flyTo(ed, cameraFor(ed, r, 1, MAX_Z));
}
