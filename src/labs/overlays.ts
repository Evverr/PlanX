import type { Editor } from '../editor/editor';
import type { Item } from '../model/types';
import type { Point } from '../canvas/geometry';
import { boxOf } from '../canvas/geometry';
import { font } from '../canvas/text';
import { drawEmoji } from '../emoji/emoji';
import { drawIcon } from '../icons/icons';
import { labOn, myId } from './labs';
import { zoomFade, zoomFading, zoomSize } from './zoomFade';

/**
 * What the features on trial draw over the board, at screen scale: a lock on locked items, the
 * reactions under items, and the laser pointer's trails (yours and other people's).
 */

/** The reactions on offer, as emoji of the board's own set: like, heart, fire, clapping, star, question. */
export const REACTIONS = ['emoji-27', 'emoji-24', 'emoji-23', 'emoji-25', 'emoji-63', 'emoji-41'];

const dark = () => document.documentElement.dataset.theme === 'dark';

/** A small round badge with our padlock, at the item's top right corner. */
function drawLock(ctx: CanvasRenderingContext2D, ed: Editor, it: Item, fade: number, k: number) {
  const b = boxOf(it), p = ed.toScreen({ x: b.x + b.w, y: b.y });
  const x = Math.round(p.x) + 2, y = Math.round(p.y) - 2, r = 10;
  // k times its size, about its middle.
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(k, k);
  ctx.translate(-x, -y);
  ctx.globalAlpha = (ed.selection.has(it.id) ? 1 : 0.8) * fade;
  ctx.shadowColor = 'rgba(0, 0, 0, .18)';
  ctx.shadowBlur = 4;
  ctx.shadowOffsetY = 1;
  ctx.fillStyle = dark() ? '#2A2F38' : '#fff';
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowColor = 'transparent';
  // Our padlock (lock-l-solid: square, no keyhole), 16 across in the middle.
  drawIcon(ctx, 'lock-l-solid', x - 8, y - 8, 16, dark() ? '#D5D9E0' : '#5D6575');
  ctx.restore();
  ctx.globalAlpha = 1;
}

/** Where each reaction under an item was drawn last, on the canvas, to be clicked. */
export interface Pill { x: number; y: number; w: number; h: number; id: string; emoji: string }
let pills: Pill[] = [];

/** The reaction under a point on the canvas, if any. */
export const pillAt = (p: Point): Pill | undefined => pills.find((r) => p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h);

/** Under the item's lower left corner, a row of pills: an emoji and how many put it, on white 80% opaque
 *  (yours alike). */
function drawReactions(ctx: CanvasRenderingContext2D, ed: Editor, it: Item, k: number) {
  const b = boxOf(it), p = ed.toScreen({ x: b.x, y: b.y + b.h });
  if (b.w * ed.cam.z < 24) return;
  // k times their size, from the item's corner.
  const x0 = Math.round(p.x), y0 = Math.round(p.y);
  ctx.save();
  ctx.translate(x0, y0);
  ctx.scale(k, k);
  let x = 0;
  const y = 6, h = 24;
  ctx.font = font(12, 600);
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  for (const emoji of REACTIONS) {
    const who = it.rx?.[emoji];
    if (!who?.length) continue;
    const text = String(who.length), w = 8 + 16 + 5 + Math.ceil(ctx.measureText(text).width) + 9;
    ctx.shadowColor = 'rgba(0, 0, 0, .12)';
    ctx.shadowBlur = 3;
    ctx.shadowOffsetY = 1;
    ctx.fillStyle = dark() ? 'rgba(42, 47, 56, .8)' : 'rgba(255, 255, 255, .8)';
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, h / 2);
    ctx.fill();
    ctx.shadowColor = 'transparent';
    drawEmoji(ctx, emoji, x + 8, y + 4, 16);
    ctx.fillStyle = dark() ? '#D5D9E0' : '#454545';
    ctx.fillText(text, x + 8 + 16 + 5, y + h / 2 + 0.5);
    pills.push({ x: x0 + x * k, y: y0 + y * k, w: w * k, h: h * k, id: it.id, emoji });
    x += w + 4;
  }
  ctx.restore();
}

/** Puts this browser's reaction on the items, or takes it off if it's on all of them already. */
export function toggleReaction(ed: Editor, ids: string[], emoji: string): void {
  const me = myId(), items = ids.map((id) => ed.board.get(id)).filter((i): i is Item => !!i);
  const allMine = items.every((it) => it.rx?.[emoji]?.includes(me));
  ed.board.transact(() => {
    for (const it of items) {
      const rx = { ...(it.rx ?? {}) }, who = (rx[emoji] ?? []).filter((w) => w !== me);
      if (!allMine) who.push(me);
      if (who.length) rx[emoji] = who; else delete rx[emoji];
      ed.board.update(it.id, { rx: Object.keys(rx).length ? rx : undefined });
    }
  });
}

/* ---------- the laser pointer ---------- */

/** How long a laser trail takes to fade, in ms. */
export const LASER_FADE = 1000;
/** A trail: points on the board, each with when it was drawn (performance.now()). */
export interface TrailPoint { x: number; y: number; t: number }
export const laser = {
  mine: [] as TrailPoint[],
  /** Other people's, by their client id, with their colour. */
  theirs: new Map<number, { color: string; pts: TrailPoint[] }>(),
};

/** A trail as one tapering stroke: thick and bright at its head, thinning to nothing as it fades,
 *  with a glow round it and a white core. */
function drawTrail(ctx: CanvasRenderingContext2D, ed: Editor, pts: TrailPoint[], color: string, now: number): boolean {
  const live = pts.filter((p) => now - p.t < LASER_FADE);
  if (!live.length) return false;
  const sp = live.map((p) => ed.toScreen(p)), k = live.map((p) => 1 - (now - p.t) / LASER_FADE);
  const outline = (scale: number) => {
    const left: Point[] = [], right: Point[] = [];
    for (let i = 0; i < sp.length; i++) {
      const a = sp[Math.max(0, i - 1)], b = sp[Math.min(sp.length - 1, i + 1)];
      const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || 1, r = (1 + 4 * k[i]) * scale;
      left.push({ x: sp[i].x - (dy / d) * r, y: sp[i].y + (dx / d) * r });
      right.push({ x: sp[i].x + (dy / d) * r, y: sp[i].y - (dx / d) * r });
    }
    ctx.beginPath();
    [...left, ...right.reverse()].forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
    ctx.closePath();
    ctx.fill();
    // A round end at the head.
    const head = sp[sp.length - 1];
    ctx.beginPath();
    ctx.arc(head.x, head.y, (1 + 4 * k[k.length - 1]) * scale, 0, Math.PI * 2);
    ctx.fill();
  };
  ctx.globalAlpha = Math.min(1, k[k.length - 1] * 2);
  ctx.shadowColor = color;
  ctx.shadowBlur = 12;
  ctx.fillStyle = color;
  outline(1);
  ctx.shadowColor = 'transparent';
  ctx.fillStyle = 'rgba(255, 255, 255, .7)';
  outline(0.3);
  ctx.globalAlpha = 1;
  return true;
}

export const LASER_COLOR = '#FF3B30';

/** Everything above; returns whether anything's still fading (and wants another frame). */
export function drawLabs(ctx: CanvasRenderingContext2D, ed: Editor): boolean {
  pills = [];
  const lock = labOn('lock'), reactions = labOn('reactions');
  if (lock || reactions) {
    const view = ed.viewRect();
    for (const it of ed.shown()) {
      if (!it.lock && !it.rx) continue;
      const b = boxOf(it);
      if (b.x > view.x + view.w || b.y > view.y + view.h + 40 / ed.cam.z || b.x + b.w < view.x - 40 / ed.cam.z || b.y + b.h < view.y) continue;
      // (Picked or not: they aren't what's done to it.)
      const rx = reactions && it.rx ? zoomFade('reactions', ed.cam.z) : 0, lk = lock && it.lock ? zoomFade('lock', ed.cam.z) : 0;
      if (rx) { ctx.globalAlpha = rx; drawReactions(ctx, ed, it, zoomSize('reactions', ed.cam.z)); ctx.globalAlpha = 1; }
      if (lk) drawLock(ctx, ed, it, lk, zoomSize('lock', ed.cam.z));
    }
  }
  let moving = false;
  const now = performance.now();
  if (labOn('laser')) {
    for (const [id, t] of laser.theirs) {
      if (drawTrail(ctx, ed, t.pts, t.color, now)) moving = true;
      else laser.theirs.delete(id);
    }
    if (drawTrail(ctx, ed, laser.mine, LASER_COLOR, now)) moving = true;
    else laser.mine = [];
  }
  return moving || zoomFading();
}
