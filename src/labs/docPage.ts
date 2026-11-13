import { PAGE, type Item } from '../model/types';
import type { Point } from '../canvas/geometry';
import { font, fontOf, LINE_HEIGHT } from '../canvas/text';
import type { TextRun } from '../model/textLinks';

/**
 * «Документ» (src/labs): a sheet of A4 on the board, its margins as ГОСТ has them, its text typed in as a
 * sticker's, at its own size, from the top: what doesn't fit on a page goes on to the next. Words in it
 * may be bold, italic… (styles on parts of it, model/textLinks.ts), a paragraph a heading (1, 2 or 3,
 * bigger and bold, see setHeading there); its lines wrap as wide as their words come out in
 * their own styles, each as tall as its paragraph's size. The sheet shows one page at a time, the pager
 * under it («‹ 1 / 3 ›», ten pages at most) turning them, for whoever's looking (not for everyone).
 */

/** Where the text goes on the sheet. */
export const PAGE_TEXT = { w: PAGE.W - PAGE.LEFT - PAGE.RIGHT, h: PAGE.H - PAGE.TOP - PAGE.BOTTOM };

/** The page each sheet shows here, by id. */
const shown = new Map<string, number>();

/** A heading's size against the text's own (1, 2, 3), and the room over one that isn't a page's first. */
export const HEADING_SIZE = [1, 1.75, 1.375, 1.125], HEADING_GAP = 0.6;

/** A list's paragraphs: how far in their lines stand (their marker in that room, at its left). */
export const LIST_IN = 28;

/** A line as laid out: where it starts and ends in the text, its paragraph's size (a heading's level, 0
 *  for none), on its page how far down its top is; in a list, how far in it stands, and on its
 *  paragraph's first line, its marker («•» or its number with a dot). */
export interface DocLine { s: number; e: number; size: number; h: number; page: number; y: number; indent: number; mark?: string }

let measure: CanvasRenderingContext2D | null = null;
const laidOut = new Map<string, { key: string; lines: DocLine[] }>();

/** The style on each character of s…e (by the runs), as pieces. */
function piecesOf(runs: TextRun[], s: number, e: number): Array<{ s: number; e: number; r?: TextRun }> {
  const cuts = [...new Set([s, e, ...runs.flatMap((r) => [r.s, r.e]).filter((c) => c > s && c < e)])].sort((a, b) => a - b);
  return cuts.slice(0, -1).map((c, i) => ({ s: c, e: cuts[i + 1], r: runs.find((r) => r.s <= c && r.e >= cuts[i + 1] && (r.b || r.i)) }));
}

/** Its lines, laid out: each paragraph wrapped at the sheet's width, its words measured in their own
 *  styles (a word too long for a line broken where it comes to), lines filling page after page. */
export function docLines(it: Item): DocLine[] {
  const text = it.text ?? '', fs = it.fs ?? 16, st = fontOf(it), runs = (it.rs ?? []) as Array<TextRun & { h?: number }>;
  const key = `${text}|${fs}|${st.weight}|${st.family}|${st.italic}|${JSON.stringify(runs)}`, was = laidOut.get(it.id);
  if (was?.key === key) return was.lines;
  if (typeof document !== 'undefined') measure ??= document.createElement('canvas').getContext('2d');
  const styled = runs.filter((r) => r.b || r.i);
  /** How wide s…e is at `size`, `bold` (a heading) or as each piece's style has it. */
  const width = (s: number, e: number, size: number, bold: boolean) => {
    if (!measure) return (e - s) * size * 0.55;
    let w = 0;
    for (const p of piecesOf(styled, s, e)) {
      measure.font = font(size, bold || p.r?.b ? 700 : st.weight, st.family, !!p.r?.i || st.italic);
      w += measure.measureText(text.slice(p.s, p.e)).width;
    }
    return w;
  };
  const lines: DocLine[] = [];
  let page = 0, y = 0, at = 0, n = 0, indent = 0, mark: string | undefined;
  const put = (s: number, e: number, size: number, h: number, first: boolean) => {
    const tall = size * LINE_HEIGHT, gap = h && first && y > 0 ? size * HEADING_GAP : 0;
    if (y + gap + tall > PAGE_TEXT.h && y > 0) { page++; y = 0; }
    else y += gap;
    lines.push({ s, e, size, h, page, y, indent, ...(first && mark && { mark }) });
    y += tall;
  };
  for (const para of text.split('\n')) {
    const s0 = at, e0 = at + para.length;
    at = e0 + 1;
    // (Its level and list kept on the character after it: see setPara in model/textLinks.ts.)
    const h = runs.find((r) => r.h && r.s <= e0 && r.e > e0)?.h ?? 0, size = Math.round(fs * HEADING_SIZE[h]);
    const list = runs.find((r) => r.l && r.s <= e0 && r.e > e0)?.l;
    // A numbered list counts on while its paragraphs follow one another.
    n = list === 'number' ? n + 1 : 0;
    indent = list ? LIST_IN : 0;
    mark = list === 'number' ? `${n}.` : list ? '•' : undefined;
    const room = PAGE_TEXT.w - indent;
    if (s0 === e0) { put(s0, e0, size, h, true); continue; }
    let ls = s0, first = true;
    while (ls < e0) {
      // As many words as fit; one alone too wide, as many of its letters.
      let end = ls, i = ls;
      while (i < e0) {
        let j = i;
        while (j < e0 && text[j] === ' ') j++;
        while (j < e0 && text[j] !== ' ') j++;
        if (width(ls, j, size, h > 0) > room && end > ls) break;
        end = j;
        i = j;
        if (width(ls, end, size, h > 0) > room) {
          // (A single word wider than the line: cut where it no longer fits.)
          let k = ls + 1;
          while (k < end && width(ls, k + 1, size, h > 0) <= room) k++;
          end = k;
          break;
        }
      }
      put(ls, end, size, h, first);
      first = false;
      ls = end;
      while (ls < e0 && text[ls] === ' ') ls++;
    }
  }
  const out = lines.filter((l) => l.page < PAGE.MAX);
  laidOut.set(it.id, { key, lines: out });
  return out;
}

/** Draws page `n` of it: each line piece by piece in its own style, a heading's bigger and bold, links
 *  blue and underlined (`onLink` noting where, to be Cmd+clicked). */
export function drawDocPage(ctx: CanvasRenderingContext2D, it: Item, n: number, look: {
  ink: string; link: string; tint: (c: string) => string; onLink?: (r: { x: number; y: number; w: number; h: number; url: string }) => void;
}): void {
  const text = it.text ?? '', st = fontOf(it), runs = (it.rs ?? []) as TextRun[], links = it.links ?? [];
  const align = it.ta ?? 'left', alpha = it.to ?? 1, ink = it.tc ? look.tint(it.tc) : look.ink;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';
  for (const l of docLines(it)) {
    if (l.page !== n) continue;
    const top = it.y + PAGE.TOP + l.y, tall = l.size * LINE_HEIGHT, rule = Math.max(1, l.size / 14);
    const cuts = [...new Set([l.s, l.e, ...[...runs, ...links].flatMap((r) => [r.s, r.e]).filter((c) => c > l.s && c < l.e)])].sort((a, b) => a - b);
    const pieces = cuts.slice(0, -1).map((c, i) => {
      const e = cuts[i + 1], r = runs.filter((k) => k.s <= c && k.e >= e).reduce((m, k) => ({ ...m, ...k }), {} as Partial<TextRun>);
      const f = font(l.size, l.h || r.b ? 700 : st.weight, st.family, !!r.i || st.italic);
      ctx.font = f;
      const t = text.slice(c, e);
      return { t, r, f, w: ctx.measureText(t).width, link: links.find((k) => k.s <= c && k.e >= e) };
    });
    const lw = pieces.reduce((s, p) => s + p.w, 0);
    const room = PAGE_TEXT.w - l.indent;
    let x = it.x + PAGE.LEFT + l.indent + (align === 'center' ? (room - lw) / 2 : align === 'right' ? room - lw : 0);
    ctx.font = font(l.size, l.h ? 700 : st.weight, st.family, st.italic);
    const fm = ctx.measureText('Hg'), base = top + (tall - fm.fontBoundingBoxAscent - fm.fontBoundingBoxDescent) / 2 + fm.fontBoundingBoxAscent, mid = top + tall / 2;
    // A list's marker in the room on its left.
    if (l.mark) { ctx.fillStyle = ink; ctx.fillText(l.mark, it.x + PAGE.LEFT + 4, base); }
    for (const p of pieces) {
      const color = p.link ? look.link : p.r.c ? look.tint(p.r.c) : ink;
      ctx.font = p.f;
      ctx.fillStyle = color;
      ctx.fillText(p.t, x, base);
      if (p.r.u || it.fu) ctx.fillRect(x, mid + l.size * 0.42, p.w, rule);
      if (p.r.x || it.fx) ctx.fillRect(x, mid + l.size * 0.04 - rule / 2, p.w, rule);
      if (p.link) {
        ctx.globalAlpha = alpha * 0.4;
        ctx.fillRect(x, base + fm.fontBoundingBoxDescent - rule, p.w, rule);
        ctx.globalAlpha = alpha;
        look.onLink?.({ x, y: top, w: p.w, h: tall, url: p.link.url });
      }
      x += p.w;
    }
  }
  ctx.restore();
}

/** How many pages it has (one at least). */
export const pageCount = (it: Item): number => Math.max(1, ...docLines(it).map((l) => l.page + 1));
/** Its pages, for what still counts them so: one entry each. */
export const pagesOf = (it: Item): number[] => Array.from({ length: pageCount(it) }, (_, i) => i);

/** The page it shows here (within those it has). */
export const pageShown = (it: Item, count = pagesOf(it).length): number => Math.min(shown.get(it.id) ?? 0, count - 1);
/** Shows page `n` of a sheet here; the page it showed before. */
export function showPage(id: string, n: number): number {
  const was = shown.get(id) ?? 0;
  shown.set(id, n);
  return was;
}
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
