import type { Editor } from '../editor/editor';
import type { Item } from '../model/types';
import type { Point } from '../canvas/geometry';
import { descendants, mindWay, upright, type Way } from '../model/mind';

/**
 * "Авторасположение" on a mind map node (src/labs): pressed, the node's branches are laid out and handles
 * as the grid's come up, while the node stays picked (no "+" buttons meanwhile). Between each level and the
 * next (between columns) a handle for the gap out from one to the other: the first one's (from the node to
 * its branches) for all of them, every other one's for its own. On each level (between its rows) a handle
 * for the gaps along it: the first level's for all levels, every other one's for its own. Each stretches the
 * gaps as they came out, in proportion, not evened out. Picked again later, it's an ordinary node; pressed
 * again with nothing moved by hand, it's all back as it was, stretches and handles.
 */
interface MindTidy { id: string; base: Map<string, Point>; kx: number[]; ky: number[]; at: Map<string, Point>; on: boolean; warned?: boolean }
let mt: MindTidy | null = null;

/** A handle: across the gaps out to level `level` (out) or along it; `sign` -1 where dragging left (up) widens it. */
export type MindGap = { axis: 'col' | 'row'; gap: number; level: number; out: boolean; sign: number };
const key = (h: { level: number; out: boolean }) => `${h.out ? 'o' : 'a'}${h.level}`;
let hot: string | null = null;
export const setHotMindGap = (h: MindGap | null) => { hot = h ? key(h) : null; };

const subtree = (ed: Editor, id: string): Item[] => descendants([id], ed.board.list()).map((d) => ed.board.get(d)).filter((i): i is Item => !!i);

/** Taken up after the node's branches are laid out afresh. */
export function startMindTidy(ed: Editor, id: string): void {
  const base = relative(ed, id);
  mt = base.size ? { id, base, kx: [], ky: [], at: new Map(base), on: true } : null;
}

/** Laid out afresh after something in it was moved by hand: the handles' stretches of the last time
 *  taken up again, so it comes out as near as it can to how it was (what was moved jumps back). */
export function restartMindTidy(ed: Editor, id: string): void {
  const was = mt?.id === id ? mt : null;
  startMindTidy(ed, id);
  if (!was || !mt) return;
  mt.kx = was.kx;
  mt.ky = was.ky;
  apply(ed);
}

/** Where everything growing from node `id` stands from its corner (so the node moved, with all of it
 *  going along, changes nothing). */
function relative(ed: Editor, id: string): Map<string, Point> {
  const n = ed.board.get(id);
  return new Map(n ? subtree(ed, id).map((i) => [i.id, { x: i.x - n.x, y: i.y - n.y }]) : []);
}

/** Whether node `id`'s branches stand as last laid out here (nothing in them moved by hand, none added
 *  or taken away since): pressed again, "Авторасположение" leaves them so, its handles back. */
export function mindTidyKept(ed: Editor, id: string): boolean {
  if (mt?.id !== id) return false;
  const now = relative(ed, id);
  if (now.size !== mt.at.size) return false;
  return [...now].every(([k, i]) => { const p = mt!.at.get(k); return !!p && Math.abs(i.x - p.x) <= 1 && Math.abs(i.y - p.y) <= 1; });
}

/** Items dragged by hand: one of a laid out mind map's branches among them, a note at the bottom says
 *  its layout will start afresh, with a button undoing the move (the layout kept then). Once only, till
 *  it's undone. */
export function noteMindMoved(ed: Editor, ids: string[]): void {
  if (!mt || mt.warned || !ids.some((id) => mt!.at.has(id))) return;
  mt.warned = true;
  const was = mt;
  window.dispatchEvent(new CustomEvent('planx:toast', { detail: {
    text: 'Вы подвинули элемент: авторасположение выключено', bottom: true,
    action: 'Отменить', run: () => { ed.undo(); if (mt === was) mt.warned = false; },
  } }));
}

/** Pressed again untouched: its handles back. */
export function resumeMindTidy(): void { if (mt) mt.on = true; }

/** Whether its handles are there: on since pressed, the node picked alone all the while, nothing in it
 *  moved. Once it isn't, it's off till pressed again. */
export function holds(ed: Editor): boolean {
  if (!mt?.on) return false;
  if (ed.selection.size === 1 && ed.selection.has(mt.id) && mindTidyKept(ed, mt.id)) return true;
  mt.on = false;
  return false;
}

/** The node's way out (that of its branches), and its branches' levels below it, each in order along it. */
function levels(ed: Editor): { way: Way; rows: Item[][] } | null {
  const n = mt && ed.board.get(mt.id);
  if (!n) return null;
  const all = ed.board.list(), first = all.find((k) => k.type === 'mind' && k.parent === n.id);
  if (!first) return null;
  const way = mindWay(first, n), along = upright(way) ? 'x' : 'y';
  const rows: Item[][] = [];
  for (let level = [n]; ;) {
    const ids = new Set(level.map((k) => k.id));
    level = all.filter((k) => k.type === 'mind' && k.parent && ids.has(k.parent) && (level[0] !== n || mindWay(k, n) === way));
    if (!level.length) break;
    rows.push(level.sort((p, q) => p[along] - q[along]));
  }
  return { way, rows };
}

/** How far the gaps of a level are stretched: the first handle's for all, times the level's own. */
const stretch = (k: number[], level: number) => (k[0] ?? 1) * (level ? k[level] ?? 1 : 1);

/** The places for the gaps stretched, from where they were laid out. */
function apply(ed: Editor): void {
  if (!mt) return;
  const n = ed.board.get(mt.id), lv = levels(ed);
  if (!n || !lv) return;
  const { way, rows } = lv, up = upright(way), along = up ? 'x' : 'y', size = up ? 'w' : 'h', out = up ? 'y' : 'x', deep = up ? 'h' : 'w';
  const forth = way === 'right' || way === 'down';
  const base = (i: Item) => { const b = mt!.base.get(i.id); return b ? { ...i, x: n.x + b.x, y: n.y + b.y } : i; };
  const next = new Map<string, Point>();
  const placed = (i: Item) => ({ ...base(i), ...next.get(i.id) });
  rows.forEach((row, level) => {
    const ky = stretch(mt!.ky, level), kx = stretch(mt!.kx, level);
    const b = row.map(base).sort((p, q) => p[along] - q[along]);
    // Along: each gap to the one before times ky, the level centred where it was.
    const lo = b[0][along], hi = b[b.length - 1][along] + b[b.length - 1][size];
    const pos: number[] = [lo];
    for (let i = 1; i < b.length; i++) pos.push(pos[i - 1] + b[i - 1][size] + (b[i][along] - b[i - 1][along] - b[i - 1][size]) * ky);
    const shift = (lo + hi) / 2 - (pos[0] + pos[b.length - 1] + b[b.length - 1][size]) / 2;
    b.forEach((k, i) => {
      // Out: its gap from its parent times kx, from where its parent is now.
      const p = placed(ed.board.get(k.parent!)!), bp = base(ed.board.get(k.parent!)!);
      const gap = forth ? k[out] - (bp[out] + bp[deep]) : bp[out] - (k[out] + k[deep]);
      const o = forth ? p[out] + p[deep] + gap * kx : p[out] - gap * kx - k[deep];
      next.set(k.id, { [along]: Math.round(pos[i] + shift), [out]: Math.round(o) } as unknown as Point);
    });
  });
  ed.board.transact(() => next.forEach((pt, id) => ed.board.update(id, pt)));
  mt.at = relative(ed, mt.id);
}

type Line = { axis: 'col' | 'row'; at: number; from: number; to: number; gap: number; level: number; out: boolean };

/** The handles' lines (board units): across the gap out to each level (from the node, or the level
 *  before), over that level's first quarter; and across the widest gap along each level with one. */
function lines(ed: Editor): Line[] {
  const n = mt && ed.board.get(mt.id), lv = n && levels(ed);
  if (!n || !lv) return [];
  const { way, rows } = lv, up = upright(way), along = up ? 'x' : 'y', size = up ? 'w' : 'h', out = up ? 'y' : 'x', deep = up ? 'h' : 'w';
  const forth = way === 'right' || way === 'down', res: Line[] = [];
  rows.forEach((row, level) => {
    // Out to it: from the furthest edge of the level before (the node, for the first) to its nearest.
    const before = level ? rows[level - 1] : [n];
    const edge = forth ? Math.max(...before.map((k) => k[out] + k[deep])) : Math.min(...before.map((k) => k[out]));
    const near = forth ? Math.min(...row.map((k) => k[out])) : Math.max(...row.map((k) => k[out] + k[deep]));
    const lo = Math.min(...row.map((k) => k[along])), hi = Math.max(...row.map((k) => k[along] + k[size]));
    res.push({ axis: up ? 'row' : 'col', at: (edge + near) / 2, from: lo, to: lo + Math.max(24, (hi - lo) / 4), gap: Math.abs(near - edge), level, out: true });
    // Along it: its widest gap.
    if (row.length < 2) return;
    let best = 1;
    const gapAt = (i: number) => row[i][along] - row[i - 1][along] - row[i - 1][size];
    for (let i = 2; i < row.length; i++) if (gapAt(i) > gapAt(best)) best = i;
    const a = row[best - 1], b = row[best], g = gapAt(best);
    res.push({ axis: up ? 'col' : 'row', at: a[along] + a[size] + g / 2, from: Math.min(a[out], b[out]), to: Math.max(a[out] + a[deep], b[out] + b[deep]), gap: g, level, out: false });
  });
  return res;
}

/** Which handle's line is under the screen point. */
export function mindGapAt(ed: Editor, sp: Point): MindGap | null {
  if (!holds(ed)) return null;
  const w = ed.toWorld(sp.x, sp.y), near = 6 / ed.cam.z, lv = levels(ed)!;
  for (const g of lines(ed)) {
    const across = g.axis === 'col' ? w.x : w.y, alongP = g.axis === 'col' ? w.y : w.x;
    if (Math.abs(across - g.at) <= near && alongP >= g.from && alongP <= g.to) {
      // Out to the left (or up), the gap grows dragged that way.
      return { axis: g.axis, gap: g.gap, level: g.level, out: g.out, sign: g.out && (lv.way === 'left' || lv.way === 'up') ? -1 : 1 };
    }
  }
  return null;
}

/** How far the handle's own stretch goes now (the first level's, for all; another's, for its own). */
export const mindStretch = (h: MindGap) => (!mt ? 1 : (h.out ? mt.kx : mt.ky)[h.level] ?? 1);

/** A handle dragged `d` (board units) from where its gap was `gap`, its own stretch `k0` then: the
 *  gaps it sets stretched so. */
export function dragMindGap(ed: Editor, h: MindGap, k0: number, d: number): void {
  if (!mt) return;
  (h.out ? mt.kx : mt.ky)[h.level] = k0 * Math.max(0.1, (h.gap + d * h.sign) / Math.max(1, h.gap));
  apply(ed);
}

/** The handles over the board, at screen scale, as the grid's are drawn. */
export function drawMindTidy(ctx: CanvasRenderingContext2D, ed: Editor): void {
  if (!holds(ed)) return;
  ctx.save();
  for (const g of lines(ed)) {
    const a = ed.toScreen(g.axis === 'col' ? { x: g.at, y: g.from } : { x: g.from, y: g.at });
    const b = ed.toScreen(g.axis === 'col' ? { x: g.at, y: g.to } : { x: g.to, y: g.at });
    const strong = hot === key(g);
    ctx.strokeStyle = '#E5484D';
    ctx.globalAlpha = strong ? 0.7 : 0.35;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
    const m = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, [pw, ph] = g.axis === 'col' ? [4, 16] : [16, 4];
    ctx.globalAlpha = 1;
    ctx.fillStyle = strong ? '#E5484D' : '#fff';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(m.x - pw / 2, m.y - ph / 2, pw, ph, 2);
    ctx.fill();
    ctx.stroke();
  }
  ctx.restore();
}
