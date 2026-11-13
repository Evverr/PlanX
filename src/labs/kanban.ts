import type { Board } from '../model/board';
import { KB, kanbanCol, kanbanLane, type Item } from '../model/types';
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

/** In board units (KB in model/types.ts besides): between cards, how tall a column is at least. Its
 *  stages' pills: corners as a mind map node's. */
const { PAD, LEFT, HEAD, IN, GAP: COL_GAP, ADD: ADD_W } = KB, CARD_GAP = 12, MIN_H = 240;
/** A stage's pill: its middle's height in the header, how tall (its ends round), its text's size and the
 *  room round its text. */
const PILL_Y = 28, PILL_H = 28, PILL_FS = 15, PILL_PAD = 12;

/** The stages' colours: pastel, lighter than the board's fills (by their name there). */
export const STAGE_TINTS: Record<string, string> = {
  gray: '#ECEEF1', blue: '#D6EBFF', green: '#DAF3D5', yellow: '#FFF1C2', orange: '#FFE2C4', pink: '#FFDCE8', purple: '#E8E0FF', graphite: '#DFE2E7',
};

let measure: CanvasRenderingContext2D | null = null;
/** How wide a stage's pill is (its name in it). */
function pillW(name: string): number {
  if (typeof document === 'undefined') return name.length * PILL_FS * 0.55 + PILL_PAD * 2;
  measure ??= document.createElement('canvas').getContext('2d');
  if (!measure) return 100;
  measure.font = font(PILL_FS, 500);
  return measure.measureText(name).width + PILL_PAD * 2;
}
export const KANBAN_RAD = 12;

/** What goes into its cells: tasks, and rectangles that are only that (not a block of code, a form…). */
export const snaps = (it: Item): boolean => it.type === 'task' || (it.type === 'rect' && !it.code && !it.form && !it.poll);

/** Its columns, on the board: as wide as it is, shared between them (stretched with it). */
export function columns(f: Item): Array<{ x: number; y: number; w: number; h: number }> {
  const w = kanbanCol(f);
  return (f.kb ?? []).map((_, i) => ({ x: f.x + LEFT + i * (w + COL_GAP), y: f.y + HEAD, w, h: f.h - HEAD - PAD }));
}
/** Its size with `n` columns `col` wide and its longest column `tall`: as it's put there, and at least. */
export const kanbanSize = (n: number, tall = 0, col = KB.COL) => ({ w: LEFT + PAD + n * col + (n - 1) * COL_GAP + ADD_W, h: HEAD + Math.max(MIN_H, tall + IN * 2) + PAD });

/** The column a point's over (the nearest, between them). */
export function columnOf(f: Item, x: number): number {
  const n = f.kb?.length ?? 0;
  return Math.max(0, Math.min(n - 1, Math.floor((x - f.x - LEFT + COL_GAP / 2) / (kanbanCol(f) + COL_GAP))));
}

/** Its cards, column by column, in the order they stand. */
export function cardsByColumn(board: Board, f: Item, items: Item[] = board.list()): Item[][] {
  const by = (f.kb ?? []).map(() => [] as Item[]);
  if (!by.length) return by;
  for (const id of membersOf(board, f, items)) { const c = board.get(id); if (c && snaps(c)) by[columnOf(f, c.x + c.w / 2)].push(c); }
  // (By their tops: one grown taller stays where it was among them.)
  by.forEach((list) => list.sort((a, b) => a.y - b.y || (a.id < b.id ? -1 : 1)));
  return by;
}

/** Where its cards go: each in the column its middle is over, in the order they stand there, one under
 *  another, as wide as the column. The frame no smaller than they and its columns need (stretched
 *  bigger, it stays so). */
export function kanbanLayout(board: Board, f: Item, items: Item[]): Map<string, Partial<Item>> {
  const out = new Map<string, Partial<Item>>(), cols = columns(f), lane = kanbanLane(f);
  if (!cols.length) return out;
  let tall = 0;
  cardsByColumn(board, f, items).forEach((list, i) => {
    let y = cols[i].y + IN;
    for (const c of list) {
      // A task as tall as it then comes out (its text wrapping anew).
      const h = c.type === 'task' && c.w !== lane ? taskSize(c, lane).h : c.h, at = { x: Math.round(cols[i].x), y, w: lane, h };
      if (at.x !== c.x || at.y !== c.y || at.w !== c.w || at.h !== c.h) out.set(c.id, at);
      y += h + CARD_GAP;
    }
    tall = Math.max(tall, y - CARD_GAP - cols[i].y - IN);
  });
  const least = kanbanSize(cols.length, tall, KB.MIN_COL), size = { w: Math.max(f.w, least.w), h: Math.max(f.h, least.h) };
  if (size.h !== f.h || size.w !== f.w) out.set(f.id, size);
  return out;
}

/** Lays out every kanban on the board that's out of order, for good (not a step to undo: undoing what was
 *  done lays it out again). `skip`: what's being dragged, left where it is. */
export function tidyKanbans(board: Board, skip: Set<string> = new Set(), glide = true): void {
  const items = board.list(), all = new Map<string, Partial<Item>>();
  for (const f of items) {
    if (f.type !== 'frame' || !f.kb) continue;
    for (const [id, p] of kanbanLayout(board, f, items)) if (!skip.has(id)) all.set(id, p);
  }
  if (!all.size) return;
  // The cards moved glide there, from where they're seen now (see glideOffset); not as it's stretched.
  const now = performance.now();
  if (glide) for (const [id, p] of all) {
    const c = board.get(id), was = glideOffset(id, now);
    if (c?.type !== 'frame' && c && (p.x !== undefined || p.y !== undefined)) glides.set(id, { dx: c.x - (p.x ?? c.x) + (was?.x ?? 0), dy: c.y - (p.y ?? c.y) + (was?.y ?? 0), at: now });
  }
  board.forGood(() => all.forEach((p, id) => board.updateForGood(id, p)));
}

/** Cards gliding to their places in a column, by id: how far off it they were, and since when; in this long. */
const glides = new Map<string, { dx: number; dy: number; at: number }>();
const GLIDE_MS = 220;
/** How far off its place a card's drawn now, gliding there (easing out), if it is. */
export function glideOffset(id: string, now: number): Point | null {
  const g = glides.get(id);
  if (!g) return null;
  const k = (now - g.at) / GLIDE_MS;
  if (k >= 1) { glides.delete(id); return null; }
  const left = (1 - k) ** 3;
  return { x: g.dx * left, y: g.dy * left };
}
export const gliding = (now: number): boolean => [...glides.values()].some((g) => now - g.at < GLIDE_MS);

/** The kanban column a card being dragged would go into, let go now (the one its middle's over), and
 *  where among its cards: the line between them it'd go in at (`y`, across `x`…`x + w`). `skip`: what's
 *  being dragged. */
export function dropTarget(items: Item[], it: Item | undefined, skip: Set<string> = new Set()): { id: string; col: number; x: number; w: number; y: number | null } | null {
  if (!it || !snaps(it)) return null;
  const cx = it.x + it.w / 2, cy = it.y + it.h / 2;
  const f = items.find((k) => k.kb && cx >= k.x && cx <= k.x + k.w && cy >= k.y && cy <= k.y + k.h);
  if (!f) return null;
  const col = columnOf(f, cx), c = columns(f)[col], held = new Set(f.members ?? []);
  // (As they'll stand: by their tops, the one let go among them by its own.)
  const cards = items.filter((o) => held.has(o.id) && !skip.has(o.id) && snaps(o) && columnOf(f, o.x + o.w / 2) === col).sort((a, b) => a.y - b.y);
  // (Between two of them only: not over the first, nor under the last.)
  const before = cards.filter((o) => o.y < it.y), last = before[before.length - 1], next = cards[before.length];
  return { id: f.id, col, x: c.x, w: c.w, y: last && next ? last.y + last.h + CARD_GAP / 2 : null };
}

/** Its «+» on the right of its header, for one more stage. */
export const addAt = (f: Item): Point => ({ x: f.x + f.w - PAD - ADD_W / 2 + 8, y: f.y + PILL_Y });

/** The kanban whose header a point's on, and what of it: a stage (its index) or its «+». */
export function headerAt(items: Item[], w: Point): { f: Item; part: { stage: number } | 'add' | 'head' } | null {
  for (let k = items.length - 1; k >= 0; k--) {
    const f = items[k];
    if (!f.kb || w.x < f.x || w.x > f.x + f.w || w.y < f.y || w.y > f.y + HEAD) continue;
    const a = addAt(f);
    if (Math.hypot(w.x - a.x, w.y - a.y) <= 16) return { f, part: 'add' };
    // On a stage's pill; elsewhere in the header, the header (the whole kanban's taken by it).
    const py = f.y + PILL_Y, i = (f.kb ?? []).findIndex((s, n) => { const c = columns(f)[n]; return w.x >= c.x && w.x <= c.x + pillW(s.n) && Math.abs(w.y - py) <= PILL_H / 2 + 2; });
    return { f, part: i >= 0 ? { stage: i } : 'head' };
  }
  return null;
}

/** The column a point's over in a kanban (for a stage dragged along its header). */
export const columnAt = (f: Item, x: number): number => columnOf(f, x);

/** A kanban's header part under the pointer, as the renderer lights it (`kb:<id>:stage:<i>`, `…:add`). */
export function kanbanHot(items: Item[], w: Point): string | null {
  const h = labOn('kanban') ? headerAt(items, w) : null;
  return !h || h.part === 'head' ? null : `kb:${h.f.id}:${h.part === 'add' ? 'add' : `stage:${h.part.stage}`}`;
}

/** The colours a stage can be, in the order new ones take them. */
export const STAGE_COLORS = ['gray', 'blue', 'green', 'yellow', 'orange', 'pink', 'purple', 'graphite'];

/** One more stage on its right, in the next colour none has yet. */
export function addStage(board: Board, f: Item): void {
  const kb = f.kb ?? [], c = STAGE_COLORS.find((k) => !kb.some((s) => s.c === k)) ?? STAGE_COLORS[kb.length % STAGE_COLORS.length];
  // (Wider by a column as wide as the others.)
  board.update(f.id, { kb: [...kb, { n: 'Новая стадия', c }], w: Math.round(f.w + kanbanCol(f) + COL_GAP) });
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
  const by = cardsByColumn(board, f), step = (kanbanCol(f) + COL_GAP) * dir;
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
    const col = kanbanCol(f) + COL_GAP;
    by.slice(i + 1).flat().forEach((c) => board.update(c.id, { x: c.x - col }));
    // (Narrower by that column, the others as wide as they were.)
    board.update(f.id, { kb: kb.filter((_, k) => k !== i), w: Math.round(f.w - col), members: (f.members ?? []).filter((id) => !by[i].some((c) => c.id === id)) });
  });
  tidyKanbans(board);
}

/** Where a stage's pill stands, on the board (for its menu to open under). */
export const stageAt = (f: Item, i: number) => ({ x: columns(f)[i]?.x ?? f.x, y: f.y + PILL_Y + PILL_H / 2 });

interface Look { surface: string; bg: string; line: string; ink: string; muted: string }

/** Draws it: the card, each stage's pill (its colour, its name) and how many are in it, a column under
 *  each (the cells), and the «+». */
export function drawKanban(ctx: CanvasRenderingContext2D, f: Item, get: (id: string) => Item | undefined, look: Look, hot: string | null = null,
  lit: (col: number) => number = () => 0): void {
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
  // The column a card's dragged over: a light grey (a third of the board's grey), coming and going; a little
  // wider than its cards, under its stage too.
  cols.forEach((c, i) => {
    const k = lit(i);
    if (k <= 0) return;
    ctx.beginPath();
    ctx.roundRect(c.x - COL_GAP / 2, f.y + 8, c.w + COL_GAP, f.h - 16, 10);
    ctx.globalAlpha = k / 3;
    ctx.fillStyle = look.bg;
    ctx.fill();
    ctx.globalAlpha = 1;
  });
  for (const id of f.members ?? []) { const it = get(id); if (it && snaps(it)) counts[columnOf(f, it.x + it.w / 2)]++; }
  // The line under the stages, across it.
  ctx.beginPath();
  ctx.moveTo(f.x + LEFT, f.y + HEAD);
  ctx.lineTo(f.x + f.w - PAD, f.y + HEAD);
  ctx.strokeStyle = look.line;
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.textBaseline = 'middle';
  (f.kb ?? []).forEach((s, i) => {
    // (The columns aren't drawn: all on the white, the stages over them show where they are.)
    const c = cols[i];
    // The stage: its pill, round at its ends, in its pastel colour, then how many.
    const pw = pillW(s.n), py = f.y + PILL_Y;
    ctx.beginPath();
    ctx.roundRect(c.x, py - PILL_H / 2, pw, PILL_H, PILL_H / 2);
    ctx.fillStyle = STAGE_TINTS[s.c] ?? STAGE_TINTS.gray;
    ctx.fill();
    // (Under the pointer, a shade darker: it's taken by it.)
    if (hot === `stage:${i}`) { ctx.fillStyle = 'rgba(0, 0, 0, .06)'; ctx.fill(); }
    ctx.font = font(PILL_FS, 500);
    ctx.fillStyle = '#1C1F26';
    ctx.textAlign = 'left';
    ctx.fillText(s.n, c.x + PILL_PAD, py);
    ctx.font = font(PILL_FS, 400);
    ctx.fillStyle = look.muted;
    ctx.fillText(String(counts[i]), c.x + pw + 12, py);
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
