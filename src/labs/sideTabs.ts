import type { Item, Side } from '../model/types';
import type { Point } from '../canvas/geometry';
import { SIDES, sidePoint } from '../canvas/geometry';
import type { Editor } from '../editor/editor';
import { isLocked, labOn } from './labs';

/**
 * «Полукруги на рамке»: on the selection frame of what's picked alone, at the middle of each side, a small
 * half circle stuck to it, of its colour. Under the pointer, a ball in its place (as the link dots'); a
 * click on it, a copy of what's picked that way; pressed and dragged, a link from that side, as from a
 * link dot.
 */

/** Its radius, and the ball's under the pointer, in screen pixels whatever the zoom; how far the frame
 *  stands off the item's side (as the renderer's outline). */
const TAB_R = 6, BALL_R = 7.5, FRAME_OFF = 3;
/** How near it the pointer takes it, in screen pixels. */
const REACH = 12;

/** Whether what's picked gets them: on trial, not typed in, not a mind map node (its own "+"), an
 *  instance or what's in one, nor turned. */
export const tabsFor = (it: Item | undefined, editing: string | null): it is Item =>
  !!it && labOn('sideTabs') && !editing && it.type !== 'mind' && !it.inst && !it.host && !it.rot && !isLocked(it);

/** Where a side's half circle sits: on the frame, the middle of that side. */
const tabPoint = (it: Item, side: Side, zoom: number): Point => sidePoint(it, side, FRAME_OFF / zoom);

/** The side whose half circle is under the point, if any. */
export function tabAt(ed: Editor, it: Item, w: Point): Side | null {
  for (const side of SIDES) {
    const p = tabPoint(it, side, ed.cam.z);
    if (Math.hypot(w.x - p.x, w.y - p.y) <= REACH / ed.cam.z) return side;
  }
  return null;
}

/** Where each side's half circle opens out (its flat side on the frame). */
const FROM: Record<Side, number> = { right: -Math.PI / 2, bottom: 0, left: Math.PI / 2, top: Math.PI };

/** The half circles on the picked one's frame (on the board, as the frame is drawn), the one under the
 *  pointer a ball instead, just outside the frame. */
export function drawTabs(ctx: CanvasRenderingContext2D, it: Item, zoom: number, color: string, alpha: number, hot: Side | null): void {
  ctx.save();
  ctx.fillStyle = color;
  for (const side of SIDES) {
    const p = tabPoint(it, side, zoom);
    ctx.beginPath();
    if (side === hot) {
      const b = sidePoint(it, side, (FRAME_OFF + BALL_R) / zoom);
      ctx.globalAlpha = 0.8;
      ctx.arc(b.x, b.y, BALL_R / zoom, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 2 / zoom;
      ctx.stroke();
      continue;
    }
    ctx.globalAlpha = alpha;
    ctx.arc(p.x, p.y, TAB_R / zoom, FROM[side], FROM[side] + Math.PI);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}
