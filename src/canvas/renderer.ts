import './compat';
import type { Item, Link, Side } from '../model/types';
import { alignOf, FILLS, textPad, textPadY, ICON_COLORS, INK_COLORS, MARK_COLORS, STROKE_COLORS, TEXT_COLORS } from '../model/types';
import { drawIcon } from '../icons/icons';
import { drawEmoji } from '../emoji/emoji';
import { drawPicture } from './pictures';
import { cellItem, cellRect, cellText, colsOf, rowsOf, type TableLine } from '../model/table';
import { audioProgress, clock } from './audio';
import { branchColor, branchCurve, branchWays, buttonKey, foldBadge, foldedWays, levelColor, mindButtons, mindDepth, nodeColors, siblingTints, type Way } from '../model/mind';
import type { Point, Rect } from './geometry';
import type { Guide } from './guides';
import { FOLD_FS, FOLD_PAD, FOLD_TITLE_MAX, frameButtons } from '../model/frame';
import { COMPONENT_COLOR, instancePlus } from '../model/components';
import { autoInk } from '../model/color';
import { angleOf, audioButton, boxOf, center, curveBetween, edgePoint, inkPoints, polyPoints, linkShape, nearestSide, rectsIntersect, sidePoint, SIDES, TASK_INSET, taskBox, type Bezier, type LinkShape } from './geometry';
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
  /** The last press was a finger's: the resize handle is drawn bigger, to be seen under it. */
  byFinger: boolean;
  /** The dot under the pointer, drawn larger and at full strength; the others are faint. */
  hotDot: Side | null;
  /** The mind map node button under the pointer, drawn full size and strength; the others are smaller and faint. */
  hotPlus: string | null;
  /** How far the node buttons have faded in, 0…1: they come a moment after the node is picked. */
  plusFade: number;
  /** How many nodes each folded mind map node hides, each way, shown by it. */
  folded?: Map<string, Map<Way, number>>;
  /** The link under the pointer, faintly lit. */
  hotLink?: string | null;
  /** How far out from the "+" to the chevron's place each folded node's count is, 0…1, by `id:way`. */
  slide?: Map<string, number>;
  /** The node and way (`id:way`) a "+" has just given its first branches, with no chevron there yet. */
  chevronless?: string | null;
  /** A mind map branch being dragged by its arrow button to hang from another node. */
  mindMove: { from: Point; to: Point; target: Item | null } | null;
  /** Table lines drawn blue: the one under the pointer and those picked to drag together. */
  tableLines: TableLine[];
  /** The pen or highlighter line being drawn, in board units. */
  stroke: InkStroke | null;
  /** Cells picked in a table, outlined in blue. */
  pickedCells: { id: string; cells: number[] } | null;
  /** Alignment guides of what's being dragged, faint grey dashed lines. */
  guides: Guide[];
  /** The table cell being edited, its text left to the overlay. */
  editingCell: number | null;
  /** Left see-through where nothing is drawn (a picture saved without the board's background). */
  noBackground?: boolean;
}

export interface InkStroke { pts: Point[]; color: string; width: number; hl: boolean }

/** Corner radius of everything with corners except stickers, in board units. */
const CORNER = 8;
const corner = (it: Item) => (it.type === 'rect' || it.type === 'frame' || it.type === 'task' ? CORNER
  // A mind map node's: the central topic's rounder.
  : it.type === 'mind' ? Math.min(it.h / 2, it.parent ? 10 : 14) : 0);
/** A ticked task's checkbox. */
const DONE_COLOR = '#15C674';

/** Size of the resize handle in screen pixels. */
export const HANDLE = 12;
/** Link dots around a single selected item: radius and distance from its side, in screen pixels. */
export const DOT_R = 4.2;
export const DOT_GAP = 16;
/** The dots' strength, and how much bigger the one under the pointer is (at full strength). */
const DOT_FADE = 0.3, DOT_HOT = 1.5;
/** Selection outlines and handles, the link dots and selected links. */
const SELECT_COLOR = '#4DA3FF';

/** Runs `draw` with the board turned about the item's centre by the item's own turn, so the item
 *  can be drawn square. Paths added meanwhile keep the turn after it's undone. */
function turned(ctx: CanvasRenderingContext2D, it: Item, draw: () => void) {
  const a = angleOf(it);
  if (!a) { draw(); return; }
  const c = center(it);
  ctx.save();
  ctx.translate(c.x, c.y);
  ctx.rotate(a);
  ctx.translate(-c.x, -c.y);
  draw();
  ctx.restore();
}

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
function drawText(ctx: CanvasRenderingContext2D, it: Item, pad: number, color: string, shrink: boolean, s: Scene, padY = pad) {
  const text = withList(it.text ?? '', it.ls);
  if (!text) return;
  const size = it.fs ?? 16;
  if (size * s.cam.z < 2.5) return; // too small to read; skip the work
  const st = fontOf(it), align = alignOf(it);
  const w = it.w - pad * 2, h = shrink ? it.h - padY * 2 : Infinity;
  const l = cachedLayout(ctx, `${it.type}|${w}|${h}|${size}|${st.weight}|${st.family}|${st.italic}|${text}`, text, w, h, size, st);
  const f = font(l.size, st.weight, st.family, st.italic);
  ensureFont(f);
  ctx.font = f;
  // Each line sits in its line box as the browser sets it, so text typed over it in the overlay
  // lands on the same pixels: the font's ascent and descent centred in the line, on its baseline.
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = align;
  const fm = ctx.measureText('Hg'), ascent = fm.fontBoundingBoxAscent, descent = fm.fontBoundingBoxDescent;
  // Its own text colour; with none, white on a dark fill, else the usual.
  const tc = it.tc && (it.tc.startsWith('#') ? it.tc : TEXT_COLORS[it.tc]);
  const ink = tc ? shade(tc, s.theme.dim) : autoInk(it, tints) ?? color;
  const mark = it.mk && (it.mk.startsWith('#') ? it.mk : MARK_COLORS[it.mk]);
  const rule = Math.max(1, l.size / 14);
  const total = l.lines.length * l.lineHeight;
  const x = align === 'center' ? it.x + it.w / 2 : align === 'right' ? it.x + it.w - pad : it.x + pad;
  let y = shrink && it.va !== 'top' ? it.y + it.h / 2 - total / 2 : it.y + padY;
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
    ctx.fillText(line, x, y + (l.lineHeight - ascent - descent) / 2 + ascent);
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

/** A shape's outline colour, or null for none: grey by default, the text colour when it has no fill. */
function strokeOf(it: Item, theme: Theme): string | null {
  const sc = it.sc;
  if (sc === 'none') return null;
  if (!sc || sc === 'gray') return it.color === 'none' ? theme.ink : theme.shapeStroke;
  if (sc === 'ink') return theme.ink;
  return shade(sc.startsWith('#') ? sc : STROKE_COLORS[sc] || theme.shapeStroke, theme.dim);
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
  const k = it.w / 108, { x, y, w, h } = it, a = angleOf(it);
  // Corner shadow: draw the wedge far off to the side and throw only its shadow back into place
  // (shadow offsets are on the screen, so along the sticker's turn).
  const away = 100000;
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.13)';
  ctx.shadowBlur = 4 * k * px;
  ctx.shadowOffsetX = away * px * Math.cos(a);
  ctx.shadowOffsetY = away * px * Math.sin(a);
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
      ctx.globalAlpha = it.fo ?? 1;
      drawSticky(ctx, it, cam.z * s.dpr, theme.dim);
      ctx.globalAlpha = 1;
      if (!editing) drawText(ctx, it, 14, theme.stickyInk, true, s);
      break;
    case 'rect':
    case 'ellipse':
    case 'polygon': {
      const none = it.color === 'none';
      ctx.beginPath();
      if (it.type === 'rect') ctx.roundRect(it.x, it.y, it.w, it.h, Math.min(CORNER, it.w / 2, it.h / 2));
      else if (it.type === 'ellipse') ctx.ellipse(it.x + it.w / 2, it.y + it.h / 2, it.w / 2, it.h / 2, 0, 0, Math.PI * 2);
      else outlinePolygon(ctx, it);
      if (!none) {
        ctx.globalAlpha = it.fo ?? 1;
        ctx.fillStyle = shade(it.color?.startsWith('#') ? it.color : FILLS[it.color ?? 'blue'] ?? FILLS.blue, theme.dim);
        ctx.fill();
      }
      const line = strokeOf(it, theme);
      if (line) {
        ctx.globalAlpha = it.so ?? 1;
        ctx.lineWidth = 2;
        ctx.lineJoin = 'round';
        ctx.strokeStyle = line;
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      if (!editing) drawText(ctx, it, textPad(it), none ? theme.ink : theme.stickyInk, true, s);
      break;
    }
    case 'text':
      if (!editing) drawText(ctx, it, 0, theme.ink, false, s);
      break;
    case 'frame': {
      if (it.fold) { drawFolded(ctx, it, s, editing); break; }
      // A component in red tints, titled after a filled diamond; an instance of it shows no frame or
      // title until picked, then a dashed red edge and its title after a hollow diamond.
      if (it.inst && !s.selection.has(it.id)) break;
      const kin = it.comp || it.inst;
      if (it.inst) {
        ctx.strokeStyle = COMPONENT_COLOR;
        ctx.lineWidth = 1.5 / cam.z;
        ctx.setLineDash([6 / cam.z, 4 / cam.z]);
        ctx.beginPath();
        ctx.roundRect(it.x, it.y, it.w, it.h, CORNER);
        ctx.stroke();
        ctx.setLineDash([]);
      }
      if (!it.inst) {
        // A component is only its red edge, with nothing filled in.
        ctx.beginPath();
        ctx.roundRect(it.x, it.y, it.w, it.h, CORNER);
        if (!it.comp) { ctx.fillStyle = theme.frame; ctx.fill(); }
        if (it.comp) {
          ctx.globalAlpha = 0.75;
          ctx.strokeStyle = COMPONENT_COLOR;
          ctx.lineWidth = 1.5 / cam.z;
        } else {
          ctx.strokeStyle = theme.line;
          ctx.lineWidth = 1 / cam.z;
        }
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
      if (!editing && (it.text || kin)) {
        ctx.font = font(15, 600);
        ctx.fillStyle = kin ? COMPONENT_COLOR : theme.muted;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'bottom';
        ctx.fillText(kin ? `${it.comp ? '◆' : '◇'} ${it.text ?? ''}` : it.text!, it.x + 2, it.y - 8, it.w);
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
    case 'mind':
      drawMind(ctx, it, s, editing);
      break;
    case 'ink':
      strokeInk(ctx, { pts: inkPoints(it), color: it.color ?? 'ink', width: (it.sw ?? 2) * it.w / (it.iw || it.w), hl: !!it.hl }, theme);
      break;
  }
}

/** A card with a round checkbox and the task's text; ticked off, the box turns green with a tick
 *  and the text goes grey and struck through. */
function drawTask(ctx: CanvasRenderingContext2D, it: Item, s: Scene, editing: boolean) {
  const { theme, cam } = s, none = it.color === 'none';
  // The card is a rectangle like any other, fill and outline alike.
  ctx.beginPath();
  ctx.roundRect(it.x, it.y, it.w, it.h, Math.min(CORNER, it.w / 2, it.h / 2));
  if (!none) {
    ctx.globalAlpha = it.fo ?? 1;
    ctx.fillStyle = shade(it.color?.startsWith('#') ? it.color : FILLS[it.color ?? 'blue'] ?? FILLS.blue, theme.dim);
    ctx.fill();
  }
  const line = strokeOf(it, theme);
  if (line) {
    ctx.globalAlpha = it.so ?? 1;
    ctx.lineWidth = 2;
    ctx.strokeStyle = line;
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  // The box and its tick are drawn for a radius of 10 and scaled to the radius it has at this zoom.
  const c = taskBox(it, cam.z), k = c.r / 10;
  ctx.beginPath();
  ctx.arc(c.x, c.y, c.r, 0, Math.PI * 2);
  if (it.done) {
    ctx.fillStyle = DONE_COLOR;
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(c.x - 4.5 * k, c.y + 0.2 * k);
    ctx.lineTo(c.x - 1.3 * k, c.y + 3.4 * k);
    ctx.lineTo(c.x + 4.8 * k, c.y - 3 * k);
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2 * k;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke();
  } else {
    // The card's own outline colour (the usual one when the card has none).
    ctx.strokeStyle = strokeOf(it, theme) ?? strokeOf({ ...it, sc: undefined }, theme)!;
    ctx.lineWidth = 1.6 * k;
    ctx.stroke();
  }
  if (!editing) {
    const ink = it.done ? theme.muted : none ? theme.ink : theme.stickyInk;
    drawText(ctx, { ...it, x: it.x + TASK_INSET, w: it.w - TASK_INSET * 2, fx: it.fx || it.done, tc: it.done ? undefined : it.tc }, textPad(it), ink, true, s);
  }
}

/** Adds a polygon item's outline to the current path. */
function outlinePolygon(ctx: CanvasRenderingContext2D, it: Item) {
  const pts = polyPoints(it);
  ctx.moveTo(pts[0].x, pts[0].y);
  for (const p of pts.slice(1)) ctx.lineTo(p.x, p.y);
  ctx.closePath();
}

/** A mind map node: white (or a fill of its own) on a faint shadow, with no edge but a strip of its
 *  level's colour on the left. */
function drawMind(ctx: CanvasRenderingContext2D, it: Item, s: Scene, editing: boolean) {
  // Dimmed in the dark theme like the other fills.
  const { theme } = s, own = nodeColors(it, tints);
  ctx.beginPath();
  ctx.roundRect(it.x, it.y, it.w, it.h, corner(it));
  ctx.globalAlpha = it.fo ?? 1;
  // The shadow: black at 7%, 2 blurred, 1 down, growing with the zoom like the node.
  const k = s.cam.z * s.dpr;
  ctx.shadowColor = 'rgba(0, 0, 0, .07)';
  ctx.shadowBlur = 2 * k;
  ctx.shadowOffsetY = 1 * k;
  ctx.fillStyle = theme.surface;
  ctx.fill();
  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;
  if (own.fill) { ctx.fillStyle = shade(own.fill, theme.dim); ctx.fill(); }
  // A strip 3 wide down its left edge in its level's colour, inside its round corners.
  ctx.save();
  ctx.clip();
  ctx.fillStyle = shade(levelColor(mindDepth(it, s.get)), theme.dim);
  ctx.fillRect(it.x, it.y, 3, it.h);
  ctx.restore();
  ctx.globalAlpha = 1;
  // A node a branch is being dragged onto shows it by an edge dashed in its colour, the same dashes
  // as the dragged arrow's, 6px on and off on screen.
  if (s.mindMove?.target?.id === it.id) {
    ctx.setLineDash([6 / s.cam.z, 6 / s.cam.z]);
    ctx.lineWidth = 2;
    ctx.strokeStyle = shade(own.color, theme.dim);
    ctx.stroke();
    ctx.setLineDash([]);
  }
  if (!editing) drawText(ctx, it, textPad(it), theme.ink, true, s, textPadY(it));
  for (const [way, n] of s.folded?.get(it.id) ?? []) drawFoldBadge(ctx, it, s, way, n);
}

/** A folded mind map node's count of what it hides that way: a pill in the next level's colour on a
 *  stub of branch, the number in it. */
function drawFoldBadge(ctx: CanvasRenderingContext2D, it: Item, s: Scene, way: Way, n: number) {
  const { theme, cam } = s, b = foldBadge(it, way, cam.z, n, s.slide?.get(`${it.id}:${way}`) ?? 0);
  ctx.strokeStyle = shade(levelColor(mindDepth(it, s.get) + 1), theme.dim);
  ctx.lineWidth = it.parent ? 0.75 : 1.5;
  ctx.beginPath();
  if (way === 'up') { ctx.moveTo(b.x, it.y); ctx.lineTo(b.x, b.y + b.h / 2); }
  else if (way === 'down') { ctx.moveTo(b.x, it.y + it.h); ctx.lineTo(b.x, b.y - b.h / 2); }
  else if (way === 'right') { ctx.moveTo(it.x + it.w, b.y); ctx.lineTo(b.x - b.w / 2, b.y); }
  else { ctx.moveTo(it.x, b.y); ctx.lineTo(b.x + b.w / 2, b.y); }
  ctx.stroke();
  ctx.globalAlpha = 1;
  ctx.beginPath();
  ctx.roundRect(b.x - b.w / 2, b.y - b.h / 2, b.w, b.h, b.h / 2);
  ctx.fillStyle = shade(levelColor(mindDepth(it, s.get) + 1), theme.dim);
  ctx.fill();
  ctx.font = font(10 / cam.z, 600);
  ctx.fillStyle = theme.ink;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(String(n), b.x, b.y + 0.5 / cam.z);
}

/** The branches of mind maps, under the nodes and half see-through (but for those to picked nodes):
 *  thicker near the centre, thinner further out. */
function drawBranches(ctx: CanvasRenderingContext2D, s: Scene) {
  ctx.lineCap = 'round';
  for (const it of s.items) {
    if (it.type !== 'mind' || !it.parent) continue;
    const up = s.get(it.parent);
    if (!up) continue;
    const [a, c1, c2, b] = branchCurve(up, it);
    // In the colour of the node it leads to.
    ctx.strokeStyle = shade(branchColor(it, s.get), s.theme.dim);
    ctx.lineWidth = up.parent ? 0.75 : 1.5;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.bezierCurveTo(c1.x, c1.y, c2.x, c2.y, b.x, b.y);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
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

/** How round a table's corners are, in board units. */
const TABLE_RADIUS = 8;

/** A folded frame: a bar like a mind map's central topic, its title inside and its buttons at the end. */
function drawFolded(ctx: CanvasRenderingContext2D, it: Item, s: Scene, editing: boolean) {
  const { theme, cam } = s;
  ctx.fillStyle = theme.frame;
  ctx.strokeStyle = theme.line;
  ctx.lineWidth = 1 / cam.z;
  ctx.beginPath();
  ctx.roundRect(it.x, it.y, it.w, it.h, 16);
  ctx.fill();
  // A folded component is a bar edged in the same red.
  if (it.comp) {
    ctx.globalAlpha = 0.75;
    ctx.strokeStyle = COMPONENT_COLOR;
    ctx.lineWidth = 1.5 / cam.z;
  }
  ctx.stroke();
  ctx.globalAlpha = 1;
  if (!editing && it.text) {
    ctx.font = font(FOLD_FS, 600);
    ctx.fillStyle = theme.ink;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    // Too long a title ends in an ellipsis.
    let title = it.text;
    if (ctx.measureText(title).width > FOLD_TITLE_MAX) {
      while (title.length > 1 && ctx.measureText(`${title}…`).width > FOLD_TITLE_MAX) title = title.slice(0, -1);
      title = `${title.trimEnd()}…`;
    }
    ctx.fillText(title, it.x + FOLD_PAD, it.y + it.h / 2);
  }
  for (const b of frameButtons(it)) drawIcon(ctx, b.icon, b.x, b.y, b.s, theme.muted);
}

/** A grid on the panel colour with round corners and each cell's text; the cell being edited is
 *  left to the overlay. */
function drawTable(ctx: CanvasRenderingContext2D, it: Item, s: Scene, editingCell: number | null) {
  const { theme, cam } = s;
  const r = Math.min(TABLE_RADIUS, it.w / 2, it.h / 2);
  const outline = () => { ctx.beginPath(); ctx.roundRect(it.x, it.y, it.w, it.h, r); };
  // Everything inside keeps within the round corners.
  ctx.save();
  outline();
  ctx.clip();
  ctx.fillStyle = theme.surface;
  ctx.fillRect(it.x, it.y, it.w, it.h);
  // Cells filled with a colour of their own.
  it.cellFmt?.forEach((f, i) => {
    const bg = f?.bg;
    if (typeof bg !== 'string') return;
    const r = cellRect(it, i);
    ctx.globalAlpha = typeof f?.bgo === 'number' ? f.bgo : 1;
    ctx.fillStyle = shade(bg.startsWith('#') ? bg : FILLS[bg] ?? FILLS.blue, theme.dim);
    ctx.fillRect(r.x, r.y, r.w, r.h);
  });
  ctx.globalAlpha = 1;
  // The grid in the table's line colour (like a shape's outline; the usual is the panels' line grey).
  const line = it.sc === 'none' ? null : it.sc ? (it.sc === 'ink' ? theme.ink : shade(it.sc.startsWith('#') ? it.sc : STROKE_COLORS[it.sc] || theme.line, theme.dim)) : theme.line;
  if (line) {
    ctx.globalAlpha = it.so ?? 1;
    ctx.strokeStyle = line;
    ctx.lineWidth = 1 / cam.z;
    ctx.beginPath();
    let x = it.x, y = it.y;
    for (const w of colsOf(it).slice(0, -1)) { x += w; ctx.moveTo(x, it.y); ctx.lineTo(x, it.y + it.h); }
    for (const h of rowsOf(it).slice(0, -1)) { y += h; ctx.moveTo(it.x, y); ctx.lineTo(it.x + it.w, y); }
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
  // Lines under the pointer or picked to drag, in blue.
  const marked = s.tableLines.filter((l) => l.id === it.id);
  if (marked.length) {
    const cols = colsOf(it), rows = rowsOf(it), upto = (a: number[], i: number) => a.slice(0, i + 1).reduce((t, v) => t + v, 0);
    ctx.strokeStyle = SELECT_COLOR;
    ctx.lineWidth = 2 / cam.z;
    ctx.beginPath();
    for (const l of marked) {
      if (l.axis === 'col') { const lx = it.x + upto(cols, l.index); ctx.moveTo(lx, it.y); ctx.lineTo(lx, it.y + it.h); }
      else { const ly = it.y + upto(rows, l.index); ctx.moveTo(it.x, ly); ctx.lineTo(it.x + it.w, ly); }
    }
    ctx.stroke();
  }
  // Picked cells: a blue edge just inside each, and a light blue wash.
  if (s.pickedCells?.id === it.id) {
    ctx.strokeStyle = SELECT_COLOR;
    ctx.lineWidth = 2 / cam.z;
    for (const i of s.pickedCells.cells) {
      const r = cellRect(it, i), inset = 1 / cam.z;
      ctx.fillStyle = SELECT_COLOR + '1F';
      ctx.fillRect(r.x, r.y, r.w, r.h);
      ctx.strokeRect(r.x + inset, r.y + inset, r.w - inset * 2, r.h - inset * 2);
    }
  }
  const n = colsOf(it).length * rowsOf(it).length;
  for (let i = 0; i < n; i++) {
    const text = cellText(it, i);
    if (text && i !== editingCell) drawText(ctx, cellItem(it, i), 8, theme.ink, true, s);
  }
  ctx.restore();
  // The outer edge, whole, over the clip.
  if (line) {
    ctx.globalAlpha = it.so ?? 1;
    ctx.strokeStyle = line;
    ctx.lineWidth = 1 / cam.z;
    outline();
    ctx.stroke();
    ctx.globalAlpha = 1;
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

/** A link drawn by its shape: a smooth one as its curve; a straight or right-angled one through its
 *  points, its corners rounded, the head along its last stretch. */
function linkArrow(ctx: CanvasRenderingContext2D, shape: LinkShape, color: string, z: number) {
  if (shape.curve) { arrow(ctx, shape.curve, color, z); return; }
  const pts = shape.pts, b = pts[pts.length - 1], from = pts[pts.length - 2];
  const ang = Math.atan2(b.y - from.y, b.x - from.x), px = linkWidth(z), width = px / z, arm = px * 3.8 / z;
  const tip = { x: b.x - Math.cos(ang) * width / 2, y: b.y - Math.sin(ang) * width / 2 };
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length - 1; i++) {
    // Corners rounded, but never past halfway along either side of them.
    const p = pts[i], n = pts[i + 1], l = pts[i - 1];
    const r = Math.min(10, Math.hypot(p.x - l.x, p.y - l.y) / 2, Math.hypot(n.x - p.x, n.y - p.y) / 2);
    ctx.arcTo(p.x, p.y, n.x, n.y, r);
  }
  ctx.lineTo(tip.x, tip.y);
  ctx.stroke();
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
  turned(ctx, it, () => ctx.roundRect(it.x - off, it.y - off, it.w + off * 2, it.h + off * 2, r ? r + off : 0));
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
    const shape = linkShape(l, s.get);
    if (!shape) continue;
    linkArrow(lc, shape, s.selection.has(l.id) ? SELECT_COLOR : theme.link, cam.z);
    // The one under the pointer a little bluer.
    if (l.id === s.hotLink && !s.selection.has(l.id)) {
      lc.globalAlpha = 0.4;
      linkArrow(lc, shape, SELECT_COLOR, cam.z);
      lc.globalAlpha = 1;
    }
  }
  lc.globalCompositeOperation = 'destination-out';
  lc.globalAlpha = 0.85;
  lc.beginPath();
  for (const it of s.items) {
    if (it.type === 'frame' || it.type === 'ink' || !rectsIntersect(boxOf(it), view)) continue;
    turned(lc, it, () => {
      if (it.type === 'ellipse') {
        lc.moveTo(it.x + it.w, it.y + it.h / 2);
        lc.ellipse(it.x + it.w / 2, it.y + it.h / 2, it.w / 2, it.h / 2, 0, 0, Math.PI * 2);
      } else if (it.type === 'polygon') outlinePolygon(lc, it);
      else lc.roundRect(it.x, it.y, it.w, it.h, corner(it));
    });
  }
  lc.fill();
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.drawImage(linkLayer, 0, 0);
  ctx.restore();
}

/** Mind map colours parallel branches take from a coloured one, worked out once per drawing. */
let tints = new Map<string, { color?: string; fill?: string }>();

export function drawScene(ctx: CanvasRenderingContext2D, s: Scene): void {
  const { cam, theme, dpr } = s;
  tints = siblingTints(s.items);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  if (!s.noBackground) drawBackground(ctx, s);

  ctx.setTransform(dpr * cam.z, 0, 0, dpr * cam.z, dpr * cam.x, dpr * cam.y);
  const view: Rect = { x: -cam.x / cam.z - 50, y: -cam.y / cam.z - 50, w: s.width / cam.z + 100, h: s.height / cam.z + 100 };

  drawBranches(ctx, s);
  for (const it of s.items) {
    const b = boxOf(it), box = it.type === 'frame' ? { x: b.x - 40, y: b.y - 40, w: b.w + 80, h: b.h + 80 } : b;
    if (rectsIntersect(box, view)) turned(ctx, it, () => drawItem(ctx, it, s));
  }

  if (s.links.length) drawLinks(ctx, s, view);
  if (s.stroke) strokeInk(ctx, s.stroke, theme);
  if (s.guides.length) {
    ctx.strokeStyle = theme.muted;
    ctx.globalAlpha = 0.45;
    ctx.lineWidth = 1 / cam.z;
    ctx.setLineDash([4 / cam.z, 4 / cam.z]);
    ctx.beginPath();
    for (const g of s.guides) { ctx.moveTo(g.x1, g.y1); ctx.lineTo(g.x2, g.y2); }
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;
  }

  for (const p of s.peers) {
    for (const id of p.selection) {
      const it = s.get(id);
      if (it) outline(ctx, it, cam.z, p.color, [6, 4]);
    }
  }

  for (const id of s.selection) {
    const it = s.get(id);
    if (!it) continue;
    // A mind map node shows it's picked by its "+" buttons alone, which a few picked together don't get.
    // A picked instance shows it by its own dashed red edge.
    if ((it.type !== 'mind' || s.selection.size > 1) && !it.inst) outline(ctx, it, cam.z, SELECT_COLOR);
    // A mind map node sizes itself and links by its branches: instead of the handle and dots it
    // gets a "+" beside it for a branch of its own and one under it for a parallel branch.
    if (s.showHandle && it.type === 'mind') {
      if (s.plusFade > 0) {
        // The ways it has branches: those in sight, and those folded away.
        const up = it.parent ? s.get(it.parent) : undefined;
        const ways = [...new Set([...branchWays(it, s.items), ...foldedWays(it, up)])];
        const fresh = s.chevronless?.startsWith(`${it.id}:`) ? s.chevronless.slice(it.id.length + 1) as Way : undefined;
        for (const b of mindButtons(it, s.get, cam.z, ways, fresh)) {
          // Smaller and faint until the pointer comes over it.
          const hot = s.hotPlus === buttonKey(b), r = hot ? b.r : b.r * 0.9;
          ctx.globalAlpha = (hot ? 1 : 0.5) * s.plusFade;
          ctx.fillStyle = SELECT_COLOR;
          ctx.beginPath();
          ctx.arc(b.x, b.y, r, 0, Math.PI * 2);
          ctx.fill();
          // The plus or arrow on a faint circle is drawn stronger than the circle, so it stands out
          // half as far from white as it would at the circle's strength.
          ctx.globalAlpha = (hot ? 1 : 0.75) * s.plusFade;
          ctx.strokeStyle = '#fff';
          ctx.lineWidth = (hot ? 2 : 1.5) / cam.z;
          ctx.lineCap = 'round';
          ctx.lineJoin = 'round';
          ctx.beginPath();
          if (b.kind === 'move' && (b.y < it.y || b.y > it.y + it.h)) {
            // Over a node led down (or under one led up): an arrow pointing up (or down), away from it.
            const d = b.y < it.y ? -1 : 1;
            ctx.moveTo(b.x, b.y - d * r * 0.5); ctx.lineTo(b.x, b.y + d * r * 0.5);
            ctx.moveTo(b.x - r * 0.4, b.y + d * r * 0.1); ctx.lineTo(b.x, b.y + d * r * 0.5); ctx.lineTo(b.x + r * 0.4, b.y + d * r * 0.1);
          } else if (b.kind === 'move') {
            // An arrow pointing away from the node.
            const d = b.x < it.x ? -1 : 1;
            ctx.moveTo(b.x - d * r * 0.5, b.y); ctx.lineTo(b.x + d * r * 0.5, b.y);
            ctx.moveTo(b.x + d * r * 0.1, b.y - r * 0.4); ctx.lineTo(b.x + d * r * 0.5, b.y); ctx.lineTo(b.x + d * r * 0.1, b.y + r * 0.4);
          } else if (b.kind === 'fold') {
            // A chevron pointing back at the node, for folding its branches away.
            const [dx, dy] = { down: [0, -1], up: [0, 1], left: [1, 0], right: [-1, 0] }[b.way ?? 'right'];
            const tip = { x: b.x + dx * r * 0.25, y: b.y + dy * r * 0.25 }, back = r * 0.45;
            ctx.moveTo(tip.x - dx * back - dy * back, tip.y - dy * back - dx * back);
            ctx.lineTo(tip.x, tip.y);
            ctx.lineTo(tip.x - dx * back + dy * back, tip.y - dy * back + dx * back);
          } else {
            ctx.moveTo(b.x - r * 0.5, b.y); ctx.lineTo(b.x + r * 0.5, b.y);
            ctx.moveTo(b.x, b.y - r * 0.5); ctx.lineTo(b.x, b.y + r * 0.5);
          }
          ctx.stroke();
        }
        ctx.globalAlpha = 1;
      }
    } else if (s.showHandle && s.editingId !== id && (it.inst || it.host)) {
      // An instance is as big as its component, and what's in it stays where the component has it.
    } else if (s.showHandle && s.editingId !== id) {
      if (it.comp) {
        // A picked component's "+" for a new instance of it, right of it.
        const p = instancePlus(it, cam.z);
        ctx.fillStyle = COMPONENT_COLOR;
        ctx.globalAlpha = s.hotPlus === 'instance' ? 1 : 0.75;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2 / cam.z;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(p.x - p.r * 0.45, p.y); ctx.lineTo(p.x + p.r * 0.45, p.y);
        ctx.moveTo(p.x, p.y - p.r * 0.45); ctx.lineTo(p.x, p.y + p.r * 0.45);
        ctx.stroke();
      }
      const hs = (s.byFinger ? HANDLE * 1.5 : HANDLE) / cam.z, off = 3 / cam.z;
      ctx.fillStyle = theme.surface;
      ctx.strokeStyle = SELECT_COLOR;
      ctx.lineWidth = 2 / cam.z;
      ctx.beginPath();
      turned(ctx, it, () => ctx.roundRect(it.x + it.w + off - hs / 2, it.y + it.h + off - hs / 2, hs, hs, 3 / cam.z));
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = SELECT_COLOR;
      ctx.strokeStyle = '#fff';
      for (const side of SIDES) {
        const p = sidePoint(it, side, DOT_GAP / cam.z);
        ctx.beginPath();
        ctx.globalAlpha = side === s.hotDot ? 1 : DOT_FADE;
        ctx.arc(p.x, p.y, (side === s.hotDot ? DOT_R * DOT_HOT : DOT_R) / cam.z, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }
  }

  if (s.mindMove) {
    const { from, to } = s.mindMove;
    arrow(ctx, [from, from, to, to], SELECT_COLOR, cam.z, [6, 6]);
  }

  if (s.linkPreview) {
    const { from, fromSide, to, target } = s.linkPreview;
    if (target) outline(ctx, target, cam.z, SELECT_COLOR, [4, 4]);
    let curve: Bezier;
    if (fromSide) {
      const toSide = target ? nearestSide(target, to) : null;
      curve = curveBetween(sidePoint(from, fromSide), fromSide, target && toSide ? sidePoint(target, toSide) : to, toSide, angleOf(from), target ? angleOf(target) : 0);
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
