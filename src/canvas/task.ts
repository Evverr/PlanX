import type { Item, Person, TaskStatus } from '../model/types';
import { FILLS, MARK_COLORS, TEXT_COLORS } from '../model/types';
import { drawIcon } from '../icons/icons';
import { font, LINE_HEIGHT, textBlockHeight, withList, wrapText } from './text';
import { drawnLinks } from '../model/textLinks';
import { DAY, TL_STEPS } from './timeline';
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
/** As narrow as it goes, closed: a day of a timeline at its widest (6 times), to fit in one. */
export const TASK_MIN_W = DAY * Math.max(...TL_STEPS);
/** Its corners' radius, at its outer edge. */
export const TASK_RAD = 12;
const TITLE_FS = 16, TEXT_FS = 14, FAMILY = 'inter';
/** Where the title starts, and where its first line's middle is (the ring's and the arrow's too). */
const TITLE_X = 47, MID = 26;
const STATUS = 22, ARROW = 24;
/** How far round the ring and the arrow a press is still theirs (the rest of the header a double click's). */
const AROUND = 5;
/** The «ЗАДАЧА» pill's width, about (its 9 Inter caps and 6 each side), for a press on it. */
const PILL_W = 60;
/** Where the people's names start and their circles' middle; a row's height; a subtask's. */
/** What's under the header keeps this far from its sides (9 more than the header's ring from its left). */
const PAD = 24;
/** What's under the header starts where its title does, all of it on that line. */
const LEFT = TITLE_X;
const LABEL_X = LEFT, NAME_X = LEFT + 153, AVATAR_X = LEFT + 135, ROW = 33, SUB = 38;
/** The subtasks under who does it: their rings on its picture's middle, their text where names start. */
const SUB_X = LEFT - 2, SUB_TEXT_X = LEFT + 26;
/** The buttons as the panels' (.btn in popups.css): 32 tall, their text 12 bold Inter with 14 each side. */
const BUTTON_H = 32, BUTTON_PAD = 14, BUTTON_FONT = { size: 12, weight: 600 };
export const DESC_HINT = 'Добавить описание', SUB_HINT = 'Добавить подзадачу', KEEP_LABEL = 'Не сворачивать';
/** The box of «Не сворачивать», and its label after it. */
const KEEP_BOX = 18, KEEP_GAP = 8;

/** How much of its subtasks is done (0 to 1), when it has some: its ring shows that instead. */
export const progressOf = (it: Item): number | null => (it.subs?.length ? it.subs.filter((s) => s.done).length / it.subs.length : null);
/** Its status: with subtasks, done once they all are, being done once one is. */
export const statusOf = (it: Item): TaskStatus => {
  const pr = progressOf(it);
  // (Being done set by hand before, without subtasks: to do.)
  return pr === null ? (it.st === 'done' || (!it.st && it.done) ? 'done' : 'todo') : pr === 1 ? 'done' : pr > 0 ? 'doing' : 'todo';
};
/** What a click on its ring makes it: done, or to do again (being done is for those with subtasks, as far as they are). */
export const nextStatus = (s: TaskStatus): TaskStatus => (s === 'done' ? 'todo' : 'done');

/** Where everything on it is, from its top left corner. */
export interface TaskLayout {
  w: number; h: number;
  /** The header's height; the title's box. */
  head: number; title: Rect;
  /** Opened: the description's box (its text, or what's shown with none). */
  desc?: Rect;
  /** Opened to its description: the arrow under it. */
  more?: Point;
  /** Opened in full: the lines across, the rows shown and their middles (who does it; with the arrow at
   *  the right of the first, `peopleAt`, who set it and by when too), the
   *  subtasks' heading, each subtask's top (the last: the row adding one) and its text's height (its lines
   *  wrapped to its width), the buttons, and «Не
   *  сворачивать» left of them. */
  lines?: number[]; rows?: Array<{ key: 'boss' | 'doer' | 'due'; y: number }>; menu?: Rect; pin?: Rect; subsAt?: number; subs?: number[]; subH?: number[]; cancel?: Rect; finish?: Rect; keep?: Rect;
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

/** Its description's look, set by the text panel on the task (its title keeps the card's): size, font,
 *  weight, slant, alignment, colour (none: the card's ink) and how see-through, highlight, lines. */
export function descLook(it: Item) {
  return {
    fs: it.dfs ?? TEXT_FS, weight: it.fw ?? 400, family: it.ff ?? FAMILY, italic: !!it.fi, align: it.ta ?? 'left',
    color: it.tc ? (it.tc.startsWith('#') ? it.tc : TEXT_COLORS[it.tc] || undefined) : undefined, alpha: it.to,
    mark: it.mk ? MARK_COLORS[it.mk] ?? it.mk : undefined, markAlpha: it.mo ?? 0.45, under: !!it.fu, strike: !!it.fx,
  };
}

/** Its title on one line: cut off with "…" where it's wider than there's room for. */
export function titleLine(text: string, w: number): string {
  if (widthOf(text, TITLE_FS, 500) <= w) return text;
  let n = text.length;
  while (n > 0 && widthOf(text.slice(0, n).trimEnd() + '…', TITLE_FS, 500) > w) n--;
  return text.slice(0, n).trimEnd() + '…';
}

export function taskLayout(it: Item, w = it.w): TaskLayout {
  // The title on one line (see titleLine), the header as tall as ever.
  // (Its "…" up to the arrow's box, a letter more than that 10 short of it, narrowest.)
  const titleW = Math.max(20, w - TITLE_X - 30), th = lineH(TITLE_FS);
  const top = MID - th / 2, head = 52;
  const out: TaskLayout = { w, h: head, head, title: { x: TITLE_X, y: top, w: titleW, h: th } };
  // (Its description short of its menu, at the top right of what's under its header.)
  const descW = Math.max(80, w - LEFT - 44), dy = head + 22;
  // (Its description in a list, as drawn: each paragraph after its bullet or number.)
  const dl = descLook(it), dh = textBlockHeight(it.desc ? withList(it.desc, it.ls) : DESC_HINT, descW, dl.fs, { weight: dl.weight, family: dl.family, italic: dl.italic });
  if (!it.tv) return out;
  out.desc = { x: LEFT, y: dy, w: descW, h: dh };
  // Its menu (three dots one over another) at the top right of what's under its header; its pin under it while it's kept
  // open («Закрепить описание»), the description as tall as both at least.
  out.menu = { x: w - 35, y: head + 12, w: ARROW, h: ARROW };
  if (it.keep) out.pin = { x: w - 35, y: head + 40, w: ARROW, h: ARROW };
  const d = Math.max(dy + dh, it.keep ? head + 40 + ARROW - 4 : 0), full = it.tv === 'full';
  // All of it: under the description the blocks it has (added by its menu, or with something in them):
  // its subtasks, who set it and does it, by when; each after a line across, its first row 33 under it,
  // its last 33 over what comes next.
  out.lines = [];
  let at = d + 25;
  if (full && (it.tsb || it.subs?.length)) {
    out.lines.push(at);
    // «Подзадачи:», the subtasks under it, their boxes on the title's line; each as tall as its lines (the
    // row adding one, one), the next 38 on from its first line.
    out.subsAt = at + 33;
    const lh = lineH(TEXT_FS), subW = Math.max(40, w - SUB_TEXT_X - PAD);
    out.subH = [...(it.subs ?? []).map((sub) => textBlockHeight(sub.t || 'Подзадача', subW, TEXT_FS, { weight: 400, family: FAMILY })), lh];
    out.subs = [];
    let sy = out.subsAt + 34 - STATUS / 2;
    for (const h of out.subH) { out.subs.push(sy); sy += SUB + h - lh; }
    at = out.subs[out.subs.length - 1] + STATUS + 27;
  }
  const keys = full ? [...(it.tpp || it.boss || it.doer ? (['boss', 'doer'] as const) : []), ...(it.tdu || it.due ? (['due'] as const) : [])] : [];
  if (keys.length) {
    out.lines.push(at);
    out.rows = keys.map((key, i) => ({ key, y: at + 33 + ROW * i }));
    at = at + 33 + ROW * (keys.length - 1) + 33;
  }
  // Its foot: «Отмена» and «Завершить» at its right, shown by its menu («Показать кнопки»), after a line.
  if (full && it.tbtn) {
    out.lines.push(at);
    const by = at + 24, fw = buttonW('Завершить'), cw = buttonW('Отмена'), fx = w - PAD - fw;
    out.finish = { x: fx, y: by, w: fw, h: BUTTON_H };
    out.cancel = { x: fx - 10 - cw, y: by, w: cw, h: BUTTON_H };
    out.h = Math.ceil(by + BUTTON_H + 31);
  } else out.h = Math.ceil(out.lines.length ? at - 8 : d + 22);
  return out;
}

/** Its size for what's in it (and opened or not). */
export const taskSize = (it: Item, w = it.w): { w: number; h: number } => ({ w, h: taskLayout(it, w).h });

/** What a point on it (from its top left corner) is on. */
export type TaskPart = 'status' | 'arrow' | 'more' | 'menu' | 'pin' | 'head' | 'title' | 'desc' | 'boss' | 'doer' | 'due' | 'add' | 'cancel' | 'finish' | 'keep'
  | { sub: number; tick: boolean; del?: boolean };

const inRect = (p: Point, r: Rect, pad = 0) => p.x >= r.x - pad && p.x <= r.x + r.w + pad && p.y >= r.y - pad && p.y <= r.y + r.h + pad;
const near = (p: Point, x: number, y: number, r: number) => Math.hypot(p.x - x, p.y - y) <= r;

export function taskPartAt(it: Item, p: Point): TaskPart | null {
  const l = taskLayout(it), q = { x: p.x - it.x, y: p.y - it.y };
  // The header: the ring and the arrow theirs and 5 round them, the title's text the title, the rest
  // of it the header itself (a double click there opens it further).
  if (q.y >= 0 && q.y < l.head && q.x >= 0 && q.x <= l.w) {
    const on = (cx: number, half: number) => Math.abs(q.x - cx) <= half + AROUND && Math.abs(q.y - MID) <= half + AROUND;
    if (on(15 + STATUS / 2, STATUS / 2)) return 'status';
    // Its right corner all opens or closes it: the arrow's column, and its «ЗАДАЧА» pill along the top edge.
    if (q.x >= l.w - 47 || (q.y <= 10 && q.x >= l.w - 16 - PILL_W)) return 'arrow';
    const line = titleLine(it.text || 'Название задачи', l.title.w);
    return q.y >= l.title.y && q.y <= l.title.y + l.title.h && q.x >= l.title.x && q.x <= l.title.x + widthOf(line, TITLE_FS, 500) ? 'title' : 'head';
  }
  if (l.more && near(q, l.more.x + ARROW / 2, l.more.y + ARROW / 2, ARROW / 2 + 4)) return 'more';
  if (l.desc && inRect(q, l.desc)) return 'desc';
  if (l.rows) for (const r of l.rows) if (Math.abs(q.y - r.y) <= 14 && q.x >= AVATAR_X - 14 && q.x <= l.w - PAD - 24) return r.key;
  if (l.subs) {
    for (let i = 0; i < l.subs.length; i++) {
      if (q.y < l.subs[i] - 6 || q.y > l.subs[i] + STATUS + (l.subH?.[i] ?? 0) - lineH(TEXT_FS) + 6) continue;
      if (i === l.subs.length - 1) return q.x >= SUB_X - 4 && q.x <= l.w - PAD ? 'add' : null;
      // Left of its box, the cross taking it away (shown as the pointer comes over it).
      if (q.x >= SUB_X - 22 && q.x < SUB_X - 1) return { sub: i, tick: false, del: true };
      if (near(q, SUB_X + STATUS / 2, l.subs[i] + STATUS / 2, STATUS / 2 + 4)) return { sub: i, tick: true };
      if (q.x >= SUB_TEXT_X && q.x <= l.w - PAD) return { sub: i, tick: false };
    }
  }
  if (l.menu && inRect(q, l.menu, 4)) return 'menu';
  if (l.pin && inRect(q, l.pin, 2)) return 'pin';
  if (l.cancel && inRect(q, l.cancel)) return 'cancel';
  if (l.finish && inRect(q, l.finish)) return 'finish';
  if (l.keep && inRect(q, l.keep, 4)) return 'keep';
  return null;
}

/** Where a part's text is typed in (on the board): the title, the description, a subtask. */
export function taskFieldBox(it: Item, field: number | null): Rect & { fs: number; weight: number } {
  const l = taskLayout(it);
  if (field === 0 && l.desc) return { x: it.x + l.desc.x, y: it.y + l.desc.y, w: l.desc.w, h: l.desc.h, fs: descLook(it).fs, weight: descLook(it).weight };
  if (field !== null && field > 0 && l.subs) {
    const y = l.subs[field - 1] + STATUS / 2 - lineH(TEXT_FS) / 2;
    return { x: it.x + SUB_TEXT_X, y: it.y + y, w: Math.max(40, l.w - SUB_TEXT_X - PAD), h: l.subH?.[field - 1] ?? lineH(TEXT_FS), fs: TEXT_FS, weight: 400 };
  }
  return { x: it.x + l.title.x, y: it.y + l.title.y, w: l.title.w, h: l.title.h, fs: TITLE_FS, weight: 500 };
}
export const TASK_FONT = FAMILY;

/** The strong colour each of the stickers' colours stands for here: its edge, its header's tint. */
const STRONG: Record<string, string> = {
  blue: '#003CFF', green: '#12A53A', orange: '#F28C00', yellow: '#E0B000', pink: '#E8457F', purple: '#7B4DFF', gray: '#7C8590', graphite: '#4E5560',
};
const BLUE = '#2A5BFF';
/** A subtask's box ticked: a softer blue. */
const SOFT_BLUE = '#5C86FF';
/** A task done: its edge's and tint's colour. */
const DONE_GREY = '#5A616C';

const rgb = (hex: string) => { const n = parseInt(hex.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const mix = (a: string, b: string, k: number) => {
  const [r1, g1, b1] = rgb(a), [r2, g2, b2] = rgb(b);
  return `rgb(${Math.round(r1 * k + r2 * (1 - k))}, ${Math.round(g1 * k + g2 * (1 - k))}, ${Math.round(b1 * k + b2 * (1 - k))})`;
};
const strongOf = (color: string | undefined) => (color?.startsWith('#') ? color : STRONG[color ?? 'blue'] ?? (FILLS[color ?? ''] && FILLS[color!] !== 'transparent' ? FILLS[color!] : STRONG.blue));

/** `px`: the screen's pixels in a unit of the board (for the shadow, which the canvas doesn't scale). */
export interface TaskLook { surface: string; ink: string; muted: string; dark: boolean; z: number; px: number;
  /** Links in its description: their blue, and where each piece of one was drawn, to be clicked. */
  linkInk?: string; onLink?: (r: Rect & { url: string }) => void }

/** A square box, 18 across from x, y: ticked, filled with `color` and a white tick; else outlined in grey. */
function drawBox(ctx: CanvasRenderingContext2D, bx: number, by: number, on: boolean, color: string, look: TaskLook): void {
  ctx.save();
  ctx.beginPath();
  if (on) {
    ctx.roundRect(bx, by, KEEP_BOX, KEEP_BOX, 5);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(bx + 4.6, by + 9.2);
    ctx.lineTo(bx + 7.6, by + 12.2);
    ctx.lineTo(bx + 13.4, by + 6);
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke();
  } else {
    ctx.roundRect(bx + 0.75, by + 0.75, KEEP_BOX - 1.5, KEEP_BOX - 1.5, 4.5);
    ctx.strokeStyle = look.dark ? 'rgba(255,255,255,0.25)' : '#D3D8DE';
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }
  ctx.restore();
}

/** The ring of a status, its middle at x, y; being done, `part` of it
 *  round in blue (three quarters; with subtasks, as much as of them is done). */
export function drawStatus(ctx: CanvasRenderingContext2D, x: number, y: number, s: TaskStatus, look: TaskLook, part = 0.75): void {
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
      ctx.arc(x, y, r - 2, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * part);
      ctx.strokeStyle = BLUE;
      ctx.lineWidth = 3.5;
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

/** How far each task's parts are lit under the pointer (0…1, by "id:part"), easing there and back. */
const lit = new Map<string, { on: boolean; from: number; at: number }>();
let redraw: () => void = () => {};
/** What draws the board again while a part's light eases (the editor's). */
export const setTaskRedraw = (fn: () => void): void => { redraw = fn; };
function litNow(key: string, on: boolean, ms = 160): number {
  const now = performance.now(), at = (t: { on: boolean; from: number; at: number }) => {
    const k = Math.min(1, (now - t.at) / ms), e = 1 - (1 - k) * (1 - k);
    return t.from + ((t.on ? 1 : 0) - t.from) * e;
  };
  let t = lit.get(key);
  if (!t) { if (!on) return 0; lit.set(key, (t = { on, from: 0, at: now })); }
  else if (t.on !== on) lit.set(key, (t = { on, from: at(t), at: now }));
  if (now - t.at < ms) redraw();
  else if (!t.on) lit.delete(key);
  return at(t);
}

/** How long a task takes to open or close (or show more or less of itself), in ms. */
const GLIDE = 140;
/** Each task as last drawn, and those gliding from one size to another: from what size, since when,
 *  and the one of the two that shows more (what's under its header fading in or out). */
const drawnAs = new Map<string, { it: Item; w: number; h: number }>();
const glides = new Map<string, { w: number; h: number; at: number; more: Item; fade: boolean }>();

/** Where a task gliding open or closed is in it: its size now, and how opened it looks (1 opened). */
function glideNow(it: Item): { w: number; h: number; open: number; more: Item } | null {
  const g = glides.get(it.id);
  if (!g) return null;
  const k = (performance.now() - g.at) / GLIDE;
  if (k >= 1) return null;
  const e = k < 0.5 ? 2 * k * k : 1 - (2 - 2 * k) * (2 - 2 * k) / 2, to = taskLayout(it);
  const open = !g.fade ? 1 : it.tv ? e : 1 - e;
  return { w: g.w + (to.w - g.w) * e, h: g.h + (to.h - g.h) * e, open, more: g.more };
}

/** The size a task's drawn at now (gliding open or closed, not yet the size it is): for its frame
 *  when picked. */
export function taskShown(it: Item): Item {
  const g = it.type === 'task' && glideNow(it);
  return g ? { ...it, w: g.w, h: g.h } : it;
}

/** The card, gliding to its new size as it's opened or closed. `typing` is the part being typed in
 *  (its text left to the overlay): null for the title, 0 for the description, 1… for a subtask;
 *  undefined when none is. */
export function drawTaskCard(ctx: CanvasRenderingContext2D, it: Item, look: TaskLook, typing: number | null | undefined, hot: string | null = null): void {
  const was = drawnAs.get(it.id), l = taskLayout(it);
  if (was && was.it.tv !== it.tv) {
    // (From where it is if it's gliding already.)
    const now = glideNow(was.it) ?? was, wl = taskLayout(was.it);
    glides.set(it.id, { w: now.w, h: now.h, at: performance.now(), more: !it.tv || (was.it.tv && wl.h > l.h) ? was.it : it, fade: !it.tv || !was.it.tv });
  }
  drawnAs.set(it.id, { it, w: l.w, h: l.h });
  const g = glideNow(it);
  if (!g) { glides.delete(it.id); drawCard(ctx, it, look, typing, hot); return; }
  redraw();
  const { x, y } = it, strong = statusOf(it) === 'done' ? DONE_GREY : strongOf(it.color);
  const bg = look.dark ? '#26272C' : '#FFFFFF', tint = mix(strong, bg, look.dark ? 0.16 : 0.05);
  const head = taskLayout(g.more).head;
  // Its body tinted as closed; over it, the one showing more as it is (what's under its header seen as
  // opened as it looks, in its size now); its header in its width now; its edge round all of it.
  ctx.beginPath();
  ctx.roundRect(x + 1, y + 1, g.w - 2, g.h - 2, TASK_RAD - 1);
  ctx.fillStyle = tint;
  ctx.fill();
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(x + 1, y + 1, g.w - 2, g.h - 2, TASK_RAD - 1);
  ctx.clip();
  ctx.globalAlpha = g.open;
  drawCard(ctx, g.more, look, undefined, hot);
  ctx.restore();
  ctx.save();
  ctx.beginPath();
  ctx.rect(x - 1, y - 10, g.w + 2, Math.min(head - 2, g.h) + 10);
  ctx.clip();
  drawCard(ctx, { ...g.more, w: g.w }, look, undefined, hot);
  ctx.restore();
  ctx.beginPath();
  ctx.roundRect(x + 1, y + 1, g.w - 2, g.h - 2, TASK_RAD - 1);
  ctx.strokeStyle = `rgba(${rgb(strong.startsWith('#') ? strong : '#003CFF').join(',')}, 0.3)`;
  ctx.lineWidth = 2;
  ctx.stroke();
}

function drawCard(ctx: CanvasRenderingContext2D, it: Item, look: TaskLook, typing: number | null | undefined, hot: string | null = null): void {
  // Done, it's grey, darker than the grey given to anything (a colour not given to those still to do).
  const l = taskLayout(it), { x, y } = it, strong = statusOf(it) === 'done' ? DONE_GREY : strongOf(it.color);
  const bg = look.dark ? '#26272C' : '#FFFFFF', tint = mix(strong, bg, look.dark ? 0.16 : 0.05);
  const edge = `rgba(${rgb(strong.startsWith('#') ? strong : '#003CFF').join(',')}, 0.3)`;
  // The card, its edge 2 wide inside it; its header tinted, the whole of it when closed. Opened, it
  // lies over the board with a shadow.
  ctx.beginPath();
  ctx.roundRect(x + 1, y + 1, l.w - 2, l.h - 2, TASK_RAD - 1);
  ctx.fillStyle = it.tv ? bg : tint;
  // (No shadow, opened or not.)
  ctx.fill();
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
  // At the right of its top edge, a pill saying what it is, of the edge's colour, in white.
  ctx.font = font(9, 600, FAMILY);
  ctx.letterSpacing = '0.5px';
  // (Opening it on a click, as the arrow; a little stronger under the pointer.)
  const tag = 'ЗАДАЧА', pw = ctx.measureText(tag).width + 12;
  ctx.beginPath();
  ctx.roundRect(x + l.w - 16 - pw, y + 1 - 7, pw, 14, 7);
  ctx.fillStyle = mix(strong.startsWith('#') ? strong : '#003CFF', bg, 0.3 + 0.15 * litNow(`${it.id}:arrow`, hot === `task:${it.id}:arrow`));
  ctx.fill();
  ctx.fillStyle = '#FFFFFF';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  // (The letters' spacing comes after each, the last one's too: half of it back.)
  ctx.fillText(tag, x + l.w - 16 - pw / 2 + 0.25, y + 1.5);
  ctx.letterSpacing = '0px';
  const st = statusOf(it);
  // With subtasks, as far round as they're done (2 of 4, half); none yet, 5% (set, it's begun).
  const pr = progressOf(it);
  drawStatus(ctx, x + 15 + STATUS / 2, y + MID, pr !== null && pr < 1 ? 'doing' : st, look, pr === null ? 0.75 : pr || 0.05);
  // The arrows darker under the pointer.
  // (Darker under the pointer, easing there and back.)
  const arrowInk = (part: string) => { const k = litNow(`${it.id}:${part}`, hot === `task:${it.id}:${part}`); return look.dark ? `rgba(255,255,255,${0.45 + 0.4 * k})` : `rgba(0,0,0,${0.35 + 0.4 * k})`; };
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
  if (typing !== null) lines(titleLine(it.text || 'Название задачи', l.title.w), { ...l.title, w: Infinity }, TITLE_FS, 500, it.text ? look.ink : look.muted);
  if (!l.desc) return;
  if (typing !== 0 && !it.desc) lines(DESC_HINT, l.desc, TEXT_FS, 400, look.muted);
  else if (typing !== 0) {
    // As the text panel set it, in a list as it's set, links on parts of it blue and underlined (see
    // model/textLinks.ts).
    const dl = descLook(it), text = withList(it.desc!, it.ls), links = it.links?.length ? drawnLinks(it.desc!, it.ls, it.links) : [];
    const lh = lineH(dl.fs), linkInk = look.linkInk ?? BLUE, ink = dl.color ?? look.ink, alpha = dl.alpha ?? (dl.color ? 1 : 0.8), rule = Math.max(1, dl.fs / 14);
    ctx.font = font(dl.fs, dl.weight, dl.family, dl.italic);
    let from = 0;
    wrapText(text, l.desc.w, (t) => ctx.measureText(t).width).forEach((line, i) => {
      const ly = y + l.desc!.y + lh * i, mid = ly + lh / 2, lw = ctx.measureText(line).width;
      const lx = x + l.desc!.x + (dl.align === 'center' ? (l.desc!.w - lw) / 2 : dl.align === 'right' ? l.desc!.w - lw : 0);
      if (line && dl.mark) {
        ctx.globalAlpha = dl.markAlpha;
        ctx.fillStyle = dl.mark;
        ctx.fillRect(lx - 2, ly + lh * 0.06, lw + 4, lh * 0.88);
      }
      const at = text.indexOf(line, from), on = links.filter((k) => k.s < at + line.length && k.e > at);
      from = at + line.length;
      const cuts = [...new Set([0, line.length, ...on.flatMap((k) => [k.s - at, k.e - at]).filter((c) => c > 0 && c < line.length)])].sort((a, b) => a - b);
      for (let c = 0; c + 1 < cuts.length; c++) {
        const piece = line.slice(cuts[c], cuts[c + 1]), px = lx + ctx.measureText(line.slice(0, cuts[c])).width, pw = ctx.measureText(piece).width;
        const link = on.find((k) => k.s - at <= cuts[c] && k.e - at >= cuts[c + 1]);
        ctx.fillStyle = link ? linkInk : ink;
        ctx.globalAlpha = alpha;
        ctx.fillText(piece, px, mid);
        if (dl.under && !link) ctx.fillRect(px, mid + dl.fs * 0.42, pw, rule);
        if (dl.strike) ctx.fillRect(px, mid + dl.fs * 0.04 - rule / 2, pw, rule);
        if (link) {
          ctx.globalAlpha = alpha * 0.4;
          ctx.fillRect(px, mid + dl.fs * 0.55, pw, rule);
          look.onLink?.({ x: px, y: ly, w: pw, h: lh, url: link.url });
        }
      }
      ctx.globalAlpha = 1;
    });
  }
  if (l.more) drawIcon(ctx, 'chevron-down-m', x + l.more.x, y + l.more.y, ARROW, arrowInk('more'));
  if (!l.lines) return;
  // (The lines across half as strong as the panels' line grey.)
  ctx.fillStyle = look.dark ? 'rgba(255,255,255,0.05)' : 'rgba(223,227,230,0.5)';
  for (const ly of l.lines) ctx.fillRect(x + LEFT, y + ly, l.w - LEFT - PAD, 1);
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
  for (const { key, y: ry } of l.rows ?? []) {
    if (key === 'boss') { label('Постановщик', ry); person(it.boss, ry); }
    else if (key === 'doer') { label('Исполнитель', ry); person(it.doer, ry); }
    else {
      label('Крайний срок', ry);
      drawIcon(ctx, 'calendar', x + AVATAR_X - 10, y + ry - 12, 24, BLUE);
      ctx.font = font(TEXT_FS, 400, FAMILY);
      ctx.fillStyle = it.due ? look.ink : look.muted;
      ctx.globalAlpha = it.due ? 0.8 : 1;
      ctx.fillText(it.due ? DATE(it.due) : 'Не задан', x + NAME_X, y + ry);
      ctx.globalAlpha = 1;
    }
  }
  // Its menu, three dots one over another, darker under the pointer.
  // (Lighter than the arrows, darker under the pointer.)
  if (l.menu) { const k = litNow(`${it.id}:menu`, hot === `task:${it.id}:menu`); drawIcon(ctx, 'more-vertical-l', x + l.menu.x, y + l.menu.y, ARROW, look.dark ? `rgba(255,255,255,${0.3 + 0.55 * k})` : `rgba(0,0,0,${0.2 + 0.55 * k})`); }
  // Kept open («Закрепить описание»): a pin over it, unpinning it on a click.
  if (l.pin) drawIcon(ctx, 'pin', x + l.pin.x, y + l.pin.y, ARROW, hot === `task:${it.id}:pin` ? BLUE : arrowInk('pin'));
  if (l.subsAt !== undefined) label('Подзадачи:', l.subsAt);
  const subs = it.subs ?? [];
  (l.subs ?? []).forEach((sy, i) => {
    const mid = sy + STATUS / 2, box = { x: SUB_TEXT_X, y: mid - lineH(TEXT_FS) / 2, w: Math.max(40, l.w - SUB_TEXT_X - PAD), h: l.subH?.[i] ?? lineH(TEXT_FS) };
    if (i === subs.length) {
      drawIcon(ctx, 'plus-s', x + SUB_X - 1, y + sy - 1, 24, look.muted);
      lines(SUB_HINT, box, TEXT_FS, 400, look.muted);
      return;
    }
    const sub = subs[i];
    // A box as the usual ones (as «Не сворачивать»'s), ticked in a softer blue.
    drawBox(ctx, x + SUB_X + STATUS / 2 - KEEP_BOX / 2, y + mid - KEEP_BOX / 2, !!sub.done, SOFT_BLUE, look);
    // Its lines wrapped to its width; done, grey (not struck through).
    if (typing !== i + 1) lines(sub.t || 'Подзадача', box, TEXT_FS, 400, sub.t && !sub.done ? look.ink : look.muted);
    // The pointer on it: left of its box a cross taking it away, darker on it.
    if (hot === `task:${it.id}:sub:${i}` || hot === `task:${it.id}:del:${i}`) {
      const cx = x + SUB_X - 12, cy = y + mid, d = 4;
      ctx.strokeStyle = hot.includes(':del:') ? (look.dark ? 'rgba(255,255,255,0.85)' : 'rgba(0,0,0,0.7)') : look.dark ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.3)';
      ctx.lineWidth = 1.5;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(cx - d, cy - d); ctx.lineTo(cx + d, cy + d);
      ctx.moveTo(cx + d, cy - d); ctx.lineTo(cx - d, cy + d);
      ctx.stroke();
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
  if (l.cancel) button(l.cancel, 'Отмена', false);
  if (l.finish) button(l.finish, 'Завершить', true);
  // «Не сворачивать»: a box, ticked in blue when it's to stay open.
  if (l.keep) {
    const bx = x + l.keep.x, by = y + l.keep.y + (BUTTON_H - KEEP_BOX) / 2;
    drawBox(ctx, bx, by, !!it.keep, BLUE, look);
    ctx.font = font(TEXT_FS, 400, FAMILY);
    ctx.fillStyle = look.ink;
    ctx.globalAlpha = 0.6;
    ctx.fillText(KEEP_LABEL, bx + KEEP_BOX + KEEP_GAP, y + l.keep.y + BUTTON_H / 2);
    ctx.globalAlpha = 1;
  }
}
