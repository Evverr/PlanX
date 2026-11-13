import type { Board } from '../model/board';
import { FILLS, KANBAN_LANE, type Item } from '../model/types';
import type { Point } from '../canvas/geometry';
import { font } from '../canvas/text';
import { taskSize } from '../canvas/task';
import { membersOf } from '../editor/frames';
import { labOn } from './labs';

/**
 * «Канбан» (src/labs, one of the "Объекты"): a frame with stages across its top (`kb`), a column under
 * each. A task or a rectangle let go in it goes into the column it's let go over, where it's let go
 * among those there; each column's cards stand one under another, a gap between, so one opened (taller)
 * pushes those under it down, and one taken out closes the gap. Rectangles take the column's width. Laid
 * out again after each change made here (see tidyKanbans), not while something's being dragged; the
 * frame as tall as its longest column.
 */

export interface Stage { n: string; c: string }

/** Its stages when it's put on the board. */
export const FIRST_STAGES: Stage[] = [{ n: 'Не начато', c: 'gray' }, { n: 'В работе', c: 'blue' }, { n: 'Готово', c: 'green' }];

/** In board units: room round it, its header, a column (a card's width, KANBAN_LANE, and a margin each
 *  side), between columns, between cards, the room for its «+» on the right, how tall a column is at least. */
const PAD = 16, HEAD = 56, IN = 12, COL_W = KANBAN_LANE + IN * 2, COL_GAP = 16, CARD_GAP = 12, ADD_W = 40, MIN_H = 240;
export const KANBAN_RAD = 12;

/** What goes into its cells: tasks, and rectangles that are only that (not a block of code, a form…). */
export const snaps = (it: Item): boolean => it.type === 'task' || (it.type === 'rect' && !it.code && !it.form && !it.poll);

/** Its columns, on the board. */
export function columns(f: Item): Array<{ x: number; y: number; w: number; h: number }> {
  return (f.kb ?? []).map((_, i) => ({ x: f.x + PAD + i * (COL_W + COL_GAP), y: f.y + HEAD, w: COL_W, h: f.h - HEAD - PAD }));
}
/** Its size for `n` stages and its longest column `tall`. */
export const kanbanSize = (n: number, tall = 0) => ({ w: PAD * 2 + n * COL_W + (n - 1) * COL_GAP + ADD_W, h: HEAD + Math.max(MIN_H, tall + IN * 2) + PAD });

/** The column a point's over (the nearest, between them). */
function columnOf(f: Item, x: number): number {
  const n = f.kb?.length ?? 0;
  return Math.max(0, Math.min(n - 1, Math.floor((x - f.x - PAD + COL_GAP / 2) / (COL_W + COL_GAP))));
}

/** Where its cards go: each in the column its middle is over, in the order they stand there, one under
 *  another; rectangles the column's width. The frame's own height last. */
/** Its cards, column by column, in the order they stand. */
export function cardsByColumn(board: Board, f: Item, items: Item[] = board.list()): Item[][] {
  const by = (f.kb ?? []).map(() => [] as Item[]);
  if (!by.length) return by;
  for (const id of membersOf(board, f, items)) { const c = board.get(id); if (c && snaps(c)) by[columnOf(f, c.x + c.w / 2)].push(c); }
  // (By their tops: one grown taller stays where it was among them.)
  by.forEach((list) => list.sort((a, b) => a.y - b.y || (a.id < b.id ? -1 : 1)));
  return by;
}

export function kanbanLayout(board: Board, f: Item, items: Item[]): Map<string, Partial<Item>> {
  const out = new Map<string, Partial<Item>>(), cols = columns(f);
  if (!cols.length) return out;
  let tall = 0;
  cardsByColumn(board, f, items).forEach((list, i) => {
    let y = cols[i].y + IN;
    for (const c of list) {
      // As wide as the column, a task as tall as it then comes out (its text wrapping anew).
      const h = c.type === 'task' && c.w !== KANBAN_LANE ? taskSize(c, KANBAN_LANE).h : c.h, at = { x: cols[i].x + IN, y, w: KANBAN_LANE, h };
      if (at.x !== c.x || at.y !== c.y || at.w !== c.w || at.h !== c.h) out.set(c.id, at);
      y += h + CARD_GAP;
    }
    tall = Math.max(tall, y - CARD_GAP - cols[i].y - IN);
  });
  const size = kanbanSize(cols.length, tall);
  if (size.h !== f.h || size.w !== f.w) out.set(f.id, size);
  return out;
}

/** Lays out every kanban on the board that's out of order, for good (not a step to undo: undoing what was
 *  done lays it out again). `skip`: what's being dragged, left where it is. */
export function tidyKanbans(board: Board, skip: Set<string> = new Set()): void {
  const items = board.list(), all = new Map<string, Partial<Item>>();
  for (const f of items) {
    if (f.type !== 'frame' || !f.kb) continue;
    for (const [id, p] of kanbanLayout(board, f, items)) if (!skip.has(id)) all.set(id, p);
  }
  if (all.size) board.forGood(() => all.forEach((p, id) => board.updateForGood(id, p)));
}

/** Its «+» on the right of its header, for one more stage. */
export const addAt = (f: Item): Point => ({ x: f.x + f.w - PAD - ADD_W / 2 + 8, y: f.y + HEAD / 2 });

/** The kanban whose header a point's on, and what of it: a stage (its index) or its «+». */
export function headerAt(items: Item[], w: Point): { f: Item; part: { stage: number } | 'add' } | null {
  for (let k = items.length - 1; k >= 0; k--) {
    const f = items[k];
    if (!f.kb || w.x < f.x || w.x > f.x + f.w || w.y < f.y || w.y > f.y + HEAD) continue;
    const a = addAt(f);
    if (Math.hypot(w.x - a.x, w.y - a.y) <= 16) return { f, part: 'add' };
    const i = columns(f).findIndex((c) => w.x >= c.x && w.x <= c.x + c.w);
    return i >= 0 ? { f, part: { stage: i } } : null;
  }
  return null;
}

/** A kanban's header part under the pointer, as the renderer lights it (`kb:<id>:stage:<i>`, `…:add`). */
export function kanbanHot(items: Item[], w: Point): string | null {
  const h = labOn('kanban') ? headerAt(items, w) : null;
  return h ? `kb:${h.f.id}:${h.part === 'add' ? 'add' : `stage:${h.part.stage}`}` : null;
}

/** The colours a stage can be, in the order new ones take them. */
export const STAGE_COLORS = ['gray', 'blue', 'green', 'yellow', 'orange', 'pink', 'purple', 'graphite'];

/** One more stage on its right, in the next colour none has yet. */
export function addStage(board: Board, f: Item): void {
  const kb = f.kb ?? [], c = STAGE_COLORS.find((k) => !kb.some((s) => s.c === k)) ?? STAGE_COLORS[kb.length % STAGE_COLORS.length];
  board.update(f.id, { kb: [...kb, { n: 'Новая стадия', c }] });
  tidyKanbans(board);
}

/** A stage's name or colour changed. */
export function setStage(board: Board, f: Item, i: number, patch: Partial<Stage>): void {
  board.update(f.id, { kb: (f.kb ?? []).map((s, k) => (k === i ? { ...s, ...patch } : s)) });
}

/** A stage swapped with its neighbour (`dir` −1 left, 1 right), its cards going with it. */
export function moveStage(board: Board, f: Item, i: number, dir: -1 | 1): void {
  const kb = [...(f.kb ?? [])], j = i + dir;
  if (j < 0 || j >= kb.length) return;
  const by = cardsByColumn(board, f), step = (COL_W + COL_GAP) * dir;
  [kb[i], kb[j]] = [kb[j], kb[i]];
  board.transact(() => {
    board.update(f.id, { kb });
    by[i].forEach((c) => board.update(c.id, { x: c.x + step }));
    by[j].forEach((c) => board.update(c.id, { x: c.x - step }));
  });
  tidyKanbans(board);
}

/** A stage taken away with its cards, those on its right moving over; the last one stays. */
export function deleteStage(board: Board, f: Item, i: number): void {
  const kb = f.kb ?? [];
  if (kb.length < 2) return;
  const by = cardsByColumn(board, f);
  board.transact(() => {
    board.remove(by[i].map((c) => c.id));
    by.slice(i + 1).flat().forEach((c) => board.update(c.id, { x: c.x - COL_W - COL_GAP }));
    board.update(f.id, { kb: kb.filter((_, k) => k !== i), members: (f.members ?? []).filter((id) => !by[i].some((c) => c.id === id)) });
  });
  tidyKanbans(board);
}

/** Where a stage's pill stands, on the board (for its menu to open under). */
export const stageAt = (f: Item, i: number) => ({ x: columns(f)[i]?.x ?? f.x, y: f.y + HEAD / 2 + 14 });

interface Look { surface: string; bg: string; line: string; ink: string; muted: string }

/** Draws it: the card, each stage's pill (its colour, its name) and how many are in it, a column under
 *  each (the cells), and the «+». */
export function drawKanban(ctx: CanvasRenderingContext2D, f: Item, get: (id: string) => Item | undefined, look: Look, hot: string | null = null): void {
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(f.x, f.y, f.w, f.h, KANBAN_RAD);
  ctx.fillStyle = look.surface;
  ctx.fill();
  ctx.lineWidth = 1;
  ctx.strokeStyle = look.line;
  ctx.stroke();
  // (It always keeps a list of what it holds: it's made with one.)
  const cols = columns(f), counts = cols.map(() => 0);
  for (const id of f.members ?? []) { const it = get(id); if (it && snaps(it)) counts[columnOf(f, it.x + it.w / 2)]++; }
  ctx.textBaseline = 'middle';
  (f.kb ?? []).forEach((s, i) => {
    const c = cols[i];
    // The column: a faint cell under the header.
    ctx.beginPath();
    ctx.roundRect(c.x, c.y, c.w, c.h, 10);
    ctx.fillStyle = look.bg;
    ctx.fill();
    // The stage: its pill, then how many.
    ctx.font = font(15, 500);
    const tw = ctx.measureText(s.n).width, py = f.y + HEAD / 2;
    ctx.beginPath();
    ctx.roundRect(c.x, py - 14, tw + 20, 28, 8);
    ctx.fillStyle = FILLS[s.c] ?? FILLS.gray;
    ctx.fill();
    // (Under the pointer, a shade darker: it opens its menu.)
    if (hot === `stage:${i}`) { ctx.fillStyle = 'rgba(0, 0, 0, .06)'; ctx.fill(); }
    ctx.fillStyle = '#1C1F26';
    ctx.textAlign = 'left';
    ctx.fillText(s.n, c.x + 10, py);
    ctx.font = font(15, 400);
    ctx.fillStyle = look.muted;
    ctx.fillText(String(counts[i]), c.x + tw + 34, py);
  });
  const a = addAt(f);
  ctx.strokeStyle = hot === 'add' ? look.ink : look.muted;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(a.x - 7, a.y); ctx.lineTo(a.x + 7, a.y);
  ctx.moveTo(a.x, a.y - 7); ctx.lineTo(a.x, a.y + 7);
  ctx.stroke();
  ctx.restore();
}
