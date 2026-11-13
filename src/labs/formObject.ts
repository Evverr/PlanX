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
export const FORM_H = PAD + ROW * 2 + GAP + OVER_BUTTON + ROW + PAD;
/** What the empty fields say. */
export const HINTS = ['Значение 1', 'Значение 2'];

/** Where field `i` (0, 1) is, on the board. */
export const fieldBox = (it: Item, i: number) => ({ x: it.x + PAD, y: it.y + PAD + i * (ROW + GAP), w: it.w - PAD * 2, h: ROW });
/** Where its button is. */
export const buttonBox = (it: Item) => ({ x: it.x + PAD, y: it.y + PAD + ROW * 2 + GAP + OVER_BUTTON, w: it.w - PAD * 2, h: ROW });
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
  // «Заполнить» in the accent, white on it; «Редактировать» as a plain button.
  const b = buttonBox(it);
  ctx.beginPath();
  ctx.roundRect(b.x, b.y, b.w, b.h, FIELD_RAD);
  if (it.fd) {
    ctx.fillStyle = look.bg;
    ctx.fill();
    ctx.lineWidth = 1;
    ctx.strokeStyle = look.line;
    ctx.stroke();
  } else {
    ctx.fillStyle = look.accent;
    ctx.fill();
  }
  if (hot) { ctx.fillStyle = 'rgba(0, 0, 0, .08)'; ctx.fill(); }
  ctx.font = font(FORM_FS, 600);
  ctx.textAlign = 'center';
  ctx.fillStyle = it.fd ? look.ink : '#fff';
  ctx.fillText(it.fd ? 'Редактировать' : 'Заполнить', b.x + b.w / 2, b.y + b.h / 2);
  ctx.textAlign = 'left';
}
