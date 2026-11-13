import type { Board } from '../model/board';
import type { Item } from '../model/types';
import type { Point } from '../canvas/geometry';
import { font, wrapText } from '../canvas/text';
import { myId } from './labs';
import { BTN_H, drawButton } from './formObject';

/**
 * «Голосование» (src/labs, one of the "Объекты"): a poll on the board. Whoever puts it there sets it up
 * (pd: a question, pq, and its answers, po, typed into fields laid over it, PollFields.tsx) and starts
 * it; then anyone picks one or more answers by clicking them, and once they have, they see what each
 * has: a bar as long as its share, the share in percent, and how many voted. Clicked again, an answer's
 * unpicked. Each one's answers are a field of their own on the item (`pv:<their browser's id>`), so two
 * voting at once both count. The one who put it there can set it up again («Редактировать»).
 */

/** Its width, and inside it, in board units: the room round what's in it, the question's font and line,
 *  an answer's row and the gap between rows, the corners. */
export const POLL_W = 360;
const PAD = 20, TITLE_FS = 18, TITLE_LH = 24, ROW = 44, ROW_GAP = 10, ROW_RAD = 12, OPT_FS = 16;
const TOTAL_H = 20, FOOT_H = 16, SMALL_FS = 13;
export const POLL_RAD = 16;
/** Being set up: a field's height, the gaps, the «+» row's. */
const FIELD = 40, FIELD_GAP = 8, ADD_H = 32;
export const POLL_FS = 15, POLL_FIELD_RAD = 8, POLL_FIELD_PAD = 12;

/** Its question and answers, and who's picked what (by browser id: the indexes of their answers). */
export const answersOf = (it: Item): string[] => it.po ?? ['', ''];
export function votesOf(it: Item): Map<string, number[]> {
  const out = new Map<string, number[]>();
  for (const [k, v] of Object.entries(it)) if (k.startsWith('pv:') && Array.isArray(v) && v.length) out.set(k.slice(3), v as number[]);
  return out;
}
export const mine = (it: Item): number[] => votesOf(it).get(myId()) ?? [];
export const isAuthor = (it: Item): boolean => !it.pa || it.pa === myId();

function plural(n: number, one: string, few: string, many: string): string {
  const a = n % 10, b = n % 100;
  return a === 1 && b !== 11 ? one : a >= 2 && a <= 4 && (b < 12 || b > 14) ? few : many;
}

let measure: CanvasRenderingContext2D | null = null;
/** The question's lines at its width (without a page to measure in, about so). */
function titleLines(it: Item): string[] {
  const text = it.pq?.trim() || 'Вопрос', w = it.w - PAD * 2;
  if (typeof document === 'undefined') return wrapText(text, w, (s) => s.length * TITLE_FS * 0.55);
  measure ??= document.createElement('canvas').getContext('2d');
  if (!measure) return [text];
  measure.font = font(TITLE_FS, 600);
  return wrapText(text, w, (s) => measure!.measureText(s).width);
}

type Box = { x: number; y: number; w: number; h: number };
const inBox = (b: Box, w: Point) => w.x >= b.x && w.x <= b.x + b.w && w.y >= b.y && w.y <= b.y + b.h;

/** Where everything is, on the board: running, its question's lines, its rows, the count, the foot;
 *  being set up, its fields (the question's first), the «+» row and the button. */
export function pollLayout(it: Item) {
  const x = it.x + PAD, w = it.w - PAD * 2, n = answersOf(it).length;
  if (it.pd) {
    const fields: Box[] = [];
    let y = it.y + PAD;
    for (let i = 0; i <= n; i++) { fields.push({ x, y, w, h: FIELD }); y += FIELD + (i === 0 ? 12 : FIELD_GAP); }
    const add = { x, y, w, h: ADD_H };
    y += ADD_H + 12;
    const start = { x, y, w, h: BTN_H };
    return { draft: true as const, fields, add, start, h: y + BTN_H + PAD - it.y };
  }
  const lines = titleLines(it);
  let y = it.y + PAD + lines.length * TITLE_LH + 16;
  const rows: Box[] = [];
  for (let i = 0; i < n; i++) { rows.push({ x, y, w, h: ROW }); y += ROW + ROW_GAP; }
  const total = { x, y: y - ROW_GAP + 14, w, h: TOTAL_H };
  const foot = { x, y: total.y + TOTAL_H + 10, w, h: FOOT_H };
  return { draft: false as const, lines, rows, total, foot, h: foot.y + FOOT_H + 16 - it.y };
}

/** What a point on it is on: an answer (its index), the «+» row, the start, «Редактировать». */
export function pollPartAt(it: Item, w: Point): { answer: number } | 'add' | 'start' | 'edit' | null {
  const l = pollLayout(it);
  if (l.draft) return inBox(l.add, w) ? 'add' : inBox(l.start, w) ? 'start' : null;
  const i = l.rows.findIndex((r) => inBox(r, w));
  if (i >= 0) return { answer: i };
  if (isAuthor(it) && w.y >= l.foot.y - 4 && w.y <= l.foot.y + l.foot.h + 4 && w.x >= l.foot.x + l.foot.w - 110 && w.x <= l.foot.x + l.foot.w) return 'edit';
  return null;
}

/** The part of it under the pointer, as the renderer lights it (`poll:<id>:answer:<i>`, `…:add`…). */
export function pollHot(it: Item, w: Point): string | null {
  const part = pollPartAt(it, w);
  return part === null ? null : `poll:${it.id}:${typeof part === 'object' ? `answer:${part.answer}` : part}`;
}

/** Does what a click there does: picks or unpicks my answer, adds an answer, starts it, sets it up again. */
export function pressPoll(board: Board, it: Item, part: NonNullable<ReturnType<typeof pollPartAt>>): void {
  if (typeof part === 'object') {
    const had = mine(it), next = had.includes(part.answer) ? had.filter((i) => i !== part.answer) : [...had, part.answer].sort((a, b) => a - b);
    board.update(it.id, { [`pv:${myId()}`]: next.length ? next : undefined } as Partial<Item>);
    return;
  }
  if (part === 'add') { setAnswers(board, it, [...answersOf(it), '']); return; }
  if (part === 'edit') { refit(board, { ...it, pd: true }, { pd: true }); return; }
  // Started: the empty answers left out (two at least, or it stays being set up).
  const kept = answersOf(it).map((a) => a.trim()).filter(Boolean);
  if (kept.length < 2) return;
  refit(board, { ...it, pd: undefined, po: kept }, { pd: undefined, po: kept });
}

/** Its answers changed (one more, one typed in), its height with them. */
export function setAnswers(board: Board, it: Item, po: string[]): void {
  refit(board, { ...it, po }, { po });
}
function refit(board: Board, next: Item, patch: Partial<Item>): void {
  board.update(next.id, { ...patch, h: Math.round(pollLayout(next).h) });
}

interface Look { surface: string; bg: string; line: string; ink: string; muted: string; accent: string }

/** Draws it, `hot` the part under the pointer; `k` the zoom times the pixel ratio, for the shadow. */
export function drawPoll(ctx: CanvasRenderingContext2D, it: Item, look: Look, k: number, hot: string | null): void {
  const l = pollLayout(it);
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(it.x, it.y, it.w, it.h, POLL_RAD);
  ctx.shadowColor = 'rgba(0, 0, 0, .15)';
  ctx.shadowBlur = 12 * k;
  ctx.shadowOffsetY = 6 * k;
  ctx.fillStyle = look.surface;
  ctx.fill();
  ctx.restore();
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  const text = (s: string, x: number, y: number, size: number, weight: number, color: string, align: CanvasTextAlign = 'left') => {
    ctx.font = font(size, weight);
    ctx.fillStyle = color;
    ctx.textAlign = align;
    ctx.fillText(s, x, y);
    ctx.textAlign = 'left';
  };
  if (l.draft) {
    const answers = answersOf(it);
    l.fields.forEach((f, i) => {
      ctx.beginPath();
      ctx.roundRect(f.x, f.y, f.w, f.h, POLL_FIELD_RAD);
      ctx.fillStyle = look.bg;
      ctx.fill();
      ctx.lineWidth = 1;
      ctx.strokeStyle = look.line;
      ctx.stroke();
      const value = i === 0 ? it.pq ?? '' : answers[i - 1];
      ctx.save();
      ctx.clip();
      text(value || (i === 0 ? 'Вопрос' : `Вариант ${i}`), f.x + POLL_FIELD_PAD, f.y + f.h / 2, POLL_FS, i === 0 ? 600 : 400, value ? look.ink : look.muted);
      ctx.restore();
    });
    ctx.globalAlpha = hot === 'add' ? 1 : 0.8;
    text('+ Добавить вариант', l.add.x, l.add.y + l.add.h / 2, POLL_FS, 500, look.accent);
    ctx.globalAlpha = 1;
    // The app's main button, faint till two answers are typed in.
    const ready = answers.filter((a) => a.trim()).length >= 2;
    drawButton(ctx, l.start, 'Запустить', true, look, hot === 'start', !ready);
    return;
  }
  l.lines.forEach((line, i) => text(line, l.rows[0]?.x ?? it.x + PAD, it.y + PAD + i * TITLE_LH + TITLE_LH / 2, TITLE_FS, 600, look.ink));
  const votes = votesOf(it), voters = votes.size, picked = mine(it), seen = picked.length > 0;
  const counts = answersOf(it).map((_, i) => [...votes.values()].filter((v) => v.includes(i)).length);
  answersOf(it).forEach((a, i) => {
    const r = l.rows[i], share = voters ? counts[i] / voters : 0;
    // The row; once I've voted, a bar as long as its share in it (stronger on mine) and the share.
    ctx.beginPath();
    ctx.roundRect(r.x, r.y, r.w, r.h, ROW_RAD);
    ctx.fillStyle = look.accent;
    ctx.globalAlpha = hot === `answer:${i}` ? 0.14 : 0.08;
    ctx.fill();
    if (seen && share > 0) {
      ctx.beginPath();
      ctx.roundRect(r.x, r.y, Math.max(ROW_RAD * 2, r.w * share), r.h, ROW_RAD);
      ctx.globalAlpha = picked.includes(i) ? 0.42 : 0.2;
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.save();
    ctx.beginPath();
    ctx.rect(r.x, r.y, r.w - (seen ? 76 : 16), r.h);
    ctx.clip();
    text(a, r.x + 16, r.y + r.h / 2, OPT_FS, picked.includes(i) ? 600 : 400, look.ink);
    ctx.restore();
    if (seen) {
      const pct = String(Math.round(share * 100));
      ctx.font = font(SMALL_FS, 400);
      const sign = ctx.measureText(' %').width;
      text(' %', r.x + r.w - 14, r.y + r.h / 2 + 1, SMALL_FS, 400, look.muted, 'right');
      text(pct, r.x + r.w - 14 - sign, r.y + r.h / 2, 18, 600, look.ink, 'right');
    }
  });
  text(`${voters} ${plural(voters, 'голос', 'голоса', 'голосов')}`, l.total.x + l.total.w / 2, l.total.y + l.total.h / 2, POLL_FS, 500, look.accent, 'center');
  text('Можно выбрать несколько', l.foot.x, l.foot.y + l.foot.h / 2, SMALL_FS, 400, look.muted);
  if (isAuthor(it)) {
    ctx.globalAlpha = hot === 'edit' ? 1 : 0.8;
    text('Редактировать', l.foot.x + l.foot.w, l.foot.y + l.foot.h / 2, SMALL_FS, 500, look.accent, 'right');
    ctx.globalAlpha = 1;
  }
}
