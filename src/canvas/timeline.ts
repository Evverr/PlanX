import type { Item } from '../model/types';
import { font } from './text';

/**
 * Таймлайн (from the Figma "Доски" file, node 68:2105): a white card of days in a row, from the day
 * it starts with (`tl`, "YYYY-MM-DD"; moved by its left side), as many as its width holds. Each month has its name
 * over its day numbers; down the card a faint line starts each day, a darker one each week (on
 * Mondays), a blue one each month, a red one (and number) today. Stretched wider, it shows more days; taller, its lines run longer.
 * Its step (`ts`) widens every day as many times, the card staying as wide (so it shows fewer).
 * What's put on it is held as a frame holds things, and moved along it in half days.
 */

/** Today's line and number. */
const TODAY = '#E5484D';

/** A day across, the card's sides, and where its rows are, as in the mockup. */
export const DAY = 23;
export const TL_PAD = 19;
const NAME_Y = 13, BOTTOM = 19;
/** Its months' and day numbers' sizes at 1x, and the gaps under them. */
const NAME_FS = 10, NUMBER_FS = 9, NAME_GAP = 3, NUMBER_GAP = 4;
/** Where its day numbers and its lines start, its writing `k` times the usual size (see Item.tfs). */
const numberY = (k: number) => NAME_Y + NAME_FS * k + NAME_GAP;
const linesY = (k: number) => numberY(k) + NUMBER_FS * k + NUMBER_GAP;
/** How tall a timeline must be with its writing that size: its usual room under its numbers kept. */
export const tlLeast = (k: number): number => 190 - linesY(1) + linesY(k);
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

/** The steps a timeline can have (see `ts`), and a day across at its own. */
export const TL_STEPS = [1, 2, 4, 6];
/** How many times the usual size its writing may be (see Item.tfs). */
export const TL_FONTS = [1, 2, 3, 4];
/** «Адаптивный текст» (Item.tfa): zoomed out, its writing grows by 1/zoom to the POWER (1: as big on the
 *  screen whatever the zoom, 0: not at all), up to MAX times its own size, and that SOFTER times less
 *  (never under its own); zoomed in, it stays. */
const ADAPT_POWER = 1, ADAPT_MAX = 3, ADAPT_SOFTER = 1.5;
/** Its day numbers this big on the screen (px) or less, its writing's gone, its head half as tall; from
 *  FADE_FROM, they fade and it shrinks there. */
const FADE_TO = 4, FADE_FROM = 6;
/** How many times the usual size its writing is drawn at this zoom: its own (tfs), grown if adaptive, but
 *  never so much its head takes the card (room left for its lines). */
const writingAt = (it: Item, z: number): number => {
  const own = it.tfs ?? 1;
  if (!it.tfa) return own;
  const most = (it.h - BOTTOM - 20 - linesY(0)) / (NAME_FS + NUMBER_FS);
  return Math.max(own, Math.min(own * Math.min(ADAPT_MAX, Math.pow(1 / z, ADAPT_POWER)) / ADAPT_SOFTER, most));
};
export const dayOf = (it: Item): number => DAY * (it.ts ?? 1);

/** How many days its width holds. */
export const tlDays = (it: Item): number => Math.max(1, Math.floor((it.w - TL_PAD * 2) / dayOf(it) + 0.01));

/** Where something's left side goes to be at a whole or half day on the timeline. */
export const halfDay = (tl: Item, x: number): number => {
  const from = tl.x + TL_PAD, half = dayOf(tl) / 2;
  return from + Math.round((x - from) / half) * half;
};

export function drawTimeline(ctx: CanvasRenderingContext2D, it: Item, colors: { card: string; ink: string }, z: number): void {
  ctx.fillStyle = colors.card;
  ctx.beginPath();
  ctx.roundRect(it.x, it.y, it.w, it.h, 10);
  ctx.fill();
  const k = writingAt(it, z);
  // Adaptive, too small to read: its writing fades, its head down to half (see FADE_TO).
  const seen = it.tfa ? Math.max(0, Math.min(1, (NUMBER_FS * k * z - FADE_TO) / (FADE_FROM - FADE_TO))) : 1;
  const start = tlStart(it), days = tlDays(it), day = dayOf(it), top = it.y + linesY(k) * (0.5 + seen / 2), bottom = it.y + it.h - BOTTOM;
  const now = new Date(), thisYear = now.getFullYear(), legible = NUMBER_FS * k * z >= FADE_TO;
  // Day numbers too wide for their days: every second, third… (and today's).
  ctx.font = font(NUMBER_FS * k, 400, 'inter');
  const every = Math.max(1, Math.ceil((ctx.measureText('28').width + 4 * k) / day));
  const today = (d: Date) => d.getDate() === now.getDate() && d.getMonth() === now.getMonth() && d.getFullYear() === thisYear;
  ctx.fillStyle = colors.ink;
  ctx.textBaseline = 'top';
  for (let i = 0; i < days; i++) {
    const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i), x = it.x + TL_PAD + i * day;
    const first = d.getDate() === 1, monday = d.getDay() === 1, now = today(d);
    // The line starting the day: blue for a month, darker for a week, red for today.
    ctx.globalAlpha = now ? 0.8 : first ? 0.4 : monday ? 0.11 : 0.05;
    ctx.fillStyle = now ? TODAY : first ? '#0F7CEA' : colors.ink;
    // A board unit wide, but never under a pixel on the screen; the month's a unit longer.
    ctx.fillRect(first ? x : x - 1, first ? top - 1 : top, Math.max(1, 1 / z), bottom - top + (first ? 1 : 0));
    if (!legible) continue;
    if (now || i % every === 0) {
      ctx.globalAlpha = (now ? 1 : 0.3) * seen;
      ctx.fillStyle = now ? TODAY : colors.ink;
      ctx.font = font(NUMBER_FS * k, now ? 600 : 400, 'inter');
      ctx.textAlign = 'center';
      ctx.fillText(String(d.getDate()), x + day / 2, it.y + numberY(k) + 1);
    }
    // The month's name over its first day (or the card's, for the month it starts in), with its year
    // when it's not this one.
    if (first || i === 0) {
      ctx.globalAlpha = 0.6 * seen;
      ctx.fillStyle = colors.ink;
      ctx.font = font(NAME_FS * k, 500, 'inter');
      ctx.textAlign = 'left';
      ctx.fillText(`${MONTHS[d.getMonth()]}${d.getFullYear() !== thisYear ? ` ${d.getFullYear()}` : ''}`.toUpperCase(), x, it.y + NAME_Y);
    }
  }
  ctx.globalAlpha = 1;
}
