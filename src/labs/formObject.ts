import type { Item } from '../model/types';
import type { Point } from '../canvas/geometry';
import { font } from '../canvas/text';

/**
 * «Форма» (src/labs, one of the "Объекты"): a card as the app's popups look, two fields to type any
 * values into and a button. «Заполнить» keeps what's typed, the fields gone, the values as text, the
 * button «Редактировать» then, which brings the fields back. A rectangle with `form` set; its values in
 * `fv`, `fd` once filled. Typed into through the fields laid over it while it's picked (FormFields.tsx).
 */

/** Its width, and inside it, in board units: the room round what's in it, a field's (and the button's)
 *  height, the gap between the fields, and over the button; its corners and the fields'. */
export const FORM_W = 320;
const PAD = 16, ROW = 40, GAP = 12, OVER_BUTTON = 16;
export const FORM_RAD = 12, FIELD_RAD = 8, FIELD_PAD = 12, FORM_FS = 14;
/** A button as the app's own (.btn in popups.css): 32 high, corners 7, its text Inter 600 12. */
export const BTN_H = 32;
const BTN_RAD = 7, BTN_FS = 12;
export const FORM_H = PAD + ROW * 2 + GAP + OVER_BUTTON + BTN_H + PAD;
/** What the empty fields say. */
export const HINTS = ['Значение 1', 'Значение 2'];

/** Where field `i` (0, 1) is, on the board. */
export const fieldBox = (it: Item, i: number) => ({ x: it.x + PAD, y: it.y + PAD + i * (ROW + GAP), w: it.w - PAD * 2, h: ROW });
/** Where its button is. */
export const buttonBox = (it: Item) => ({ x: it.x + PAD, y: it.y + PAD + ROW * 2 + GAP + OVER_BUTTON, w: it.w - PAD * 2, h: BTN_H });

/** Draws a button as the app's: the main one in the blue gradient at 90%, white on it; the other outlined
 *  in the panels' line, in their ink. `hot` under the pointer; `faint`, not pressable yet. */
export function drawButton(ctx: CanvasRenderingContext2D, b: { x: number; y: number; w: number; h: number }, label: string, main: boolean,
  look: { line: string; ink: string }, hot = false, faint = false): void {
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(b.x, b.y, b.w, b.h, BTN_RAD);
  ctx.globalAlpha = (faint ? 0.4 : 1) * 0.9;
  if (main) {
    const g = ctx.createLinearGradient(0, b.y, 0, b.y + b.h);
    g.addColorStop(0, '#549BFF');
    g.addColorStop(1, '#005FE3');
    ctx.fillStyle = g;
    ctx.fill();
  } else {
    ctx.lineWidth = 1;
    ctx.strokeStyle = look.line;
    ctx.stroke();
  }
  if (hot && !faint) { ctx.globalAlpha = 1; ctx.fillStyle = main ? 'rgba(0, 0, 0, .1)' : 'rgba(0, 0, 0, .05)'; ctx.fill(); }
  ctx.globalAlpha = faint ? 0.6 : 1;
  ctx.font = font(BTN_FS, 600, 'inter');
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = main ? '#fff' : look.ink;
  ctx.fillText(label, b.x + b.w / 2, b.y + b.h / 2);
  ctx.restore();
}
/** Whether a point on the board is on its button. */
export function onFormButton(it: Item, w: Point): boolean {
  const b = buttonBox(it);
  return w.x >= b.x && w.x <= b.x + b.w && w.y >= b.y && w.y <= b.y + b.h;
}
/** Its two values. */
export const valuesOf = (it: Item): [string, string] => [it.fv?.[0] ?? '', it.fv?.[1] ?? ''];

interface Look { surface: string; bg: string; line: string; ink: string; muted: string; accent: string }

/** Draws it: the card with its shadow, the fields (filled, the values alone) and the button, lit under
 *  the pointer (`hot`). `k` is the zoom times the screen's pixel ratio, for the shadow. */
export function drawForm(ctx: CanvasRenderingContext2D, it: Item, look: Look, k: number, hot: boolean): void {
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(it.x, it.y, it.w, it.h, FORM_RAD);
  ctx.shadowColor = 'rgba(0, 0, 0, .15)';
  ctx.shadowBlur = 12 * k;
  ctx.shadowOffsetY = 6 * k;
  ctx.fillStyle = look.surface;
  ctx.fill();
  ctx.restore();
  const values = valuesOf(it);
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  for (let i = 0; i < 2; i++) {
    const f = fieldBox(it, i);
    ctx.save();
    if (!it.fd) {
      ctx.beginPath();
      ctx.roundRect(f.x, f.y, f.w, f.h, FIELD_RAD);
      ctx.fillStyle = look.bg;
      ctx.fill();
      ctx.lineWidth = 1;
      ctx.strokeStyle = look.line;
      ctx.stroke();
      ctx.clip();
    }
    const empty = !values[i];
    ctx.font = font(FORM_FS, it.fd ? 500 : 400);
    ctx.fillStyle = empty ? look.muted : look.ink;
    ctx.fillText(empty ? (it.fd ? '—' : HINTS[i]) : values[i], f.x + (it.fd ? 0 : FIELD_PAD), f.y + f.h / 2);
    ctx.restore();
  }
  // «Заполнить» the app's main button; «Редактировать» its other one.
  drawButton(ctx, buttonBox(it), it.fd ? 'Редактировать' : 'Заполнить', !it.fd, look, hot);
}
