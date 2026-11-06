import type { Item, Person, TaskStatus } from '../model/types';
import { FILLS } from '../model/types';
import { drawIcon } from '../icons/icons';
import { font, LINE_HEIGHT, textBlockHeight, wrapText } from './text';
import type { Point, Rect } from './geometry';

/**
 * A task (from Женя's Figma, "Доски"): a card with its status (a ring: to do; a ring going round:
 * being done; a blue tick: done) and its title. Its arrow opens it to its description, the arrow under
 * that to all of it: who set it, who does it, by when, its subtasks (each ticked off on its own), and
 * «Отмена» (closes it) and «Завершить» (done, and closed). Tinted in its colour (as a sticker's).
 * Laid out here from its top left corner; its height is always what its contents take.
 */

/** Closed and opened, how wide it starts. */
export const TASK_W = 293, TASK_OPEN_W = 494;
/** Its corners' radius, at its outer edge. */
export const TASK_RAD = 12;
const TITLE_FS = 16, TEXT_FS = 14, FAMILY = 'inter';
const TITLE = { weight: 500, family: FAMILY }, TEXT = { weight: 400, family: FAMILY };
/** Where the title starts, and where its first line's middle is (the ring's and the arrow's too). */
const TITLE_X = 47, MID = 26;
const STATUS = 22, ARROW = 24;
/** How far round the ring and the arrow a press is still theirs (the rest of the header a double click's). */
const AROUND = 5;
/** Where the people's names start and their circles' middle; a row's height; a subtask's. */
const LABEL_X = 47, NAME_X = 200, AVATAR_X = 182, ROW = 33, SUB = 38, SUB_X = 48, SUB_TEXT_X = 79;
/** The buttons as the panels' (.btn in popups.css): 32 tall, their text 12 bold Inter with 14 each side. */
const BUTTON_H = 32, BUTTON_PAD = 14, BUTTON_FONT = { size: 12, weight: 600 };
export const DESC_HINT = 'Добавить описание', SUB_HINT = 'Добавить подзадачу';

export const statusOf = (it: Item): TaskStatus => it.st ?? (it.done ? 'done' : 'todo');
/** What a click on its ring makes it: to do, being done, done, round again. */
export const nextStatus = (s: TaskStatus): TaskStatus => (s === 'todo' ? 'doing' : s === 'doing' ? 'done' : 'todo');

/** Where everything on it is, from its top left corner. */
export interface TaskLayout {
  w: number; h: number;
  /** The header's height; the title's box. */
  head: number; title: Rect;
  /** Opened: the description's box (its text, or what's shown with none). */
  desc?: Rect;
  /** Opened to its description: the arrow under it. */
  more?: Point;
  /** Opened in full: the lines across, the rows' middles (who set it, who does it, by when), the
   *  subtasks' heading, each subtask's top (the last: the row adding one), the buttons. */
  lines?: number[]; rows?: number[]; subsAt?: number; subs?: number[]; cancel?: Rect; finish?: Rect;
}

const lineH = (fs: number) => fs * LINE_HEIGHT;

let measureCtx: CanvasRenderingContext2D | null = null;
/** How wide a text is in a font of the card's (a rough guess with no canvas to measure on). */
const widthOf = (text: string, size: number, weight: number) => {
  if (typeof document === 'undefined') return text.length * size * 0.55;
  measureCtx ??= document.createElement('canvas').getContext('2d')!;
  measureCtx.font = font(size, weight, FAMILY);
  return measureCtx.measureText(text).width;
};
const buttonW = (text: string) => Math.ceil(widthOf(text, BUTTON_FONT.size, BUTTON_FONT.weight)) + BUTTON_PAD * 2;

export function taskLayout(it: Item, w = it.w): TaskLayout {
  const titleW = Math.max(40, w - TITLE_X * 2);
  const th = textBlockHeight(it.text || ' ', titleW, TITLE_FS, TITLE);
  const top = MID - lineH(TITLE_FS) / 2, head = Math.max(52, Math.ceil(top * 2 + th));
  const out: TaskLayout = { w, h: head, head, title: { x: TITLE_X, y: top, w: titleW, h: th } };
  if (!it.tv) return out;
  const descW = Math.max(80, w - TITLE_X - 79), dy = head + 22;
  const dh = textBlockHeight(it.desc || DESC_HINT, descW, TEXT_FS, TEXT);
  out.desc = { x: TITLE_X, y: dy, w: descW, h: dh };
  const d = dy + dh;
  if (it.tv === 'desc') {
    out.more = { x: w - 35, y: d };
    out.h = Math.ceil(d + 40);
    return out;
  }
  out.rows = [d + 58, d + 58 + ROW, d + 58 + ROW * 2];
  out.subsAt = d + 181;
  const n = it.subs?.length ?? 0;
  out.subs = Array.from({ length: n + 1 }, (_, i) => d + 213 + i * SUB);
  const last = d + 213 + n * SUB + STATUS;
  out.lines = [d + 25, d + 157, last + 27];
  const by = last + 27 + 24, fw = buttonW('Завершить'), cw = buttonW('Отмена'), fx = w - 43 - fw;
  out.finish = { x: fx, y: by, w: fw, h: BUTTON_H };
  out.cancel = { x: fx - 10 - cw, y: by, w: cw, h: BUTTON_H };
  out.h = Math.ceil(by + BUTTON_H + 31);
  return out;
}

/** Its size for what's in it (and opened or not). */
export const taskSize = (it: Item, w = it.w): { w: number; h: number } => ({ w, h: taskLayout(it, w).h });

/** What a point on it (from its top left corner) is on. */
export type TaskPart = 'status' | 'arrow' | 'more' | 'head' | 'title' | 'desc' | 'boss' | 'doer' | 'due' | 'add' | 'cancel' | 'finish'
  | { sub: number; tick: boolean };

const inRect = (p: Point, r: Rect, pad = 0) => p.x >= r.x - pad && p.x <= r.x + r.w + pad && p.y >= r.y - pad && p.y <= r.y + r.h + pad;
const near = (p: Point, x: number, y: number, r: number) => Math.hypot(p.x - x, p.y - y) <= r;

export function taskPartAt(it: Item, p: Point): TaskPart | null {
  const l = taskLayout(it), q = { x: p.x - it.x, y: p.y - it.y };
  // The header: the ring and the arrow theirs and 5 round them, the title's text the title, the rest
  // of it the header itself (a double click there opens it further).
  if (q.y >= 0 && q.y < l.head && q.x >= 0 && q.x <= l.w) {
    const on = (cx: number, half: number) => Math.abs(q.x - cx) <= half + AROUND && Math.abs(q.y - MID) <= half + AROUND;
    if (on(15 + STATUS / 2, STATUS / 2)) return 'status';
    if (on(l.w - 35 + ARROW / 2, ARROW / 2)) return 'arrow';
    const lh = lineH(TITLE_FS), lines = wrapText(it.text || 'Название задачи', l.title.w, (t) => widthOf(t, TITLE_FS, 500)), row = Math.floor((q.y - l.title.y) / lh);
    return row >= 0 && row < lines.length && q.x >= l.title.x && q.x <= l.title.x + widthOf(lines[row], TITLE_FS, 500) ? 'title' : 'head';
  }
  if (l.more && near(q, l.more.x + ARROW / 2, l.more.y + ARROW / 2, ARROW / 2 + 4)) return 'more';
  if (l.desc && inRect(q, l.desc)) return 'desc';
  if (l.rows) {
    const keys = ['boss', 'doer', 'due'] as const;
    for (let i = 0; i < 3; i++) if (Math.abs(q.y - l.rows[i]) <= 14 && q.x >= AVATAR_X - 14 && q.x <= l.w - 47) return keys[i];
  }
  if (l.subs) {
    for (let i = 0; i < l.subs.length; i++) {
      if (q.y < l.subs[i] - 6 || q.y > l.subs[i] + STATUS + 6) continue;
      if (i === l.subs.length - 1) return q.x >= SUB_X - 4 && q.x <= l.w - 47 ? 'add' : null;
      if (near(q, SUB_X + STATUS / 2, l.subs[i] + STATUS / 2, STATUS / 2 + 4)) return { sub: i, tick: true };
      if (q.x >= SUB_TEXT_X && q.x <= l.w - 47) return { sub: i, tick: false };
    }
  }
  if (l.cancel && inRect(q, l.cancel)) return 'cancel';
  if (l.finish && inRect(q, l.finish)) return 'finish';
  return null;
}

/** Where a part's text is typed in (on the board): the title, the description, a subtask. */
export function taskFieldBox(it: Item, field: number | null): Rect & { fs: number; weight: number } {
  const l = taskLayout(it);
  if (field === 0 && l.desc) return { x: it.x + l.desc.x, y: it.y + l.desc.y, w: l.desc.w, h: l.desc.h, fs: TEXT_FS, weight: 400 };
  if (field !== null && field > 0 && l.subs) {
    const y = l.subs[field - 1] + STATUS / 2 - lineH(TEXT_FS) / 2;
    return { x: it.x + SUB_TEXT_X, y: it.y + y, w: l.w - SUB_TEXT_X - 47, h: lineH(TEXT_FS), fs: TEXT_FS, weight: 400 };
  }
  return { x: it.x + l.title.x, y: it.y + l.title.y, w: l.title.w, h: l.title.h, fs: TITLE_FS, weight: 500 };
}
export const TASK_FONT = FAMILY;

/** The strong colour each of the stickers' colours stands for here: its edge, its header's tint. */
const STRONG: Record<string, string> = {
  blue: '#003CFF', green: '#12A53A', orange: '#F28C00', yellow: '#E0B000', pink: '#E8457F', purple: '#7B4DFF', gray: '#7C8590', graphite: '#4E5560',
};
const BLUE = '#2A5BFF';

const rgb = (hex: string) => { const n = parseInt(hex.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const mix = (a: string, b: string, k: number) => {
  const [r1, g1, b1] = rgb(a), [r2, g2, b2] = rgb(b);
  return `rgb(${Math.round(r1 * k + r2 * (1 - k))}, ${Math.round(g1 * k + g2 * (1 - k))}, ${Math.round(b1 * k + b2 * (1 - k))})`;
};
const strongOf = (color: string | undefined) => (color?.startsWith('#') ? color : STRONG[color ?? 'blue'] ?? (FILLS[color ?? ''] && FILLS[color!] !== 'transparent' ? FILLS[color!] : STRONG.blue));

/** `px`: the screen's pixels in a unit of the board (for the shadow, which the canvas doesn't scale). */
export interface TaskLook { surface: string; ink: string; muted: string; dark: boolean; z: number; px: number }

/** The ring of a status (or a subtask's: to do or done), its middle at x, y. */
export function drawStatus(ctx: CanvasRenderingContext2D, x: number, y: number, s: TaskStatus, look: TaskLook): void {
  const r = STATUS / 2;
  ctx.save();
  if (s === 'done') {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = BLUE;
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(x - 4.6, y + 0.2);
    ctx.lineTo(x - 1.4, y + 3.4);
    ctx.lineTo(x + 4.8, y - 3);
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke();
  } else {
    ctx.beginPath();
    ctx.arc(x, y, r - 1, 0, Math.PI * 2);
    ctx.strokeStyle = look.dark ? 'rgba(255,255,255,0.25)' : '#D3D8DE';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    if (s === 'doing') {
      ctx.beginPath();
      ctx.arc(x, y, r - 1.5, -Math.PI / 2, Math.PI);
      ctx.strokeStyle = BLUE;
      ctx.lineWidth = 2.5;
      ctx.lineCap = 'round';
      ctx.stroke();
    }
  }
  ctx.restore();
}

const DATE = (due: string) => {
  const [d, t] = due.split('T'), [y, m, day] = d.split('-');
  return `${day}.${m}.${y}${t ? `  ${t}` : ''}`;
};

/** The card. `typing` is the part being typed in (its text left to the overlay): null for the title,
 *  0 for the description, 1… for a subtask; undefined when none is. */
export function drawTaskCard(ctx: CanvasRenderingContext2D, it: Item, look: TaskLook, typing: number | null | undefined, hot: string | null = null): void {
  const l = taskLayout(it), { x, y } = it, strong = strongOf(it.color);
  const bg = look.dark ? '#26272C' : '#FFFFFF', tint = mix(strong, bg, look.dark ? 0.16 : 0.05);
  const edge = `rgba(${rgb(strong.startsWith('#') ? strong : '#003CFF').join(',')}, 0.3)`;
  // The card, its edge 2 wide inside it; its header tinted, the whole of it when closed. Opened, it
  // lies over the board with a shadow.
  ctx.beginPath();
  ctx.roundRect(x + 1, y + 1, l.w - 2, l.h - 2, TASK_RAD - 1);
  ctx.fillStyle = it.tv ? bg : tint;
  if (it.tv) {
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.25)';
    ctx.shadowOffsetY = 3 * look.px;
    ctx.shadowBlur = 8 * look.px;
    ctx.fill();
    ctx.restore();
  } else ctx.fill();
  if (it.tv) {
    ctx.beginPath();
    ctx.roundRect(x + 2, y + 2, l.w - 4, l.head - 4, [10, 10, 0, 0]);
    ctx.fillStyle = tint;
    ctx.fill();
  }
  ctx.beginPath();
  ctx.roundRect(x + 1, y + 1, l.w - 2, l.h - 2, TASK_RAD - 1);
  ctx.strokeStyle = edge;
  ctx.lineWidth = 2;
  ctx.stroke();
  if (TITLE_FS * look.z < 2.5) return;
  // In the middle of its top edge, a pill saying what it is, of the edge's colour, in white.
  ctx.font = font(9, 600, FAMILY);
  ctx.letterSpacing = '0.5px';
  const tag = 'ЗАДАЧА', pw = ctx.measureText(tag).width + 12;
  ctx.beginPath();
  ctx.roundRect(x + (l.w - pw) / 2, y + 1 - 7, pw, 14, 7);
  ctx.fillStyle = mix(strong.startsWith('#') ? strong : '#003CFF', bg, 0.3);
  ctx.fill();
  ctx.fillStyle = '#FFFFFF';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  // (The letters' spacing comes after each, the last one's too: half of it back.)
  ctx.fillText(tag, x + l.w / 2 + 0.25, y + 1.5);
  ctx.letterSpacing = '0px';
  const st = statusOf(it);
  drawStatus(ctx, x + 15 + STATUS / 2, y + MID, st, look);
  // The arrows darker under the pointer.
  const arrowInk = (part: string) => (hot === `task:${it.id}:${part}` ? (look.dark ? 'rgba(255,255,255,0.85)' : 'rgba(0,0,0,0.75)') : look.dark ? 'rgba(255,255,255,0.45)' : 'rgba(0,0,0,0.35)');
  drawIcon(ctx, it.tv ? 'chevron-up-m' : 'chevron-down-m', x + l.w - 35, y + MID - ARROW / 2, ARROW, arrowInk('arrow'));
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  /** Lines of text in a box, each on its middle, at a font. */
  const lines = (text: string, r: Rect, fs: number, weight: number, ink: string, alpha = 1, strike = false) => {
    ctx.font = font(fs, weight, FAMILY);
    ctx.fillStyle = ink;
    ctx.globalAlpha = alpha;
    const lh = lineH(fs);
    wrapText(text, r.w, (t) => ctx.measureText(t).width).forEach((line, i) => {
      const ly = y + r.y + lh * i + lh / 2;
      ctx.fillText(line, x + r.x, ly);
      if (strike && line) {
        ctx.fillRect(x + r.x, ly - 0.5, ctx.measureText(line).width, 1);
      }
    });
    ctx.globalAlpha = 1;
  };
  if (typing !== null) lines(it.text || 'Название задачи', l.title, TITLE_FS, 500, it.text ? look.ink : look.muted);
  if (!l.desc) return;
  if (typing !== 0) lines(it.desc || DESC_HINT, l.desc, TEXT_FS, 400, it.desc ? look.ink : look.muted, it.desc ? 0.8 : 1);
  if (l.more) drawIcon(ctx, 'chevron-down-m', x + l.more.x, y + l.more.y, ARROW, arrowInk('more'));
  if (!l.rows || !l.subs || !l.lines || !l.cancel || !l.finish || l.subsAt === undefined) return;
  ctx.fillStyle = look.dark ? 'rgba(255,255,255,0.1)' : '#DFE3E6';
  for (const ly of l.lines) ctx.fillRect(x + 49, y + ly, l.w - 98, 1);
  const label = (text: string, row: number) => {
    ctx.font = font(TEXT_FS, 400, FAMILY);
    ctx.fillStyle = look.ink;
    ctx.globalAlpha = 0.6;
    ctx.fillText(text, x + LABEL_X, y + row);
    ctx.globalAlpha = 1;
  };
  const person = (p: Person | undefined, row: number) => {
    ctx.beginPath();
    ctx.arc(x + AVATAR_X, y + row, 12, 0, Math.PI * 2);
    ctx.fillStyle = p ? p.c : look.dark ? 'rgba(255,255,255,0.15)' : '#DFE3E6';
    ctx.fill();
    if (p) {
      ctx.font = font(11, 600, FAMILY);
      ctx.fillStyle = '#fff';
      ctx.textAlign = 'center';
      ctx.fillText(p.n.slice(0, 1).toUpperCase(), x + AVATAR_X, y + row + 0.5);
      ctx.textAlign = 'left';
    }
    ctx.font = font(TEXT_FS, 400, FAMILY);
    ctx.fillStyle = p ? look.ink : look.muted;
    ctx.globalAlpha = p ? 0.8 : 1;
    ctx.fillText(p ? p.n : 'Не назначен', x + NAME_X, y + row);
    ctx.globalAlpha = 1;
  };
  label('Постановщик', l.rows[0]);
  person(it.boss, l.rows[0]);
  label('Исполнитель', l.rows[1]);
  person(it.doer, l.rows[1]);
  label('Крайний срок', l.rows[2]);
  drawIcon(ctx, 'calendar', x + AVATAR_X - 10, y + l.rows[2] - 12, 24, BLUE);
  ctx.font = font(TEXT_FS, 400, FAMILY);
  ctx.fillStyle = it.due ? look.ink : look.muted;
  ctx.globalAlpha = it.due ? 0.8 : 1;
  ctx.fillText(it.due ? DATE(it.due) : 'Не задан', x + NAME_X, y + l.rows[2]);
  ctx.globalAlpha = 1;
  lines('Подзадачи:', { x: LABEL_X, y: l.subsAt, w: l.w - LABEL_X * 2, h: lineH(TEXT_FS) }, TEXT_FS, 400, look.ink, 0.8);
  const subs = it.subs ?? [];
  l.subs.forEach((sy, i) => {
    const mid = sy + STATUS / 2, box = { x: SUB_TEXT_X, y: mid - lineH(TEXT_FS) / 2, w: l.w - SUB_TEXT_X - 47, h: lineH(TEXT_FS) };
    if (i === subs.length) {
      drawIcon(ctx, 'plus-s', x + SUB_X - 1, y + sy - 1, 24, look.muted);
      lines(SUB_HINT, box, TEXT_FS, 400, look.muted);
      return;
    }
    const sub = subs[i];
    drawStatus(ctx, x + SUB_X + STATUS / 2, y + mid, sub.done ? 'done' : 'todo', look);
    if (typing !== i + 1) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(x + box.x, y + box.y - 2, box.w, box.h + 4);
      ctx.clip();
      lines(sub.t || 'Подзадача', { ...box, w: Infinity }, TEXT_FS, 400, sub.t && !sub.done ? look.ink : look.muted, 1, !!sub.done);
      ctx.restore();
    }
  });
  // As the panels' buttons (.btn, .btn.primary): «Отмена» outlined faintly, «Завершить» in the blue gradient.
  const button = (r: Rect, text: string, solid: boolean) => {
    ctx.beginPath();
    ctx.roundRect(x + r.x, y + r.y, r.w, r.h, 7);
    if (solid) {
      const g = ctx.createLinearGradient(0, y + r.y, 0, y + r.y + r.h);
      g.addColorStop(0, '#549BFF');
      g.addColorStop(1, '#005FE3');
      ctx.fillStyle = g;
      ctx.fill();
    } else {
      ctx.beginPath();
      ctx.roundRect(x + r.x + 0.5, y + r.y + 0.5, r.w - 1, r.h - 1, 6.5);
      ctx.strokeStyle = look.dark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.08)';
      ctx.lineWidth = 1;
      ctx.stroke();
    }
    ctx.font = font(BUTTON_FONT.size, BUTTON_FONT.weight, FAMILY);
    ctx.fillStyle = solid ? '#fff' : look.dark ? look.ink : '#2F2F2F';
    ctx.textAlign = 'center';
    ctx.fillText(text, x + r.x + r.w / 2, y + r.y + r.h / 2);
    ctx.textAlign = 'left';
  };
  button(l.cancel, 'Отмена', false);
  button(l.finish, 'Завершить', true);
}
