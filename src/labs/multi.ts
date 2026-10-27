import type { Editor } from '../editor/editor';
import { DEFAULTS, HAS_FONT, type Item } from '../model/types';
import { boxOf, instanceBounds, type Point, type Rect } from '../canvas/geometry';
import { withScale } from '../model/table';
import { isLocked, labOn } from './labs';

/**
 * "Несколько сразу": two or more picked share the text panel (with what they have alike), and get one
 * handle at the corner of what they take up, which scales them all together, in proportion, from its
 * top left: where they are, how big, and their text with them.
 */

/** Text formatting kept per item: the panel shows each where all the picked have it alike. */
const FORMAT = ['fs', 'fw', 'ff', 'fi', 'fu', 'fx', 'tc', 'mk', 'ta', 'va', 'ls'] as const;

/** Items the text panel takes as one. */
export const TEXTUAL: Item['type'][] = ['text', 'sticky', 'task', 'table'];

/** One item standing for all the picked in the text panel: the first, with what they don't share
 *  left unset, as big as all of them; null unless the feature is on and they all have text. */
export function asOne(items: Item[]): Item | null {
  if (items.length < 2 || !labOn('multi') || !items.every((i) => TEXTUAL.includes(i.type))) return null;
  const one: Item = { ...items[0], id: items.map((i) => i.id).join(','), ...around(items) };
  for (const k of FORMAT) {
    const v = items[0][k];
    if (!items.every((i) => i[k] === v)) delete one[k];
  }
  // Different sizes: none (the panel shows a dash).
  const size = (i: Item) => i.fs ?? DEFAULTS[i.type].fs;
  if (!items.every((i) => size(i) === size(items[0]))) one.fs = 0;
  return one;
}

const shownBox = (ed: Editor, it: Item): Rect => (it.inst ? instanceBounds(it, ed.board.list()) : boxOf(it));
const around = (rs: Rect[]): Rect => {
  const x = Math.min(...rs.map((r) => r.x)), y = Math.min(...rs.map((r) => r.y));
  return { x, y, w: Math.max(...rs.map((r) => r.x + r.w)) - x, h: Math.max(...rs.map((r) => r.y + r.h)) - y };
};

/** What the group handle scales: the picked (but what's in instances, which goes with them), unless
 *  fewer than two, something's locked, or one is being typed in. */
function group(ed: Editor): Item[] | null {
  if (!labOn('multi') || ed.selection.size < 2 || ed.editingId) return null;
  const items = ed.selectedItems().filter((i) => !i.host);
  return items.length >= 2 && !items.some(isLocked) ? items : null;
}

/** The box round the picked, as they're seen. */
export function groupBox(ed: Editor): Rect | null {
  const items = group(ed);
  return items ? around(items.map((i) => shownBox(ed, i))) : null;
}

/** The handle at its lower right corner, on the screen. */
export function groupHandle(ed: Editor): Rect | null {
  const b = groupBox(ed);
  if (!b) return null;
  const p = ed.toScreen({ x: b.x + b.w, y: b.y + b.h }), s = 12;
  return { x: p.x + 3 - s / 2, y: p.y + 3 - s / 2, w: s, h: s };
}

/** Whether a screen point is on the handle (a little round it). */
export function onGroupHandle(ed: Editor, sp: Point): boolean {
  const h = groupHandle(ed);
  return !!h && sp.x >= h.x - 4 && sp.x <= h.x + h.w + 4 && sp.y >= h.y - 4 && sp.y <= h.y + h.h + 4;
}

/** A scaling under way: the box and everything it moves as it was at the start. */
let scaling: { box: Rect; start: Point; orig: Item[] } | null = null;
export const groupScaling = () => !!scaling;

export function startGroupScale(ed: Editor, w: Point): void {
  const items = group(ed), box = groupBox(ed);
  if (!items || !box) return;
  // What goes with them: what frames hold, mind map branches.
  const ids = [...ed.carried(items).keys()];
  scaling = { box, start: w, orig: ids.map((id) => ed.board.get(id)).filter((i): i is Item => !!i && !i.host) };
  ed.board.beginGesture();
  ed.setMoving(true);
}

/** The scale for the pointer at `w`: the corner follows it, in proportion (the larger way), at least
 *  a tenth. */
export const scaleFor = (box: Rect, start: Point, w: Point): number =>
  Math.max(0.1, Math.max((box.w + w.x - start.x) / box.w, (box.h + w.y - start.y) / box.h));

/** How an item changes, scaled by `k` from the point `o`: an instance only moves (its component sizes
 *  what's in it), a table's rows and columns with it, text's size along. */
export function scaled(it: Item, o: Point, k: number): Partial<Item> {
  const r = (v: number) => Math.round(v * 10) / 10;
  const p: Partial<Item> = { x: r(o.x + (it.x - o.x) * k), y: r(o.y + (it.y - o.y) * k) };
  if (it.inst) return p;
  const w = Math.max(4, r(it.w * k)), h = Math.max(4, r(it.h * k));
  Object.assign(p, it.type === 'table' ? withScale(it, w, h) : { w, h });
  if (HAS_FONT.includes(it.type)) {
    const fs = it.fs ?? DEFAULTS[it.type].fs;
    if (fs) p.fs = r(fs * k);
  }
  return p;
}

export function moveGroupScale(ed: Editor, w: Point): void {
  if (!scaling) return;
  const k = scaleFor(scaling.box, scaling.start, w), o = { x: scaling.box.x, y: scaling.box.y };
  ed.board.transact(() => scaling!.orig.forEach((it) => ed.board.update(it.id, scaled(it, o, k))));
}

export function endGroupScale(ed: Editor): void {
  if (!scaling) return;
  scaling = null;
  ed.board.endGesture();
  ed.setMoving(false);
}

/** The box round the picked and its handle, over the board. */
export function drawGroup(ctx: CanvasRenderingContext2D, ed: Editor): void {
  const b = groupBox(ed), h = groupHandle(ed);
  if (!b || !h) return;
  const a = ed.toScreen({ x: b.x, y: b.y }), c = ed.toScreen({ x: b.x + b.w, y: b.y + b.h });
  ctx.save();
  ctx.strokeStyle = '#4DA3FF';
  ctx.lineWidth = 1;
  ctx.setLineDash([4, 3]);
  ctx.strokeRect(Math.round(a.x - 3) + 0.5, Math.round(a.y - 3) + 0.5, Math.round(c.x - a.x + 6), Math.round(c.y - a.y + 6));
  ctx.setLineDash([]);
  ctx.fillStyle = '#fff';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(h.x, h.y, h.w, h.h, 3);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}
