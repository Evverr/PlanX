import type { Editor } from '../editor/editor';
import { uid, type Item, type Link } from '../model/types';
import { center, linkHandles, linkShape, nearestSide, type Point } from '../canvas/geometry';
import { linkWidth } from '../canvas/renderer';

/**
 * "Узел на линии": with a line picked, a text, sticker, shape or emoji dragged onto one of its middle
 * circles stands in the line's middle there and becomes a part of it: the line is two then, from its
 * start to it and from it to its end (each with its middle circle), stopping 3 short of it either side
 * (see linkShape), and moving it moves the line.
 */

/** What can be put into a line: those, and the game stickers (pictures). */
const JOINABLE = new Set(['text', 'sticky', 'rect', 'ellipse', 'polygon', 'emoji', 'icon']);
const joinable = (it: Item) => JOINABLE.has(it.type) || (it.type === 'image' && !!it.doodle);
/** How near a middle circle (on the screen) the dragged thing's middle takes it. */
const NEAR = 28;

/** The line picked as the press began, its middles waiting for something to be dragged onto them. */
let picked: string | null = null;
/** Where the drag ended up joining, worked out before the editor lets go, done after. */
let pending: { link: string; item: string; at: number; p: Point } | null = null;

/** A press: the line picked, if one is, alone. */
export function notePress(ed: Editor): void {
  const ids = [...ed.selection];
  picked = ids.length === 1 && ed.board.getLink(ids[0]) ? ids[0] : null;
}

/** Each middle circle of the line: where, and which stretch of it. */
function middles(ed: Editor, link: Link): Array<{ p: Point; at: number }> {
  const shape = linkShape(link, (id) => ed.board.get(id));
  return shape ? linkHandles(link, shape).middles : [];
}

/** What's being dragged, if it can go into the picked line (not one of its ends, nor in a line already). */
function dragged(ed: Editor): { link: Link; it: Item } | null {
  if (!picked || !ed.moving || ed.selection.size !== 1) return null;
  const link = ed.board.getLink(picked), it = ed.selectedItems()[0];
  if (!link || !it || !joinable(it) || it.joint || it.id === link.from || it.id === link.to) return null;
  return { link, it };
}

/** The middle the dragged thing is over. */
function over(ed: Editor, link: Link, it: Item): { p: Point; at: number } | null {
  const c = center(it), near = NEAR / ed.cam.z;
  return middles(ed, link).find((m) => Math.hypot(m.p.x - c.x, m.p.y - c.y) <= near) ?? null;
}

/** While dragging: the picked line in blue, as picked, and its middles as dashed circles (as thick as
 *  the line), the one under what's dragged bigger and filled. */
export function drawJoint(ctx: CanvasRenderingContext2D, ed: Editor): void {
  const d = dragged(ed);
  if (!d) return;
  const hit = over(ed, d.link, d.it), color = getComputedStyle(document.documentElement).getPropertyValue('--fmt-on-ink').trim() || '#0080FF';
  const width = linkWidth(ed.cam.z), pts = linkShape(d.link, (id) => ed.board.get(id))?.pts ?? [];
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  pts.forEach((q, i) => { const s = ed.toScreen(q); if (i) ctx.lineTo(s.x, s.y); else ctx.moveTo(s.x, s.y); });
  ctx.stroke();
  for (const m of middles(ed, d.link)) {
    const p = ed.toScreen(m.p), on = hit?.at === m.at;
    ctx.beginPath();
    ctx.arc(p.x, p.y, on ? 10 : 6, 0, Math.PI * 2);
    ctx.setLineDash([]);
    ctx.fillStyle = '#fff';
    ctx.fill();
    if (on) { ctx.globalAlpha = 0.2; ctx.fillStyle = color; ctx.fill(); ctx.globalAlpha = 1; }
    ctx.setLineDash([3, 3]);
    ctx.stroke();
  }
  ctx.restore();
}

/** Letting go (before the editor does): whether it'll join, and where. */
export function beforeUp(ed: Editor): void {
  const d = dragged(ed), hit = d && over(ed, d.link, d.it);
  pending = d && hit ? { link: d.link.id, item: d.it.id, at: hit.at, p: hit.p } : null;
  picked = null;
}

/** Let go (after the editor): it joins the line. */
export function afterUp(ed: Editor): void {
  if (!pending) return;
  const { link: id, item, at, p } = pending;
  pending = null;
  const link = ed.board.getLink(id), it = ed.board.get(item);
  if (link && it) joinLine(ed, link, it, at, p);
}

/** Something just made by a rail button dropped on the board, a line `linkId` picked as it was: put
 *  into the line if it was dropped on one of its middles. */
export function joinDropped(ed: Editor, linkId: string | null, it: Item | undefined): void {
  const link = linkId ? ed.board.getLink(linkId) : undefined;
  if (!link || !it || !joinable(it)) return;
  const hit = over(ed, link, it);
  if (hit) joinLine(ed, link, it, hit.at, hit.p);
}

/** Things put into lines going: each line through one is made one again, as it was (from the start of
 *  the one into it to the end of the one out of it, its nodes, sides and heads theirs). The links made,
 *  to be added once they're gone (the two halves go with them). */
export function rejoined(ed: Editor, gone: Set<string>): Link[] {
  const links = ed.board.linkList(), out: Link[] = [];
  for (const id of gone) {
    if (!ed.board.get(id)?.joint) continue;
    const into = links.filter((l) => l.to === id), from = links.filter((l) => l.from === id);
    if (into.length !== 1 || from.length !== 1) continue;
    const a = into[0], z = from[0];
    if (gone.has(a.from) || gone.has(z.to) || a.from === z.to) continue;
    const startHead = a.heads === 'start' || a.heads === 'both', endHead = z.heads === undefined || z.heads === 'both';
    const via = [...(a.via ?? []), ...(z.via ?? [])], sided = !!(a.fromSide && z.toSide);
    out.push({ id: uid(), from: a.from, to: z.to, style: a.style, color: a.color, lo: a.lo, dash: a.dash,
      ...(startHead ? { heads: endHead ? 'both' as const : 'start' as const } : endHead ? {} : { heads: 'none' as const }),
      ...(via.length && { via }), ...(sided && { fromSide: a.fromSide, toSide: z.toSide, fromAt: a.fromAt, toAt: z.toAt }) });
  }
  return out;
}

/** Puts `it` into the line at its middle `p` on stretch `at`: the line made two, through it. */
export function joinLine(ed: Editor, link: Link, it: Item, at: number, p: Point): void {
  const b = ed.board, x = p.x - it.w / 2, y = p.y - it.h / 2, mid = { ...it, x, y };
  const a = b.get(link.from), z = b.get(link.to);
  if (!a || !z) return;
  // Its nodes go with the stretches they're on (a right-angled one finds its own way afresh).
  const via = link.style === 'elbow' ? undefined : link.via, before = via?.slice(0, at), after = via?.slice(at);
  // The heads it had at its start and end, on the two.
  const h = link.heads, startHead = h === 'start' || h === 'both', endHead = h === undefined || h === 'both';
  const look = { style: link.style, color: link.color, lo: link.lo, dash: link.dash };
  // Pinned to its ends' sides, each meets the thing in the middle by the side facing the other end.
  const first: Link = { id: uid(), from: link.from, to: it.id, ...look, heads: startHead ? 'start' : 'none',
    ...(before?.length && { via: before }), ...(link.fromSide && { fromSide: link.fromSide, fromAt: link.fromAt, toSide: nearestSide(mid, before?.length ? before[before.length - 1] : center(a)) }) };
  const second: Link = { id: uid(), from: it.id, to: link.to, ...look, ...(endHead ? {} : { heads: 'none' as const }),
    ...(after?.length && { via: after }), ...(link.toSide && { fromSide: nearestSide(mid, after?.length ? after[0] : center(z)), toSide: link.toSide, toAt: link.toAt }) };
  b.transact(() => {
    b.update(it.id, { x, y, joint: true });
    b.remove([link.id]);
    b.addLink(first);
    b.addLink(second);
  });
  ed.requestRender();
}

