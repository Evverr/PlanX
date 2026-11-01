import type { Editor } from '../editor/editor';
import type { Item } from '../model/types';
import type { Point } from '../canvas/geometry';
import { descendants, mindWay, upright, type Way } from '../model/mind';

/**
 * "Авторасположение" on a mind map node (src/labs): once laid out, while the node is picked and nothing
 * in it has been moved, handles as the grid's: one stretches the gaps out from one level to the next
 * (between columns, all of them), and one on each level the gaps along it (between its rows), each as
 * they came out, in proportion, not evened out. Picked again untouched, they're back as they were.
 */
interface MindTidy { id: string; base: Map<string, Point>; kx: number; ky: number[]; at: Map<string, Point> }
let mt: MindTidy | null = null;
let hot: number | null = null;
export const setHotMindGap = (h: typeof hot) => { hot = h; };

const subtree = (ed: Editor, id: string): Item[] => descendants([id], ed.board.list()).map((d) => ed.board.get(d)).filter((i): i is Item => !!i);

/** Taken up after the node's branches are laid out afresh. */
export function startMindTidy(ed: Editor, id: string): void {
  const base = new Map(subtree(ed, id).map((i) => [i.id, { x: i.x, y: i.y }]));
  mt = base.size ? { id, base, kx: 1, ky: [], at: new Map(base) } : null;
}

/** Whether node `id`'s branches stand as last laid out here (nothing in them moved by hand, none added
 *  or taken away since): pressed again, "Авторасположение" leaves them so. */
export function mindTidyKept(ed: Editor, id: string): boolean {
  if (mt?.id !== id) return false;
  const now = subtree(ed, id);
  if (now.length !== mt.at.size) return false;
  return now.every((i) => { const p = mt!.at.get(i.id); return !!p && Math.abs(i.x - p.x) <= 1 && Math.abs(i.y - p.y) <= 1; });
}

/** Whether its handles are there: the node picked alone, and nothing in it moved since. */
export function holds(ed: Editor): boolean {
  return !!mt && ed.selection.size === 1 && ed.selection.has(mt.id) && mindTidyKept(ed, mt.id);
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

/** The places for gaps stretched kx out and ky along, from where they were laid out. */
function apply(ed: Editor): void {
  if (!mt) return;
  const n = ed.board.get(mt.id), lv = levels(ed);
  if (!n || !lv) return;
  const { way, rows } = lv, up = upright(way), along = up ? 'x' : 'y', size = up ? 'w' : 'h', out = up ? 'y' : 'x', deep = up ? 'h' : 'w';
  const base = (i: Item) => ({ ...i, ...mt!.base.get(i.id) });
  const next = new Map<string, Point>();
  const placed = (i: Item) => ({ ...base(i), ...next.get(i.id) });
  rows.forEach((row, level) => {
    const ky = mt!.ky[level] ?? 1;
    const b = row.map(base).sort((p, q) => p[along] - q[along]);
    // Along: each gap to the one before times ky, the level centred where it was.
    const lo = b[0][along], hi = b[b.length - 1][along] + b[b.length - 1][size];
    const pos: number[] = [lo];
    for (let i = 1; i < b.length; i++) pos.push(pos[i - 1] + b[i - 1][size] + (b[i][along] - b[i - 1][along] - b[i - 1][size]) * ky);
    const shift = (lo + hi) / 2 - (pos[0] + pos[b.length - 1] + b[b.length - 1][size]) / 2;
    b.forEach((k, i) => {
      // Out: its gap from its parent times kx, from where its parent is now.
      const p = placed(ed.board.get(k.parent!)!), bp = base(ed.board.get(k.parent!)!);
      const gap = way === 'right' || way === 'down' ? k[out] - (bp[out] + bp[deep]) : bp[out] - (k[out] + k[deep]);
      const o = way === 'right' || way === 'down' ? p[out] + p[deep] + gap * mt!.kx : p[out] - gap * mt!.kx - k[deep];
      next.set(k.id, { [along]: Math.round(pos[i] + shift), [out]: Math.round(o) } as unknown as Point);
    });
  });
  ed.board.transact(() => next.forEach((pt, id) => ed.board.update(id, pt)));
  mt.at = new Map([...mt.base.keys()].map((id) => { const i = ed.board.get(id)!; return [id, { x: i.x, y: i.y }]; }));
}

type Line = { axis: 'col' | 'row'; at: number; from: number; to: number; gap: number; level: number };

/** The handles' lines (board units): across the widest gap along each level that has one (level 0 up),
 *  and across the gap out from the node to its branches (level -1). */
function lines(ed: Editor): Line[] {
  const n = mt && ed.board.get(mt.id), lv = n && levels(ed);
  if (!n || !lv) return [];
  const { way, rows } = lv, up = upright(way), along = up ? 'x' : 'y', size = up ? 'w' : 'h', out = up ? 'y' : 'x', deep = up ? 'h' : 'w';
  const res: Line[] = [];
  // Along: the widest gap of each level.
  rows.forEach((row, level) => {
    if (row.length < 2) return;
    let best = 1;
    for (let i = 1; i < row.length; i++) if (row[i][along] - row[i - 1][along] - row[i - 1][size] > row[best][along] - row[best - 1][along] - row[best - 1][size]) best = i;
    const a = row[best - 1], b = row[best], g = b[along] - a[along] - a[size];
    res.push({ axis: up ? 'col' : 'row', at: a[along] + a[size] + g / 2, from: Math.min(a[out], b[out]), to: Math.max(a[out] + a[deep], b[out] + b[deep]), gap: g, level });
  });
  // Out: from the node to its branches, over their first quarter.
  const kids = rows[0], s = way === 'right' || way === 'down';
  const edge = s ? n[out] + n[deep] : n[out], near = s ? Math.min(...kids.map((k) => k[out])) : Math.max(...kids.map((k) => k[out] + k[deep]));
  const lo = Math.min(...kids.map((k) => k[along])), hi = Math.max(...kids.map((k) => k[along] + k[size]));
  res.push({ axis: up ? 'row' : 'col', at: (edge + near) / 2, from: lo, to: lo + Math.max(24, (hi - lo) / 4), gap: Math.abs(near - edge), level: -1 });
  return res;
}

/** Which handle's line is under the screen point. */
export type MindGap = { axis: 'col' | 'row'; gap: number; level: number; sign: number };
export function mindGapAt(ed: Editor, sp: Point): MindGap | null {
  if (!holds(ed)) return null;
  const w = ed.toWorld(sp.x, sp.y), near = 6 / ed.cam.z, lv = levels(ed)!;
  for (const g of lines(ed)) {
    const across = g.axis === 'col' ? w.x : w.y, alongP = g.axis === 'col' ? w.y : w.x;
    if (Math.abs(across - g.at) <= near && alongP >= g.from && alongP <= g.to) {
      // Out to the left (or up), the gap grows dragged that way.
      return { axis: g.axis, gap: g.gap, level: g.level, sign: g.level < 0 && (lv.way === 'left' || lv.way === 'up') ? -1 : 1 };
    }
  }
  return null;
}

/** A handle dragged `d` (board units) from where its gap was `gap`: the gaps that way stretched so. */
export function dragMindGap(ed: Editor, h: MindGap, k0: number, d: number): void {
  if (!mt) return;
  const k = k0 * Math.max(0.1, (h.gap + d * h.sign) / Math.max(1, h.gap));
  if (h.level < 0) mt.kx = k; else mt.ky[h.level] = k;
  apply(ed);
}
/** How far the gaps a handle sets are stretched now. */
export const mindStretch = (h: MindGap) => (!mt ? 1 : h.level < 0 ? mt.kx : mt.ky[h.level] ?? 1);

/** The handles over the board, at screen scale, as the grid's are drawn. */
export function drawMindTidy(ctx: CanvasRenderingContext2D, ed: Editor): void {
  if (!holds(ed)) return;
  ctx.save();
  for (const g of lines(ed)) {
    const a = ed.toScreen(g.axis === 'col' ? { x: g.at, y: g.from } : { x: g.from, y: g.at });
    const b = ed.toScreen(g.axis === 'col' ? { x: g.at, y: g.to } : { x: g.to, y: g.at });
    const strong = hot === g.level;
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
