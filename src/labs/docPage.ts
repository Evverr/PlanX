import { PAGE, type Item } from '../model/types';
import type { Point } from '../canvas/geometry';
import { font, fontOf, LINE_HEIGHT, wrapText } from '../canvas/text';

/**
 * «Документ» (src/labs): a sheet of A4 on the board, its margins as ГОСТ has them, its text typed in as a
 * sticker's (all of it in one font, as the text panel sets it), but at its own size, from the top: what
 * doesn't fit on a page goes on to the next. The sheet shows one page at a time, the pager under it («‹ 1
 * / 3 ›», ten pages at most) turning them, for whoever's looking (not for everyone).
 */

/** Where the text goes on the sheet. */
export const PAGE_TEXT = { w: PAGE.W - PAGE.LEFT - PAGE.RIGHT, h: PAGE.H - PAGE.TOP - PAGE.BOTTOM };

/** The page each sheet shows here, by id. */
const shown = new Map<string, number>();

let measure: CanvasRenderingContext2D | null = null;
/** Its pages: where each starts and ends in its text (by character), lines as many as fit on one. */
export function pagesOf(it: Item): Array<{ s: number; e: number }> {
  const text = it.text ?? '', fs = it.fs ?? 16, st = fontOf(it);
  if (typeof document !== 'undefined') measure ??= document.createElement('canvas').getContext('2d');
  if (measure) measure.font = font(fs, st.weight, st.family, st.italic);
  const lines = wrapText(text, PAGE_TEXT.w, (t) => (measure ? measure.measureText(t).width : t.length * fs * 0.55));
  const per = Math.max(1, Math.floor(PAGE_TEXT.h / (fs * LINE_HEIGHT)));
  const pages: Array<{ s: number; e: number }> = [];
  let from = 0;
  lines.forEach((line, i) => {
    // (Each line found in the text as it's laid out, as the renderer finds them.)
    const at = text.indexOf(line, from), end = at + line.length;
    if (i % per === 0) pages.push({ s: at, e: end });
    else pages[pages.length - 1].e = end;
    from = end;
  });
  return pages.length ? pages.slice(0, PAGE.MAX) : [{ s: 0, e: 0 }];
}

/** The page it shows here (within those it has). */
export const pageShown = (it: Item, count = pagesOf(it).length): number => Math.min(shown.get(it.id) ?? 0, count - 1);
export function turnPage(it: Item, dir: -1 | 1): void {
  const n = pagesOf(it).length;
  shown.set(it.id, Math.max(0, Math.min(n - 1, pageShown(it, n) + dir)));
}

/** The pager under it: its middle, and its arrows' each side of it. */
const PAGER_Y = 22, ARROW_DX = 44;
const pagerMid = (it: Item): Point => ({ x: it.x + it.w / 2, y: it.y + it.h + PAGER_Y });

/** A sheet's pager arrow a point's on: the sheet, and which way. */
export function pagerAt(items: Item[], w: Point): { it: Item; dir: -1 | 1 } | null {
  for (const it of items) {
    if (it.type !== 'page') continue;
    const m = pagerMid(it);
    if (Math.abs(w.y - m.y) > 12) continue;
    if (Math.abs(w.x - (m.x - ARROW_DX)) <= 12) return { it, dir: -1 };
    if (Math.abs(w.x - (m.x + ARROW_DX)) <= 12) return { it, dir: 1 };
  }
  return null;
}

/** The pager arrow under the pointer, as the renderer lights it (`pager:<id>:<−1|1>`). */
export function pagerHot(items: Item[], w: Point): string | null {
  const p = pagerAt(items, w);
  return p ? `pager:${p.it.id}:${p.dir}` : null;
}

/** Draws its pager: «‹ n / of ›», small, the arrows faint where there's no page that way, lit under the pointer. */
export function drawPager(ctx: CanvasRenderingContext2D, it: Item, n: number, of: number, look: { ink: string; muted: string }, hot: string | null): void {
  const m = pagerMid(it);
  ctx.save();
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'center';
  ctx.font = font(13, 500);
  ctx.fillStyle = look.muted;
  ctx.fillText(`${n + 1} / ${of}`, m.x, m.y);
  ctx.font = font(18, 500);
  for (const [dir, x, can] of [[-1, m.x - ARROW_DX, n > 0], [1, m.x + ARROW_DX, n < of - 1]] as const) {
    ctx.globalAlpha = can ? 1 : 0.3;
    ctx.fillStyle = can && hot === `pager:${it.id}:${dir}` ? look.ink : look.muted;
    ctx.fillText(dir < 0 ? '‹' : '›', x, m.y - 1);
  }
  ctx.restore();
}
