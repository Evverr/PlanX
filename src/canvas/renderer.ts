import type { Item, Link, Side } from '../model/types';
import { alignOf, FILLS, ICON_COLORS, INK_COLORS, MARK_COLORS, TEXT_COLORS } from '../model/types';
import { drawIcon } from '../icons/icons';
import { drawEmoji } from '../emoji/emoji';
import { drawPicture } from './pictures';
import { cellRect, cellText, colsOf, rowsOf } from '../model/table';
import { audioProgress, clock } from './audio';
import type { Point, Rect } from './geometry';
import { audioButton, center, curveBetween, edgePoint, inkPoints, linkCurve, nearestSide, rectsIntersect, sidePoint, SIDES, TASK_BOX_R, TASK_INSET, taskBox, type Bezier } from './geometry';
import { font, fontOf, layoutText, withList, type FontStyle, type TextLayout } from './text';

export interface Camera { x: number; y: number; z: number }

export interface Theme {
  bg: string; link: string; ink: string; muted: string; line: string;
  accent: string; frame: string; surface: string; stickyInk: string; shapeStroke: string;
  /** Board background gradient stops and the RGB of the grid lines. */
  grad: [string, string, string]; grid: string;
  /** Multiplier for the colours of stickers, shape fills and coloured icons; below 1 dims them in the dark theme. */
  dim: number;
}

export function readTheme(): Theme {
  const cs = getComputedStyle(document.documentElement);
  const v = (n: string) => cs.getPropertyValue(n).trim();
  return {
    bg: v('--bg'), link: v('--link'), ink: v('--ink'), muted: v('--muted'), line: v('--line'),
    accent: v('--accent'), frame: v('--frame'), surface: v('--surface'),
    stickyInk: v('--sticky-ink'), shapeStroke: v('--shape-stroke'),
    grad: [v('--grad-1'), v('--grad-2'), v('--grad-3')], grid: v('--grid'),
    dim: parseFloat(v('--fill-dim')) || 1,
  };
}

export interface Peer {
  id: number;
  name: string;
  color: string;
  cursor: Point | null;
  selection: string[];
}

export interface Scene {
  items: Item[];
  links: Link[];
  get: (id: string) => Item | undefined;
  cam: Camera;
  theme: Theme;
  width: number;
  height: number;
  dpr: number;
  selection: Set<string>;
  editingId: string | null;
  marquee: Rect | null;
  linkPreview: { from: Item; fromSide: Side | null; to: Point; target: Item | null } | null;
  peers: Peer[];
  showHandle: boolean;
  /** The dot under the pointer, drawn larger. */
  hotDot: Side | null;
  /** The pen or highlighter line being drawn, in board units. */
  stroke: InkStroke | null;
  /** The table cell being edited, its text left to the overlay. */
  editingCell: number | null;
}

export interface InkStroke { pts: Point[]; color: string; width: number; hl: boolean }

/** Corner radius of everything with corners except stickers, in board units. */
const CORNER = 8;
const corner = (it: Item) => (it.type === 'rect' || it.type === 'frame' || it.type === 'task' ? CORNER : 0);
/** A ticked task's checkbox. */
const DONE_COLOR = '#15C674';

/** Size of the resize handle in screen pixels. */
export const HANDLE = 12;
/** Link dots around a single selected item: radius and distance from its side, in screen pixels. */
export const DOT_R = 6;
export const DOT_GAP = 16;
/** Selection outlines and handles, the link dots and selected links. */
const SELECT_COLOR = '#4DA3FF';

const layoutCache = new Map<string, TextLayout>();

function cachedLayout(ctx: CanvasRenderingContext2D, key: string, text: string, w: number, h: number, size: number, style: FontStyle) {
  let l = layoutCache.get(key);
  if (!l) {
    if (layoutCache.size > 3000) layoutCache.clear();
    l = layoutText(ctx, text, Math.max(1, w), h, size, style);
    layoutCache.set(key, l);
  }
  return l;
}

/** Forget measured text, e.g. after the web font finishes loading. */
export const clearTextCache = () => layoutCache.clear();

const askedFonts = new Set<string>();

/** Web fonts load on first use; the editor redraws once they arrive. */
function ensureFont(f: string) {
  if (askedFonts.has(f) || typeof document === 'undefined' || !document.fonts) return;
  askedFonts.add(f);
  if (!document.fonts.check(f)) void document.fonts.load(f);
}

/** An item's text with its font, colour, highlight, underline, strikethrough, alignment and list.
 *  `shrink` is for stickers and shapes: the text is centred vertically and shrinks to fit the box. */
function drawText(ctx: CanvasRenderingContext2D, it: Item, pad: number, color: string, shrink: boolean, s: Scene) {
  const text = withList(it.text ?? '', it.ls);
  if (!text) return;
  const size = it.fs ?? 16;
  if (size * s.cam.z < 2.5) return; // too small to read; skip the work
  const st = fontOf(it), align = alignOf(it);
  const w = it.w - pad * 2, h = shrink ? it.h - pad * 2 : Infinity;
  const l = cachedLayout(ctx, `${it.type}|${w}|${h}|${size}|${st.weight}|${st.family}|${st.italic}|${text}`, text, w, h, size, st);
  const f = font(l.size, st.weight, st.family, st.italic);
  ensureFont(f);
  ctx.font = f;
  ctx.textBaseline = 'middle';
  ctx.textAlign = align;
  const tc = it.tc && (it.tc.startsWith('#') ? it.tc : TEXT_COLORS[it.tc]);
  const ink = tc ? shade(tc, s.theme.dim) : color;
  const mark = it.mk && (it.mk.startsWith('#') ? it.mk : MARK_COLORS[it.mk]);
  const rule = Math.max(1, l.size / 14);
  const total = l.lines.length * l.lineHeight;
  const x = align === 'center' ? it.x + it.w / 2 : align === 'right' ? it.x + it.w - pad : it.x + pad;
  let y = shrink ? it.y + it.h / 2 - total / 2 : it.y + pad;
  for (const line of l.lines) {
    const mid = y + l.lineHeight / 2;
    if (line && (mark || it.fu || it.fx)) {
      const tw = ctx.measureText(line).width;
      const left = align === 'center' ? x - tw / 2 : align === 'right' ? x - tw : x;
      if (mark) {
        ctx.globalAlpha = 0.45;
        ctx.fillStyle = mark;
        ctx.fillRect(left - 2, y + l.lineHeight * 0.06, tw + 4, l.lineHeight * 0.88);
        ctx.globalAlpha = 1;
      }
      ctx.fillStyle = ink;
      if (it.fu) ctx.fillRect(left, mid + l.size * 0.42, tw, rule);
      if (it.fx) ctx.fillRect(left, mid + l.size * 0.04 - rule / 2, tw, rule);
    }
    ctx.fillStyle = ink;
    ctx.fillText(line, x, mid);
    y = mid + l.lineHeight / 2;
  }
}

const shadeCache = new Map<string, string>();

/** A '#rrggbb' or 'rgb(r,g,b)' colour with each channel multiplied by k: a darker colour, not a transparent one. */
function shade(color: string, k: number): string {
  if (k === 1) return color;
  const key = `${color}|${k}`;
  let out = shadeCache.get(key);
  if (!out) {
    const ch = color.startsWith('#')
      ? [1, 3, 5].map((i) => parseInt(color.slice(i, i + 2), 16))
      : (color.match(/\d+/g) ?? []).slice(0, 3).map(Number);
    out = `rgb(${ch.map((c) => Math.round(c * k)).join(',')})`;
    shadeCache.set(key, out);
  }
  return out;
}

/** Gradient ends for stickers: the Figma sticker's yellow, other colours fade halfway to white. */
const STICKY_GRADIENT: Record<string, [string, string]> = { yellow: ['#FFF8A8', '#FFFED3'] };

function stickyGradient(color: string): [string, string] {
  if (STICKY_GRADIENT[color]) return STICKY_GRADIENT[color];
  const hex = color.startsWith('#') ? color : FILLS[color] ?? FILLS.yellow;
  const n = parseInt(hex.slice(1), 16);
  const light = [16, 8, 0].map((sh) => Math.round(((n >> sh) & 255) * 0.5 + 255 * 0.5));
  return (STICKY_GRADIENT[color] = [hex, `rgb(${light.join(',')})`]);
}

/**
 * Sticker from the Figma mockup (drawn there at 108×108, scaled here to the item):
 * a diagonal gradient, a soft base shadow, and a separate blurred wedge under the
 * bottom edge, thicker to the right, so the bottom-right corner looks lifted.
 * `px` is device pixels per board unit; canvas shadows aren't scaled by the transform.
 */
function drawSticky(ctx: CanvasRenderingContext2D, it: Item, px: number, dim: number) {
  const k = it.w / 108, { x, y, w, h } = it;
  // Corner shadow: draw the wedge far off to the side and throw only its shadow back into place.
  const away = 100000;
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.13)';
  ctx.shadowBlur = 4 * k * px;
  ctx.shadowOffsetX = away * px;
  ctx.beginPath();
  ctx.moveTo(x + 106 * k - away, y + h - 1 * k);
  ctx.lineTo(x + 25 * k - away, y + h - 1 * k);
  ctx.lineTo(x + 104 * k - away, y + h + 3 * k);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  const [from, to] = stickyGradient(it.color ?? 'yellow');
  const g = ctx.createLinearGradient(x + w * 0.287, y + h * 0.102, x + w * 0.769, y + h * 1.296);
  g.addColorStop(0, shade(from, dim));
  g.addColorStop(0.412, shade(from, dim));
  g.addColorStop(1, shade(to, dim));
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.14)';
  ctx.shadowBlur = 3 * k * px;
  ctx.shadowOffsetY = 2 * k * px;
  ctx.fillStyle = g;
  ctx.fillRect(x, y, w, h);
  ctx.restore();
}

function drawItem(ctx: CanvasRenderingContext2D, it: Item, s: Scene) {
  const { theme, cam } = s;
  const editing = s.editingId === it.id;
  switch (it.type) {
    case 'sticky':
      drawSticky(ctx, it, cam.z * s.dpr, theme.dim);
      if (!editing) drawText(ctx, it, 14, theme.stickyInk, true, s);
      break;
    case 'rect':
    case 'ellipse': {
      const none = it.color === 'none';
      ctx.beginPath();
      if (it.type === 'rect') ctx.roundRect(it.x, it.y, it.w, it.h, Math.min(CORNER, it.w / 2, it.h / 2));
      else ctx.ellipse(it.x + it.w / 2, it.y + it.h / 2, it.w / 2, it.h / 2, 0, 0, Math.PI * 2);
      if (!none) { ctx.fillStyle = shade(it.color?.startsWith('#') ? it.color : FILLS[it.color ?? 'blue'] ?? FILLS.blue, theme.dim); ctx.fill(); }
      ctx.lineWidth = 2;
      ctx.strokeStyle = none ? theme.ink : theme.shapeStroke;
      ctx.stroke();
      const pad = it.type === 'ellipse' ? Math.min(it.w, it.h) * 0.15 + 6 : 10;
      if (!editing) drawText(ctx, it, pad, none ? theme.ink : theme.stickyInk, true, s);
      break;
    }
    case 'text':
      if (!editing) drawText(ctx, it, 0, theme.ink, false, s);
      break;
    case 'frame': {
      ctx.fillStyle = theme.frame;
      ctx.strokeStyle = theme.line;
      ctx.lineWidth = 1 / cam.z;
      ctx.beginPath();
      ctx.roundRect(it.x, it.y, it.w, it.h, CORNER);
      ctx.fill();
      ctx.stroke();
      if (!editing && it.text) {
        ctx.font = font(15, 600);
        ctx.fillStyle = theme.muted;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'bottom';
        ctx.fillText(it.text, it.x + 2, it.y - 8, it.w);
      }
      break;
    }
    case 'icon':
      drawIcon(ctx, it.icon ?? '', it.x, it.y, Math.min(it.w, it.h), ICON_COLORS[it.color ?? 'ink'] ? shade(ICON_COLORS[it.color ?? 'ink'], theme.dim) : theme.ink);
      break;
    case 'emoji':
      drawEmoji(ctx, it.emoji ?? '', it.x, it.y, Math.min(it.w, it.h));
      break;
    case 'image':
      drawPicture(ctx, it, theme.line);
      break;
    case 'task':
      drawTask(ctx, it, s, editing);
      break;
    case 'table':
      drawTable(ctx, it, s, editing ? s.editingCell : null);
      break;
    case 'audio':
      drawAudio(ctx, it, s);
      break;
    case 'ink':
      strokeInk(ctx, { pts: inkPoints(it), color: it.color ?? 'ink', width: (it.sw ?? 2) * it.w / (it.iw || it.w), hl: !!it.hl }, theme);
      break;
  }
}

/** A card with a round checkbox and the task's text; ticked off, the box turns green with a tick
 *  and the text goes grey and struck through. */
function drawTask(ctx: CanvasRenderingContext2D, it: Item, s: Scene, editing: boolean) {
  const { theme, cam } = s;
  ctx.beginPath();
  ctx.roundRect(it.x, it.y, it.w, it.h, Math.min(CORNER, it.h / 2));
  ctx.fillStyle = theme.surface;
  ctx.fill();
  ctx.lineWidth = 1 / cam.z;
  ctx.strokeStyle = theme.line;
  ctx.stroke();
  const c = taskBox(it);
  ctx.beginPath();
  ctx.arc(c.x, c.y, TASK_BOX_R, 0, Math.PI * 2);
  if (it.done) {
    ctx.fillStyle = DONE_COLOR;
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(c.x - 4.5, c.y + 0.2);
    ctx.lineTo(c.x - 1.3, c.y + 3.4);
    ctx.lineTo(c.x + 4.8, c.y - 3);
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke();
  } else {
    ctx.strokeStyle = theme.muted;
    ctx.lineWidth = 1.6;
    ctx.stroke();
  }
  if (!editing) drawText(ctx, { ...it, x: it.x + TASK_INSET, w: it.w - TASK_INSET, fx: it.fx || it.done, tc: it.done ? undefined : it.tc }, 8, it.done ? theme.muted : theme.ink, true, s);
}

/** Blue of the audio note's play button and of the played part of its waveform. */
const PLAY_COLOR = '#0080FF';

/** A card with a play button, the recording's waveform (blue as far as it has played) and its length. */
function drawAudio(ctx: CanvasRenderingContext2D, it: Item, s: Scene) {
  const { theme, cam } = s, k = it.h / 64;
  ctx.beginPath();
  ctx.roundRect(it.x, it.y, it.w, it.h, Math.min(it.h / 2, CORNER * 2 * k));
  ctx.fillStyle = theme.surface;
  ctx.fill();
  ctx.lineWidth = 1 / cam.z;
  ctx.strokeStyle = theme.line;
  ctx.stroke();
  const b = audioButton(it), played = audioProgress(it.id, it.dur ?? 0);
  ctx.beginPath();
  ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
  ctx.fillStyle = PLAY_COLOR;
  ctx.fill();
  ctx.fillStyle = '#fff';
  if (played !== null) {
    ctx.fillRect(b.x - 6 * k, b.y - 7 * k, 4 * k, 14 * k);
    ctx.fillRect(b.x + 2 * k, b.y - 7 * k, 4 * k, 14 * k);
  } else {
    ctx.beginPath();
    ctx.moveTo(b.x - 5 * k, b.y - 8 * k);
    ctx.lineTo(b.x + 8 * k, b.y);
    ctx.lineTo(b.x - 5 * k, b.y + 8 * k);
    ctx.closePath();
    ctx.fill();
  }
  // Waveform between the button and the time.
  const peaks = it.peaks?.length ? it.peaks : Array(48).fill(0.3);
  const left = it.x + 64 * k, right = it.x + it.w - 52 * k, step = (right - left) / peaks.length;
  peaks.forEach((p, i) => {
    const h = Math.max(3 * k, p * it.h * 0.5);
    ctx.fillStyle = played !== null && i / peaks.length < played ? PLAY_COLOR : theme.muted;
    ctx.globalAlpha = played !== null && i / peaks.length < played ? 1 : 0.45;
    ctx.beginPath();
    ctx.roundRect(left + i * step + step * 0.2, b.y - h / 2, step * 0.6, h, step * 0.3);
    ctx.fill();
  });
  ctx.globalAlpha = 1;
  ctx.font = font(13 * k, 500);
  ctx.fillStyle = theme.muted;
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  ctx.fillText(clock(played !== null ? played * (it.dur ?? 0) : it.dur ?? 0), it.x + it.w - 14 * k, b.y);
}

/** A grid on the panel colour with each cell's text; the cell being edited is left to the overlay. */
function drawTable(ctx: CanvasRenderingContext2D, it: Item, s: Scene, editingCell: number | null) {
  const { theme, cam } = s;
  ctx.fillStyle = theme.surface;
  ctx.fillRect(it.x, it.y, it.w, it.h);
  ctx.strokeStyle = theme.line;
  ctx.lineWidth = 1 / cam.z;
  ctx.beginPath();
  let x = it.x, y = it.y;
  for (const w of colsOf(it).slice(0, -1)) { x += w; ctx.moveTo(x, it.y); ctx.lineTo(x, it.y + it.h); }
  for (const h of rowsOf(it).slice(0, -1)) { y += h; ctx.moveTo(it.x, y); ctx.lineTo(it.x + it.w, y); }
  ctx.rect(it.x, it.y, it.w, it.h);
  ctx.stroke();
  const n = colsOf(it).length * rowsOf(it).length;
  for (let i = 0; i < n; i++) {
    const text = cellText(it, i);
    if (text && i !== editingCell) drawText(ctx, { ...it, ...cellRect(it, i), text, ls: undefined }, 8, theme.ink, true, s);
  }
}

/** A pen or highlighter line, smoothed by curving through the midpoints between its points. */
function strokeInk(ctx: CanvasRenderingContext2D, { pts, color, width, hl }: InkStroke, theme: Theme) {
  if (!pts.length) return;
  const c = color.startsWith('#') ? color : INK_COLORS[color];
  ctx.save();
  ctx.globalAlpha = hl ? 0.45 : 1;
  ctx.strokeStyle = c ? shade(c, theme.dim) : theme.ink;
  ctx.lineWidth = width;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length - 1; i++) {
    ctx.quadraticCurveTo(pts[i].x, pts[i].y, (pts[i].x + pts[i + 1].x) / 2, (pts[i].y + pts[i + 1].y) / 2);
  }
  const last = pts[pts.length - 1];
  ctx.lineTo(last.x, last.y);
  ctx.stroke();
  ctx.restore();
}

/** Link line width on screen, whatever the zoom; thinner once zoomed far out. */
const linkWidth = (z: number) => (z < 0.3 ? 1 : 1.7);

/** Line width and dashes are in screen pixels, so links look the same at any zoom. */
function arrow(ctx: CanvasRenderingContext2D, [a, c1, c2, b]: Bezier, color: string, z: number, dash: number[] = []) {
  // The head follows the curve's last tangent; straight links have no control points, so fall back along the line.
  const from = c2.x !== b.x || c2.y !== b.y ? c2 : c1.x !== b.x || c1.y !== b.y ? c1 : a;
  const ang = Math.atan2(b.y - from.y, b.x - from.x);
  // Open chevron like the undo icon's: two round-capped arms at 45°. Pull the tip back by
  // half the line width so the rounded cap just touches the target.
  const px = linkWidth(z), width = px / z;
  const arm = px * 3.8 / z, sx = Math.cos(ang) * width / 2, sy = Math.sin(ang) * width / 2;
  const tip = { x: b.x - sx, y: b.y - sy };
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.setLineDash(dash.map((d) => d / z));
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.bezierCurveTo(c1.x, c1.y, c2.x - sx, c2.y - sy, tip.x, tip.y);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.beginPath();
  ctx.moveTo(tip.x - arm * Math.cos(ang - Math.PI / 4), tip.y - arm * Math.sin(ang - Math.PI / 4));
  ctx.lineTo(tip.x, tip.y);
  ctx.lineTo(tip.x - arm * Math.cos(ang + Math.PI / 4), tip.y - arm * Math.sin(ang + Math.PI / 4));
  ctx.stroke();
}

function outline(ctx: CanvasRenderingContext2D, it: Item, z: number, color: string, dash: number[] = []) {
  const off = 3 / z;
  ctx.strokeStyle = color;
  ctx.lineWidth = 2 / z;
  ctx.setLineDash(dash.map((d) => d / z));
  // Follows the item's corners, pushed out by the same gap.
  const r = corner(it);
  ctx.beginPath();
  ctx.roundRect(it.x - off, it.y - off, it.w + off * 2, it.h + off * 2, r ? r + off : 0);
  ctx.stroke();
  ctx.setLineDash([]);
}

/**
 * Board background from the Figma "Table" frame: a 140° gradient pinned to the screen,
 * and a line grid on the board (from "Ato / Pattern lines": a line every 18.5 units,
 * every fourth one darker), coarser as you zoom out so it never turns into noise.
 */
function drawBackground(ctx: CanvasRenderingContext2D, s: Scene) {
  const { cam, theme, width: W, height: H } = s;
  // Same geometry as CSS linear-gradient(140deg, ...): the line runs through the centre and spans the corners.
  const ang = 139.9 * Math.PI / 180, dx = Math.sin(ang), dy = -Math.cos(ang);
  const half = (Math.abs(W * dx) + Math.abs(H * dy)) / 2;
  const g = ctx.createLinearGradient(W / 2 - dx * half, H / 2 - dy * half, W / 2 + dx * half, H / 2 + dy * half);
  g.addColorStop(0.114, theme.grad[0]);
  g.addColorStop(0.707, theme.grad[1]);
  g.addColorStop(0.995, theme.grad[2]);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  let step = 18.5;
  while (step * cam.z < 9) step *= 4;
  const big = step * 4, px = step * cam.z;
  const firstX = Math.floor(-cam.x / cam.z / step), firstY = Math.floor(-cam.y / cam.z / step);
  for (const major of [false, true]) {
    ctx.fillStyle = `rgba(${theme.grid}, ${major ? 0.032 : 0.016})`;
    for (let i = firstX; i * px + cam.x < W; i++) {
      const isMajor = Math.abs(Math.round(i * step / big) * big - i * step) < 1e-6;
      if (isMajor === major) ctx.fillRect(Math.round(i * px + cam.x), 0, 1, H);
    }
    for (let j = firstY; j * px + cam.y < H; j++) {
      const isMajor = Math.abs(Math.round(j * step / big) * big - j * step) < 1e-6;
      if (isMajor === major) ctx.fillRect(0, Math.round(j * px + cam.y), W, 1);
    }
  }
}

let linkLayer: HTMLCanvasElement | null = null;

/**
 * Links go on their own layer so that where one crosses an item it can be faded to 15%:
 * the items' outlines are filled as one path (so overlaps don't fade twice) and cut out
 * at 85% strength. Frames are left out, otherwise every link inside one would fade.
 */
function drawLinks(ctx: CanvasRenderingContext2D, s: Scene, view: Rect) {
  const { cam, dpr, theme } = s;
  const W = ctx.canvas.width, H = ctx.canvas.height;
  if (!linkLayer) linkLayer = document.createElement('canvas');
  if (linkLayer.width !== W || linkLayer.height !== H) { linkLayer.width = W; linkLayer.height = H; }
  const lc = linkLayer.getContext('2d')!;
  lc.setTransform(1, 0, 0, 1, 0, 0);
  lc.globalCompositeOperation = 'source-over';
  lc.globalAlpha = 1;
  lc.clearRect(0, 0, W, H);
  lc.setTransform(dpr * cam.z, 0, 0, dpr * cam.z, dpr * cam.x, dpr * cam.y);
  for (const l of s.links) {
    const curve = linkCurve(l, s.get);
    if (curve) arrow(lc, curve, s.selection.has(l.id) ? SELECT_COLOR : theme.link, cam.z);
  }
  lc.globalCompositeOperation = 'destination-out';
  lc.globalAlpha = 0.85;
  lc.beginPath();
  for (const it of s.items) {
    if (it.type === 'frame' || it.type === 'ink' || !rectsIntersect(it, view)) continue;
    if (it.type === 'ellipse') {
      lc.moveTo(it.x + it.w, it.y + it.h / 2);
      lc.ellipse(it.x + it.w / 2, it.y + it.h / 2, it.w / 2, it.h / 2, 0, 0, Math.PI * 2);
    } else lc.roundRect(it.x, it.y, it.w, it.h, corner(it));
  }
  lc.fill();
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.drawImage(linkLayer, 0, 0);
  ctx.restore();
}

export function drawScene(ctx: CanvasRenderingContext2D, s: Scene): void {
  const { cam, theme, dpr } = s;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  drawBackground(ctx, s);

  ctx.setTransform(dpr * cam.z, 0, 0, dpr * cam.z, dpr * cam.x, dpr * cam.y);
  const view: Rect = { x: -cam.x / cam.z - 50, y: -cam.y / cam.z - 50, w: s.width / cam.z + 100, h: s.height / cam.z + 100 };

  for (const it of s.items) {
    const box = it.type === 'frame' ? { ...it, y: it.y - 40, h: it.h + 40 } : it;
    if (rectsIntersect(box, view)) drawItem(ctx, it, s);
  }

  if (s.links.length) drawLinks(ctx, s, view);
  if (s.stroke) strokeInk(ctx, s.stroke, theme);

  for (const p of s.peers) {
    for (const id of p.selection) {
      const it = s.get(id);
      if (it) outline(ctx, it, cam.z, p.color, [6, 4]);
    }
  }

  for (const id of s.selection) {
    const it = s.get(id);
    if (!it) continue;
    outline(ctx, it, cam.z, SELECT_COLOR);
    if (s.showHandle && s.editingId !== id) {
      const hs = HANDLE / cam.z, off = 3 / cam.z;
      ctx.fillStyle = theme.surface;
      ctx.strokeStyle = SELECT_COLOR;
      ctx.lineWidth = 2 / cam.z;
      ctx.beginPath();
      ctx.roundRect(it.x + it.w + off - hs / 2, it.y + it.h + off - hs / 2, hs, hs, 3 / cam.z);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = SELECT_COLOR;
      ctx.strokeStyle = '#fff';
      for (const side of SIDES) {
        const p = sidePoint(it, side, DOT_GAP / cam.z);
        ctx.beginPath();
        ctx.arc(p.x, p.y, (side === s.hotDot ? DOT_R + 2 : DOT_R) / cam.z, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
    }
  }

  if (s.linkPreview) {
    const { from, fromSide, to, target } = s.linkPreview;
    if (target) outline(ctx, target, cam.z, SELECT_COLOR, [4, 4]);
    let curve: Bezier;
    if (fromSide) {
      const toSide = target ? nearestSide(target, to) : null;
      curve = curveBetween(sidePoint(from, fromSide), fromSide, target && toSide ? sidePoint(target, toSide) : to, toSide);
    } else {
      const end = target ? edgePoint(target, center(from)) : to, start = edgePoint(from, end);
      curve = [start, start, end, end];
    }
    arrow(ctx, curve, SELECT_COLOR, cam.z, [6, 6]);
  }

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  if (s.marquee) {
    const m = s.marquee;
    const x = m.x * cam.z + cam.x, y = m.y * cam.z + cam.y;
    ctx.fillStyle = SELECT_COLOR + '22';
    ctx.strokeStyle = SELECT_COLOR;
    ctx.lineWidth = 1;
    ctx.fillRect(x, y, m.w * cam.z, m.h * cam.z);
    ctx.strokeRect(x + 0.5, y + 0.5, m.w * cam.z, m.h * cam.z);
  }

  // Other people's cursors, drawn at screen size.
  for (const p of s.peers) {
    if (!p.cursor) continue;
    const x = p.cursor.x * cam.z + cam.x, y = p.cursor.y * cam.z + cam.y;
    if (x < -20 || y < -20 || x > s.width + 20 || y > s.height + 20) continue;
    ctx.fillStyle = p.color;
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x, y + 17);
    ctx.lineTo(x + 4.5, y + 12.5);
    ctx.lineTo(x + 11.5, y + 12.5);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.font = font(12, 600);
    const tw = ctx.measureText(p.name).width;
    ctx.beginPath();
    ctx.roundRect(x + 10, y + 16, tw + 14, 20, 6);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(p.name, x + 17, y + 26.5);
  }
}
