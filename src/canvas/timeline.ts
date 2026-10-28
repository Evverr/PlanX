import type { Item } from '../model/types';
import { font } from './text';

/**
 * Таймлайн (from the Figma "Доски" file, node 68:2105): a white card of days in a row, from the day
 * it starts with (`tl`, "YYYY-MM-DD"; moved by its left side), as many as its width holds. Each month has its name
 * over its day numbers; down the card a faint line starts each day, a darker one each week (on
 * Mondays), a blue one each month, a red one (and number) today. Stretched wider, it shows more days; taller, its lines run longer.
 * What's put on it is held as a frame holds things, and moved along it in half days.
 */

/** Today's line and number. */
const TODAY = '#E5484D';

/** A day across, the card's sides, and where its rows are, as in the mockup. */
export const DAY = 23;
export const TL_PAD = 19;
const NAME_Y = 13, NUMBER_Y = 26, LINES_Y = 39, BOTTOM = 19;
const MONTHS = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];

/** The day a timeline starts with ("YYYY-MM-DD"; "YYYY-MM", from before, is the first of it). */
export const tlStart = (it: Item): Date => {
  const [y, m, d] = (it.tl ?? '').split('-').map(Number);
  return new Date(y || new Date().getFullYear(), (m || 1) - 1, d || 1);
};

/** "YYYY-MM-DD" of the day `by` days on from `d`. */
export const dayKey = (d: Date, by = 0): string => {
  const n = new Date(d.getFullYear(), d.getMonth(), d.getDate() + by);
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`;
};

/** A new timeline's size: this month and the next. */
export function timelineSize(start: Date): { w: number; h: number } {
  const days = new Date(start.getFullYear(), start.getMonth() + 2, 0).getDate() + new Date(start.getFullYear(), start.getMonth() + 1, 0).getDate();
  return { w: TL_PAD * 2 + days * DAY, h: 190 };
}

/** How many days its width holds. */
export const tlDays = (it: Item): number => Math.max(1, Math.floor((it.w - TL_PAD * 2) / DAY + 0.01));

/** Where something's left side goes to be at a whole or half day on the timeline. */
export const halfDay = (tl: Item, x: number): number => {
  const from = tl.x + TL_PAD;
  return from + Math.round((x - from) / (DAY / 2)) * (DAY / 2);
};

export function drawTimeline(ctx: CanvasRenderingContext2D, it: Item, colors: { card: string; ink: string }, z: number): void {
  ctx.fillStyle = colors.card;
  ctx.beginPath();
  ctx.roundRect(it.x, it.y, it.w, it.h, 10);
  ctx.fill();
  const start = tlStart(it), days = tlDays(it), top = it.y + LINES_Y, bottom = it.y + it.h - BOTTOM;
  const now = new Date(), thisYear = now.getFullYear(), legible = 9 * z >= 4;
  const today = (d: Date) => d.getDate() === now.getDate() && d.getMonth() === now.getMonth() && d.getFullYear() === thisYear;
  ctx.fillStyle = colors.ink;
  ctx.textBaseline = 'top';
  for (let i = 0; i < days; i++) {
    const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i), x = it.x + TL_PAD + i * DAY;
    const first = d.getDate() === 1, monday = d.getDay() === 1, now = today(d);
    // The line starting the day: blue for a month, darker for a week, red for today.
    ctx.globalAlpha = now ? 0.8 : first ? 0.4 : monday ? 0.11 : 0.05;
    ctx.fillStyle = now ? TODAY : first ? '#0F7CEA' : colors.ink;
    // A board unit wide, but never under a pixel on the screen; the month's a unit longer.
    ctx.fillRect(first ? x : x - 1, first ? top - 1 : top, Math.max(1, 1 / z), bottom - top + (first ? 1 : 0));
    if (!legible) continue;
    ctx.globalAlpha = now ? 1 : 0.3;
    ctx.fillStyle = now ? TODAY : colors.ink;
    ctx.font = font(9, now ? 600 : 400, 'inter');
    ctx.textAlign = 'center';
    ctx.fillText(String(d.getDate()), x + 1 + 21 / 2, it.y + NUMBER_Y + 1);
    // The month's name over its first day (or the card's, for the month it starts in), with its year
    // when it's not this one.
    if (first || i === 0) {
      ctx.globalAlpha = 0.3;
      ctx.fillStyle = colors.ink;
      ctx.font = font(10, 500, 'inter');
      ctx.textAlign = 'left';
      ctx.fillText(`${MONTHS[d.getMonth()]}${d.getFullYear() !== thisYear ? ` ${d.getFullYear()}` : ''}`.toUpperCase(), x, it.y + NAME_Y);
    }
  }
  ctx.globalAlpha = 1;
}
