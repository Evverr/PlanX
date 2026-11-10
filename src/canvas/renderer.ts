import './compat';
import type { Item, Link, LinkStyle, Side } from '../model/types';
import { MARKER_OPACITY, alignOf, DEFAULTS, FILLS, textPad, textPadY, ICON_COLORS, INK_COLORS, MARK_COLORS, STROKE_COLORS, TEXT_COLORS } from '../model/types';
import { drawIcon } from '../icons/icons';
import { drawEmoji } from '../emoji/emoji';
import { drawPicture } from './pictures';
import { cellItem, cellRect, cellText, colsOf, rowsOf, type TableLine } from '../model/table';
import { audioProgress, clock } from './audio';
import { branchBase, branchColor, branchFrom, BRANCH_W, branchCurve, branchEdges, buttonKey, foldBadge, fillOpacity, ringRadius, levelColor, mindButtons, mindDepth, mindRoot, mindWay, nodeColors, rootTextColor, siblingTints, type Way } from '../model/mind';
import type { Point, Rect } from './geometry';
import type { Guide } from './guides';
import { FOLD_FS, FOLD_PAD, FOLD_TITLE_MAX, frameButtons } from '../model/frame';
import { COMPONENT_COLOR, firstInstance, instancePlus } from '../model/components';
import { labOn } from '../labs/labs';
import { drawTabs, ghostNow, tabsFor, towardOffset, type TabAims } from '../labs/sideTabs';
import { zoomFade, zoomSize } from '../labs/zoomFade';
import { gripsOn } from '../labs/tableMove';
import { gridKind } from '../labs/boardGrid';
import { drawCode } from '../labs/codeBlock';
import { drawTaskCard, TASK_RAD, taskShown } from './task';
import { dotsAlways, dotsUnder } from '../labs/linkTool';
import { drawnLinks } from '../model/textLinks';
import { drawTimeline } from './timeline';
import { autoInk } from '../model/color';
import cursorUrl from './cursor.svg';
import { anchorAt, coveredAt, solid, angleOf, linkBox, traceStar, audioButton, boxOf, center, curveBetween, edgePoint, elbowRoute, inkPoints, instanceBounds, pathNodes, flattenPath, linkHandles, spreadElbows, polyPoints, linkShape, nearestSide, pointInRect, rectsIntersect, sidePoint, SIDES, type Bezier, type LinkShape } from './geometry';
import { font, fontOf, layoutText, withList, type FontStyle, type TextLayout } from './text';

export interface Camera { x: number; y: number; z: number }

/** The component icon before an instance's or a component's name (15px). */
const GLYPH = 18;

export interface Theme {
  bg: string; link: string; ink: string; muted: string; line: string;
  /** The panels' icon colour, for the buttons drawn on the board. */
  icon: string;
  accent: string; frame: string; surface: string; stickyInk: string; shapeStroke: string;
  /** Board background gradient stops and the RGB of the grid lines. */
  grad: [string, string, string]; grid: string;
  /** Multiplier for the colours of stickers, shape fills and coloured icons; below 1 dims them in the dark theme. */
  dim: number;
  /** What's picked: its frame, handle and link dots, in the blue of the tool picked on the rail. */
  pick: string;
}

export function readTheme(): Theme {
  const cs = getComputedStyle(document.documentElement);
  const v = (n: string) => cs.getPropertyValue(n).trim();
  return {
    bg: v('--bg'), link: v('--link'), ink: v('--ink'), muted: v('--muted'), line: v('--line'), icon: v('--fmt-ink'),
    accent: v('--accent'), frame: v('--frame'), surface: v('--surface'),
    stickyInk: v('--sticky-ink'), shapeStroke: v('--shape-stroke'),
    grad: [v('--grad-1'), v('--grad-2'), v('--grad-3')], grid: v('--grid'),
    dim: parseFloat(v('--fill-dim')) || 1,
    pick: v('--fmt-on-ink') || SELECT_COLOR,
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
  /** Drawn on the screen (not the board) under the selection frames: see Editor.underlays. */
  underPicks?: (ctx: CanvasRenderingContext2D) => void;
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
  /** The figure or line whose nodes are being changed ("Перо", src/labs): its nodes in place of the frame. */
  nodesOf?: string | null;
  marquee: Rect | null;
  linkPreview: { from: Item; fromSide: Side | null; fromAt?: number; to: Point; target: Item | null; style?: LinkStyle;
    /** Its arrowheads as they'll be (from the start drawn here to where it's led); unset, at its end. */
    heads?: Heads } | null;
  peers: Peer[];
  showHandle: boolean;
  /** The last press was a finger's: the resize handle is drawn bigger, to be seen under it. */
  byFinger: boolean;
  /** The dot under the pointer, drawn larger and at full strength; the others are faint. */
  hotDot: Side | null;
  /** «Полукруги на рамке» (src/labs): how much each side's ball shows, by where the pointer is. */
  tabAims?: TabAims | null;
  /** The same: the ball out whole, the copy a click on it would make seen faintly that way. */
  ghostTab?: Side | null;
  /** The pointer on the picked item's handle (or a little round it): the handle stronger. */
  hotHandle?: boolean;
  /** With the line tool, the item whose link dots show. */
  linkDots?: string | null;
  /** "Связи инструментом" (src/labs): what's picked shows no link dots; with the line tool (`allDots`),
   *  every item in sight shows them (a mind map node only under the pointer, as `linkDots`). */
  linkTool?: boolean;
  allDots?: boolean;
  /** The mind map node button under the pointer, drawn full size and strength; the others are smaller and faint. */
  hotPlus: string | null;
  /** How far the node buttons have faded in, 0…1: they come a moment after the node is picked. */
  plusFade: number;
  /** A mind map node the pointer has rested on (not the picked one): its buttons show, not the picked one's. */
  plusOn?: string | null;
  /** A node whose buttons are fading out, and how far they still show. */
  plusLeaving?: { id: string; fade: number } | null;
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
  /** A mind map branch being dragged: the node it would hang from if let go now, its line from there. */
  mindDrop?: { id: string; parent: string } | null;
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
  /** The board being worked on (not a picture of it): what's unpicked fades out. */
  live?: boolean;
  /** Picked links' colours being set: drawn in them, not in the selection's blue. */
  linksAsThey?: boolean;
  /** Left see-through where nothing is drawn (a picture saved without the board's background). */
  noBackground?: boolean;
}

export interface InkStroke { pts: Point[]; color: string; width: number; hl: boolean; op?: number; sharp?: boolean }

/** Corner radius of everything with corners except stickers, in board units. */
const CORNER = 8;
const corner = (it: Item) => (it.type === 'rect' ? it.rad ?? CORNER : it.type === 'image' ? it.rad ?? 0 : it.type === 'frame' ? CORNER : it.type === 'task' ? TASK_RAD
  // A mind map node's: the central topic's rounder.
  : it.type === 'mind' ? Math.min(it.h / 2, it.parent ? 10 : 14) : 0);

/** Size of the resize handle in screen pixels. */
export const HANDLE = 12;
/** Link dots around a single selected item: radius (7 across) and distance from its side, in screen
 *  pixels (half as far off its frame as they were). */
export const DOT_R = 3.5;
export const DOT_GAP = 12;
/** A table's top and left ones, with the pills of «Перестановка в таблице» (src/labs) out: further
 *  out, past them even when they've grown; sliding there and back in this long, in ms. */
const PILLS_DOT_GAP = 22, PILLS_SLIDE = 160;
/** How far each table's top and left dots have slid out (0…1, eased) for its pills, and since when. */
const pillTurns = new Map<string, { on: boolean; from: number; at: number }>();
const slid = (t: { on: boolean; from: number; at: number }, now: number) => {
  const k = Math.min(1, (now - t.at) / PILLS_SLIDE), e = 1 - (1 - k) * (1 - k);
  return t.from + ((t.on ? 1 : 0) - t.from) * e;
};
/** How far off the item's side its dot on that side stands, on the screen. */
export function dotGap(it: Item, side: Side, now = performance.now()): number {
  if (it.type !== 'table' || (side !== 'top' && side !== 'left')) return DOT_GAP;
  const on = labOn('tableMove') && gripsOn(it.id);
  let t = pillTurns.get(it.id);
  if (!t) { if (!on) return DOT_GAP; pillTurns.set(it.id, (t = { on, from: 0, at: now })); }
  else if (t.on !== on) pillTurns.set(it.id, (t = { on, from: slid(t, now), at: now }));
  return DOT_GAP + (PILLS_DOT_GAP - DOT_GAP) * slid(t, now);
}
/** The dots' strength, and the one under the pointer's (15 across), which it grows to (and back from)
 *  three times as fast as a popup comes in. */
const DOT_FADE = 0.3, DOT_HOT_FADE = 0.8, DOT_HOT_R = 7.5, DOT_GROW = 160 / 3;
/** What's picked: its frame's strength; its handle's, and with the pointer on it; their line and the
 *  frame's least corner radius. */
export const PICK_FRAME = 0.8; const PICK_FADE = 0.3, PICK_HOT_FADE = 0.8, PICK_LINE = 1.5, PICK_RAD = 4;
/** How far each dot is on its way to lit (1) or not (0), and since when, by item and side. */
const dotTurns = new Map<string, { hot: boolean; from: number; at: number }>();
const dotLit = (t: { hot: boolean; from: number; at: number }, now: number, ms = DOT_GROW) => {
  const k = Math.min(1, (now - t.at) / ms), e = 1 - (1 - k) * (1 - k);
  return t.from + ((t.hot ? 1 : 0) - t.from) * e;
};
/** The resize handle going stronger or back (under the pointer or near it), in this long, in ms. */
const HANDLE_TURN = 150;
let handleTurn = { hot: false, from: 0, at: 0 };
/** Whether a link dot is still growing or shrinking (and wants another frame). */
export const dotsMoving = (): boolean => {
  const now = performance.now();
  return now - handleTurn.at < HANDLE_TURN || [...dotTurns.values()].some((t) => now - t.at < DOT_GROW) || [...pillTurns.values()].some((t) => now - t.at < PILLS_SLIDE)
    || [...unpicked.values()].some((u) => now - u.at < PICK_OUT);
};
/** What's no longer picked fades out (its frame, its handle and dots) as a panel does, in this long. */
const PICK_OUT = 80;
/** What was picked at the last frame, and since when each no longer is (with whether it had its dots). */
let picked = new Set<string>(), pickedAlone: string | null = null;
const unpicked = new Map<string, { at: number; dots: boolean }>();
/** Leaves out of what's drawn next the solid things drawn over an item (tasks, stickers, pictures,
 *  tables, shapes filled in), picked too or not: its selection frame stays under them, as it is. (A task
 *  gliding open or closed, as it's drawn now.) */
function hiddenUnder(ctx: CanvasRenderingContext2D, it: Item, s: Scene, view: Rect) {
  const at = s.items.findIndex((i) => i.id === it.id);
  if (at < 0) return;
  const b = boxOf(it), pad = 6 / s.cam.z;
  const over = s.items.slice(at + 1).map(taskShown).filter((o) => solid(o)
    && o.x < b.x + b.w + pad && b.x - pad < o.x + o.w && o.y < b.y + b.h + pad && b.y - pad < o.y + o.h);
  if (!over.length) return;
  // (One cut after another, so where two of them meet stays cut.)
  for (const o of over) {
    ctx.beginPath();
    ctx.rect(view.x, view.y, view.w, view.h);
    if (o.type === 'ellipse') { ctx.moveTo(o.x + o.w, o.y + o.h / 2); ctx.ellipse(o.x + o.w / 2, o.y + o.h / 2, o.w / 2, o.h / 2, 0, 0, Math.PI * 2); }
    else ctx.roundRect(o.x, o.y, o.w, o.h, corner(o));
    ctx.clip('evenodd');
  }
}

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
  // Links on parts of it (see model/textLinks.ts): those parts blue; each line found in the text as
  // drawn, to know which characters it holds.
  const links = it.links?.length ? drawnLinks(it.text ?? '', it.ls, it.links) : null;
  let from = 0;
  // Seen through as much as it's made to be.
  const textAlpha = it.to ?? 1;
  ctx.globalAlpha = textAlpha;
  for (const line of l.lines) {
    const mid = y + l.lineHeight / 2;
    if (line && (mark || it.fu || it.fx)) {
      const tw = ctx.measureText(line).width;
      const left = align === 'center' ? x - tw / 2 : align === 'right' ? x - tw : x;
      if (mark) {
        ctx.globalAlpha = it.mo ?? 0.45;
        ctx.fillStyle = mark;
        ctx.fillRect(left - 2, y + l.lineHeight * 0.06, tw + 4, l.lineHeight * 0.88);
        ctx.globalAlpha = textAlpha;
      }
      ctx.fillStyle = ink;
      if (it.fu) ctx.fillRect(left, mid + l.size * 0.42, tw, rule);
      if (it.fx) ctx.fillRect(left, mid + l.size * 0.04 - rule / 2, tw, rule);
    }
    ctx.fillStyle = ink;
    const base = y + (l.lineHeight - ascent - descent) / 2 + ascent;
    // A link underlined as a border under it would be: at the foot of its letters, in its own colour at 40%.
    const underline = (x0: number, w: number, color: string) => {
      ctx.fillStyle = color;
      ctx.globalAlpha = textAlpha * 0.4;
      ctx.fillRect(x0, base + descent - rule, w, rule);
      ctx.globalAlpha = textAlpha;
    };
    if (line && it.url) { const tw = ctx.measureText(line).width; underline(align === 'center' ? x - tw / 2 : align === 'right' ? x - tw : x, tw, ink); }
    const at = text.indexOf(line, from), on = links?.filter((k) => k.s < at + line.length && k.e > at);
    from = at + line.length;
    if (!on?.length) ctx.fillText(line, x, base);
    else {
      // Piece by piece from its left end, each link's piece blue (and noted, to be Cmd+clicked).
      const left = x - ctx.measureText(line).width * (align === 'center' ? 0.5 : align === 'right' ? 1 : 0);
      const cuts = [...new Set([0, line.length, ...on.flatMap((k) => [k.s - at, k.e - at]).filter((c) => c > 0 && c < line.length)])].sort((a, b) => a - b);
      ctx.textAlign = 'left';
      for (let i = 0; i + 1 < cuts.length; i++) {
        const piece = line.slice(cuts[i], cuts[i + 1]), px = left + ctx.measureText(line.slice(0, cuts[i])).width;
        const link = on.find((k) => k.s - at <= cuts[i] && k.e - at >= cuts[i + 1]);
        ctx.fillStyle = link ? shade(LINK_INK, s.theme.dim) : ink;
        ctx.fillText(piece, px, base);
        if (link) underline(px, ctx.measureText(piece).width, shade(LINK_INK, s.theme.dim));
        if (link && !it.rot) textLinkRects.push({ x: px, y, w: ctx.measureText(piece).width, h: l.lineHeight, url: link.url });
      }
      ctx.textAlign = align;
    }
    y = mid + l.lineHeight / 2;
  }
  ctx.globalAlpha = 1;
}

/** Blue of links in text. */
const LINK_INK = TEXT_COLORS.blue;

/** Where the links in text were drawn last, on the board, to be Cmd+clicked (see linkInTextAt). */
let textLinkRects: Array<{ x: number; y: number; w: number; h: number; url: string }> = [];

/** The address of the link in text at a board point, as last drawn. */
export const linkInTextAt = (p: Point): string | null =>
  textLinkRects.find((r) => p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h)?.url ?? null;

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
 * The shadows are as a sticker of the usual size has them, whatever its own size (they don't grow
 * with it), and grow and shrink with the zoom as everything does: `px` is device pixels per board
 * unit (canvas shadows aren't scaled by the transform).
 */
function drawSticky(ctx: CanvasRenderingContext2D, it: Item, px: number, dim: number) {
  const { x, y, w, h } = it, a = angleOf(it), t = DEFAULTS.sticky.w / 108;
  // Corner shadow: draw the wedge far off to the side and throw only its shadow back into place
  // (shadow offsets are on the screen, so along the sticker's turn). It runs along the bottom edge,
  // as thick as the usual sticker's.
  const away = 100000;
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.13)';
  ctx.shadowBlur = 4 * t * px;
  ctx.shadowOffsetX = away * px * Math.cos(a);
  ctx.shadowOffsetY = away * px * Math.sin(a);
  ctx.beginPath();
  ctx.moveTo(x + w - 2 * t - away, y + h - 1 * t);
  ctx.lineTo(x + Math.max(w / 2, w - 83 * t) - away, y + h - 1 * t);
  ctx.lineTo(x + w - 4 * t - away, y + h + 3 * t);
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
  ctx.shadowBlur = 3 * t * px;
  ctx.shadowOffsetY = 2 * t * px;
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
      // A block of code ("Код", src/labs): a card of its own.
      if (it.code) { drawCode(ctx, it, cam.z, editing, s.hotPlus); break; }
      const none = it.color === 'none';
      ctx.beginPath();
      if (it.type === 'rect') ctx.roundRect(it.x, it.y, it.w, it.h, Math.min(it.rad ?? CORNER, it.w / 2, it.h / 2));
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
      if (editing) break;
      // A text drawn as a box («Текст рамкой», src/labs): what doesn't fit cut off at it but while it's picked.
      if (it.tb && !s.selection.has(it.id)) {
        ctx.save();
        ctx.beginPath();
        ctx.rect(it.x, it.y, it.w, it.h);
        ctx.clip();
        drawText(ctx, it, 0, theme.ink, false, s);
        ctx.restore();
      } else drawText(ctx, it, 0, theme.ink, false, s);
      break;
    case 'frame': {
      if (it.tl) { drawTimeline(ctx, it, { card: theme.surface, ink: theme.ink }, cam.z); break; }
      if (it.fold) { drawFolded(ctx, it, s, editing); break; }
      // An instance shows only its red title after a hollow diamond (to its component), flush with
      // its contents, and that only while it's picked (as a whole or something inside it).
      if (it.inst) {
        // A task of before (see renewTasks in model/task.ts) shows nothing of its own.
        if (it.inst.startsWith('@')) break;
        if (!s.selection.has(it.id) && ![...s.selection].some((id) => s.get(id)?.host === it.id)) break;
        const b = instanceBounds(it, s.items);
        ctx.font = font(15, 600);
        ctx.fillStyle = COMPONENT_COLOR;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'bottom';
        // 2 above the contents; the component icon solid for its component's first instance, and under the pointer.
        const y = b.y - 2, gap = GLYPH + 3, comp = s.get(it.inst);
        const first = !!comp && firstInstance(comp, s.items)?.id === it.id;
        drawIcon(ctx, first || s.hotPlus === `glyph:${it.id}` ? 'component-solid' : 'component', b.x - 2, y - GLYPH + 1, GLYPH, COMPONENT_COLOR);
        ctx.fillText(it.text ?? '', b.x + gap, y, Math.max(0, b.w - gap));
        break;
      }
      const kin = it.comp;
      if (!it.inst) {
        // A component is only its red edge, with nothing filled in.
        ctx.beginPath();
        ctx.roundRect(it.x, it.y, it.w, it.h, CORNER);
        // A frame's fill and outline: the usual, or a colour of its own as a rectangle's (how opaque, too).
        if (!it.comp && it.color !== 'none') {
          // (Its usual one as it was; given an opacity, the surface's colour seen that far through.)
          ctx.globalAlpha = it.color || it.fo !== undefined ? fillOpacity(it) : 1;
          ctx.fillStyle = it.color ? shade(it.color.startsWith('#') ? it.color : FILLS[it.color] ?? theme.frame, theme.dim) : it.fo !== undefined ? theme.surface : theme.frame;
          ctx.fill();
          ctx.globalAlpha = 1;
        }
        if (it.comp) {
          ctx.globalAlpha = 0.75;
          ctx.strokeStyle = COMPONENT_COLOR;
          ctx.lineWidth = 1.5 / cam.z;
        } else {
          ctx.globalAlpha = it.so ?? 1;
          ctx.strokeStyle = (it.sc ? strokeOf(it, theme) : null) ?? (it.sc === 'none' ? 'transparent' : theme.line);
          ctx.lineWidth = (it.sc ? 2 : 1) / cam.z;
        }
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
      if (!editing && (it.text || kin)) {
        ctx.font = font(15, 600);
        ctx.fillStyle = kin ? COMPONENT_COLOR : theme.muted;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'bottom';
        // A component's name after its icon, solid.
        if (kin) drawIcon(ctx, 'component-solid', it.x, it.y - 7 - GLYPH, GLYPH, COMPONENT_COLOR);
        ctx.fillText(kin ? it.text ?? '' : it.text!, it.x + (kin ? GLYPH + 5 : 2), it.y - 8, it.w - (kin ? GLYPH + 3 : 0));
      }
      break;
    }
    case 'icon':
      // Its colour: one of the set, or any ('#rrggbb'), seen through as much as it's made to be.
      ctx.globalAlpha = it.fo ?? 1;
      drawIcon(ctx, it.icon ?? '', it.x, it.y, Math.min(it.w, it.h), it.color?.startsWith('#') ? shade(it.color, theme.dim)
        : ICON_COLORS[it.color ?? 'ink'] ? shade(ICON_COLORS[it.color ?? 'ink'], theme.dim) : theme.ink);
      ctx.globalAlpha = 1;
      break;
    case 'emoji':
      ctx.globalAlpha = it.fo ?? 1;
      drawEmoji(ctx, it.emoji ?? '', it.x, it.y, Math.min(it.w, it.h));
      ctx.globalAlpha = 1;
      break;
    case 'image':
      ctx.globalAlpha = it.fo ?? 1;
      drawPicture(ctx, it, theme.line);
      ctx.globalAlpha = 1;
      break;
    case 'task':
      drawTaskCard(ctx, it, { surface: theme.surface, ink: theme.ink, muted: theme.muted, dark: theme.dim < 1, z: cam.z, px: cam.z * s.dpr,
        linkInk: shade(LINK_INK, theme.dim), onLink: (r) => textLinkRects.push(r) }, editing ? s.editingCell : undefined, s.hotPlus);
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
      strokeInk(ctx, { pts: inkPoints(it), color: it.color ?? 'ink', width: (it.sw ?? 2) * it.w / (it.iw || it.w), hl: !!it.hl, op: it.fo, sharp: it.sharp }, theme);
      break;
  }
}

/** Adds a polygon item's outline to the current path. */
function outlinePolygon(ctx: CanvasPath, it: Item) {
  // The star as its icon draws it, round at its points (with a corner radius of its own, as any other).
  if (it.shape === 'star' && it.rad === undefined) { traceStar(ctx, it); return; }
  if (it.vx && it.vh && !it.shape && it.rad) { outlineCurved(ctx, it, it.rad); return; }
  const pts = polyPoints(it), n = pts.length, rad = it.rad ?? 0;
  if (!rad) {
    ctx.moveTo(pts[0].x, pts[0].y);
    for (const p of pts.slice(1)) ctx.lineTo(p.x, p.y);
    ctx.closePath();
    return;
  }
  // Each corner rounded, its curve reaching no further than halfway along either side of it (how far it
  // reaches for a radius depends on the corner's angle); from the middle of the last side.
  const mid = { x: (pts[n - 1].x + pts[0].x) / 2, y: (pts[n - 1].y + pts[0].y) / 2 };
  ctx.moveTo(mid.x, mid.y);
  for (let i = 0; i < n; i++) {
    const p = pts[i], a = pts[(i + n - 1) % n], b = pts[(i + 1) % n];
    const la = Math.hypot(a.x - p.x, a.y - p.y), lb = Math.hypot(b.x - p.x, b.y - p.y);
    const cos = ((a.x - p.x) * (b.x - p.x) + (a.y - p.y) * (b.y - p.y)) / (la * lb), half = Math.acos(Math.max(-1, Math.min(1, cos))) / 2;
    ctx.arcTo(p.x, p.y, b.x, b.y, Math.max(0, Math.min(rad, (Math.min(la, lb) / 2) * Math.tan(half))));
  }
  ctx.closePath();
}

/** A figure drawn with "Перо" with curves, its corners rounded as in Figma: wherever the outline turns
 *  at a corner (curves either side of it or not), it's cut back on both sides, as far as the radius
 *  takes it at that angle (no more than halfway along either side), and the cut joined by an arc
 *  following on from both; the handles stay as they are. */
function outlineCurved(ctx: CanvasPath, it: Item, rad: number) {
  const nodes = pathNodes(it.vx!, it.vh, (x, y) => ({ x: it.x + x * it.w, y: it.y + y * it.h })), n = nodes.length;
  // Each side from its corner to the next, as points, and how far along it each of them is.
  const sides = nodes.map((_, s) => flattenPath([nodes[s], nodes[(s + 1) % n]], false, 32));
  const along = sides.map((pts) => pts.reduce<number[]>((d, p, i) => [...d, i ? d[i - 1] + Math.hypot(p.x - pts[i - 1].x, p.y - pts[i - 1].y) : 0], []));
  const len = (s: number) => along[s][along[s].length - 1];
  // The point `d` along side `s`, and which way the side runs there.
  const at = (s: number, d: number): [Point, Point] => {
    const pts = sides[s], ds = along[s];
    let k = 1;
    while (k < pts.length - 1 && ds[k] < d) k++;
    const a = pts[k - 1], b = pts[k], l = ds[k] - ds[k - 1] || 1, t = Math.max(0, Math.min(1, (d - ds[k - 1]) / l));
    return [{ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }, { x: (b.x - a.x) / l, y: (b.y - a.y) / l }];
  };
  const unit = (v: Point) => { const l = Math.hypot(v.x, v.y) || 1; return { x: v.x / l, y: v.y / l }; };
  const turn = (a: Point, b: Point) => Math.acos(Math.max(-1, Math.min(1, a.x * b.x + a.y * b.y)));
  // How far back each corner is cut: none where the outline runs on smoothly through it.
  const cut = nodes.map((_, i) => {
    const s0 = (i + n - 1) % n, a = turn(unit(at(s0, len(s0) - 1e-3)[1]), unit(at(i, 1e-3)[1]));
    return a < 0.02 ? 0 : Math.min(rad * Math.tan(Math.min(a, 3.1) / 2), len(s0) / 2, len(i) / 2);
  });
  const [start] = at(0, cut[0]);
  ctx.moveTo(start.x, start.y);
  for (let s = 0; s < n; s++) {
    const next = (s + 1) % n, end = len(s) - cut[next];
    for (let k = 1; k < sides[s].length - 1; k++) if (along[s][k] > cut[s] && along[s][k] < end) ctx.lineTo(sides[s][k].x, sides[s][k].y);
    const [a, da] = at(s, end);
    ctx.lineTo(a.x, a.y);
    if (!cut[next]) continue;
    // The arc: a curve leaving along the side it comes from and arriving along the next one, with
    // handles as long as a circle's for that turn.
    const [b, db] = at(next, cut[next]), u = unit(da), v = unit(db), t = turn(u, v);
    const h = t < 1e-3 ? 0 : (4 / 3) * Math.tan(t / 4) * (Math.hypot(b.x - a.x, b.y - a.y) / 2 / Math.sin(t / 2));
    ctx.bezierCurveTo(a.x + u.x * h, a.y + u.y * h, b.x - v.x * h, b.y - v.y * h, b.x, b.y);
  }
  ctx.closePath();
}

/** A mind map node's buttons: "+" for a branch of its own and the others, chevrons to fold, the
 *  arrow to move it; for the one picked, or the one the pointer has rested on. */
/** The blue of a table's "+" (the panels' lit ink), for a mind map node's too. */
const plusInk = () => (typeof document !== 'undefined' && getComputedStyle(document.documentElement).getPropertyValue('--fmt-on-ink').trim()) || '#0080FF';

function drawMindButtons(ctx: CanvasRenderingContext2D, it: Item, s: Scene) {
  const { cam } = s;
  if (s.plusFade > 0) {
    // (Not those the lit ring where its branches leave it would be under: see drawBranches.)
    const ringAt = s.hotPlus?.startsWith(`ring:${it.id}:`) ? branchBase(it, s.hotPlus.split(':')[2] as Way) : null;
    for (const b of mindButtons(it, s.get, cam.z)) {
      if (ringAt && Math.hypot(b.x - ringAt.x, b.y - ringAt.y) < ringRadius(cam.z) * 2.5) continue;
      // As a table's "+": smaller and faint until the pointer comes over it.
      const hot = s.hotPlus === buttonKey(b), r = hot ? b.r : b.r * 0.9;
      ctx.globalAlpha = (hot ? 1 : 0.5) * s.plusFade;
      ctx.fillStyle = plusInk();
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
        ctx.moveTo(b.x - r * 0.45, b.y); ctx.lineTo(b.x + r * 0.45, b.y);
        ctx.moveTo(b.x, b.y - r * 0.45); ctx.lineTo(b.x, b.y + r * 0.45);
      }
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }
}

/** A mind map node: white (or a fill of its own) on a faint shadow, with no edge but a strip of its
 *  level's colour on the left. */
function drawMind(ctx: CanvasRenderingContext2D, it: Item, s: Scene, editing: boolean) {
  // Dimmed in the dark theme like the other fills.
  const { theme } = s, own = nodeColors(it, tints);
  // Its map's "Конфигурация" (on its central topic): cards (else the text alone), strips.
  const root = mindRoot(it, s.get), card = !root.mnb, strip = !root.mns;
  ctx.beginPath();
  ctx.roundRect(it.x, it.y, it.w, it.h, corner(it));
  ctx.globalAlpha = fillOpacity(it);
  if (card) {
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
  }
  // The central topic all in the colour it's given, no strip; another node with a strip 3 wide down its
  // left edge in its colour, else its level's, inside its round corners.
  const rootInk = card && !it.parent && it.color?.startsWith('#') ? it.color : null;
  if (rootInk) { ctx.fillStyle = shade(rootInk, theme.dim); ctx.fill(); }
  else if (it.parent && strip) {
    ctx.save();
    ctx.clip();
    ctx.fillStyle = shade(it.color?.startsWith('#') ? it.color : levelColor(mindDepth(it, s.get)), theme.dim);
    ctx.fillRect(it.x, it.y, 3, it.h);
    ctx.restore();
  }
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
  if (!editing) drawText(ctx, it, textPad(it), rootTextColor(it) ?? theme.ink, true, s, textPadY(it));
  for (const [way, n] of s.folded?.get(it.id) ?? []) drawFoldBadge(ctx, it, s, way, n);
}

/** A folded mind map node's count of what it hides that way: a pill in the next level's colour on a
 *  stub of branch, the number in it. */
function drawFoldBadge(ctx: CanvasRenderingContext2D, it: Item, s: Scene, way: Way, n: number) {
  const { theme, cam } = s, fade = zoomFade('fold', cam.z, s.selection.has(it.id));
  if (!fade) return;
  // Smaller as it's zoomed out (see zoomSize): as at a zoom that much bigger.
  const z = cam.z / zoomSize('fold', cam.z, s.selection.has(it.id)), b = foldBadge(it, way, z, n, s.slide?.get(`${it.id}:${way}`) ?? 0);
  ctx.globalAlpha *= fade;
  ctx.strokeStyle = shade(levelColor(mindDepth(it, s.get) + 1), theme.dim);
  ctx.lineWidth = it.parent ? 1.125 : 2.25;
  ctx.beginPath();
  if (way === 'up') { ctx.moveTo(b.x, it.y); ctx.lineTo(b.x, b.y + b.h / 2); }
  else if (way === 'down') { ctx.moveTo(b.x, it.y + it.h); ctx.lineTo(b.x, b.y - b.h / 2); }
  else if (way === 'right') { ctx.moveTo(it.x + it.w, b.y); ctx.lineTo(b.x - b.w / 2, b.y); }
  else { ctx.moveTo(it.x, b.y); ctx.lineTo(b.x + b.w / 2, b.y); }
  ctx.stroke();
  ctx.globalAlpha = fade;
  ctx.beginPath();
  ctx.roundRect(b.x - b.w / 2, b.y - b.h / 2, b.w, b.h, b.h / 2);
  ctx.fillStyle = shade(levelColor(mindDepth(it, s.get) + 1), theme.dim);
  ctx.fill();
  ctx.font = font(10 / z, 600);
  ctx.fillStyle = theme.ink;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(String(n), b.x, b.y + 0.5 / z);
  ctx.globalAlpha = 1;
}

/** The branches of mind maps, under the nodes and half see-through (but for those to picked nodes):
 *  thicker near the centre, thinner further out. */
function drawBranches(ctx: CanvasRenderingContext2D, s: Scene) {
  ctx.lineCap = 'round';
  const edges = branchEdges(s.items, s.get);
  // The ring where a node's branches leave it one way, under the pointer (see ringAt in editor/hover.ts):
  // in their colour, the branches not seen inside it, nothing filling it.
  ringDrawn = null;
  const [, ringId, ringWay] = s.hotPlus?.startsWith('ring:') ? s.hotPlus.split(':') : [];
  const ringOf = ringId ? s.get(ringId) : undefined, ring = ringOf && branchBase(ringOf, ringWay as Way), rr = ringRadius(s.cam.z);
  let ringInk: string | null = null;
  for (const it of s.items) {
    if (it.type !== 'mind' || !it.parent) continue;
    const up = s.get(s.mindDrop?.id === it.id ? s.mindDrop.parent : it.parent);
    if (!up) continue;
    const [a, c1, c2, b] = branchCurve(up, it, edges);
    const cut = ring && up.id === ringId && mindWay(it, up) === ringWay;
    if (cut) {
      ringInk ??= shade(branchColor(it, s.get), s.theme.dim);
      ctx.save();
      ctx.beginPath();
      ctx.rect(ring.x - 1e5, ring.y - 1e5, 2e5, 2e5);
      ctx.moveTo(ring.x + rr, ring.y);
      ctx.arc(ring.x, ring.y, rr, 0, Math.PI * 2);
      ctx.clip('evenodd');
    }
    // In the colour of the node it leads to.
    ctx.strokeStyle = shade(branchColor(it, s.get), s.theme.dim);
    // (Out of a central topic as thick as further on.)
    ctx.lineWidth = BRANCH_W;
    ctx.beginPath();
    // Straight out of its parent to where it curves (past its row's edge, see branchEdges; a central
    // topic's from its middle), and from its row's edge to its own.
    const from = branchFrom(up, mindWay(it, up));
    ctx.moveTo(from.x, from.y);
    if (from.x !== a.x || from.y !== a.y) ctx.lineTo(a.x, a.y);
    ctx.bezierCurveTo(c1.x, c1.y, c2.x, c2.y, b.x, b.y);
    if (b.x > it.x + it.w) ctx.lineTo(it.x + it.w, b.y);
    ctx.stroke();
    if (cut) ctx.restore();
  }
  ringDrawn = ring && ringInk ? { ...ring, r: rr, ink: ringInk } : null;
  ctx.globalAlpha = 1;
}

/** The ring lit where a node's branches leave it (see drawBranches): drawn over the nodes, as its buttons are. */
let ringDrawn: (Point & { r: number; ink: string }) | null = null;
function drawRing(ctx: CanvasRenderingContext2D) {
  if (!ringDrawn) return;
  ctx.strokeStyle = ringDrawn.ink;
  ctx.lineWidth = BRANCH_W;
  ctx.beginPath();
  ctx.arc(ringDrawn.x, ringDrawn.y, ringDrawn.r, 0, Math.PI * 2);
  ctx.stroke();
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
  for (const b of frameButtons(it)) drawIcon(ctx, b.icon, b.x, b.y, b.s, theme.icon);
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
  const lineOf = (c?: string) => c === 'none' ? null : c ? (c === 'ink' ? theme.ink : shade(c.startsWith('#') ? c : STROKE_COLORS[c] || theme.line, theme.dim)) : theme.line;
  // The lines down between columns may have a colour and opacity of their own.
  const line = lineOf(it.sc), down = it.vc !== undefined ? lineOf(it.vc) : line;
  ctx.lineWidth = 1 / cam.z;
  if (down) {
    ctx.globalAlpha = it.vo ?? it.so ?? 1;
    ctx.strokeStyle = down;
    ctx.beginPath();
    let x = it.x;
    for (const w of colsOf(it).slice(0, -1)) { x += w; ctx.moveTo(x, it.y); ctx.lineTo(x, it.y + it.h); }
    ctx.stroke();
  }
  if (line) {
    ctx.globalAlpha = it.so ?? 1;
    ctx.strokeStyle = line;
    ctx.beginPath();
    let y = it.y;
    for (const h of rowsOf(it).slice(0, -1)) { y += h; ctx.moveTo(it.x, y); ctx.lineTo(it.x + it.w, y); }
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
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
  // Picked cells: a blue edge just inside each, nothing more.
  if (s.pickedCells?.id === it.id) {
    ctx.strokeStyle = SELECT_COLOR;
    ctx.lineWidth = 2 / cam.z;
    for (const i of s.pickedCells.cells) {
      const r = cellRect(it, i), inset = 1 / cam.z;
      ctx.strokeRect(r.x + inset, r.y + inset, r.w - inset * 2, r.h - inset * 2);
    }
  }
  const n = colsOf(it).length * rowsOf(it).length;
  for (let i = 0; i < n; i++) {
    const text = cellText(it, i);
    if (text && i !== editingCell) drawText(ctx, cellItem(it, i), textPad(it), theme.ink, true, s, textPadY(it));
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

/** A pen or highlighter line, smoothed by curving through the midpoints between its points (or straight
 *  from one to the next); as opaque as it's set, a highlighter's by default see-through. */
function strokeInk(ctx: CanvasRenderingContext2D, { pts, color, width, hl, op, sharp }: InkStroke, theme: Theme) {
  if (!pts.length) return;
  const c = color.startsWith('#') ? color : INK_COLORS[color];
  ctx.save();
  ctx.globalAlpha = op ?? (hl ? MARKER_OPACITY : 1);
  ctx.strokeStyle = c ? shade(c, theme.dim) : theme.ink;
  ctx.lineWidth = width;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length - 1; i++) {
    if (sharp) { ctx.lineTo(pts[i].x, pts[i].y); continue; }
    ctx.quadraticCurveTo(pts[i].x, pts[i].y, (pts[i].x + pts[i + 1].x) / 2, (pts[i].y + pts[i + 1].y) / 2);
  }
  const last = pts[pts.length - 1];
  ctx.lineTo(last.x, last.y);
  ctx.stroke();
  ctx.restore();
}

/** Link line width on screen, whatever the zoom; thinner once zoomed far out. */
export const linkWidth = (z: number) => (z < 0.3 ? 1 : 1.7);

/** Line width and dashes are in screen pixels, so links look the same at any zoom. */
/** Which ends of a line have an arrowhead. */
export interface Heads { start: boolean; end: boolean }
const END: Heads = { start: false, end: true };

/** An open chevron like the undo icon's: two round-capped arms at 45° back from `tip`, along `ang`. */
function head(ctx: CanvasRenderingContext2D, tip: Point, ang: number, arm: number) {
  ctx.beginPath();
  ctx.moveTo(tip.x - arm * Math.cos(ang - Math.PI / 4), tip.y - arm * Math.sin(ang - Math.PI / 4));
  ctx.lineTo(tip.x, tip.y);
  ctx.lineTo(tip.x - arm * Math.cos(ang + Math.PI / 4), tip.y - arm * Math.sin(ang + Math.PI / 4));
  ctx.stroke();
}

/** How long a line's arrowhead arms are, on the screen: by its width as usual; given a thickness of
 *  its own, the usual size up to 3 px, then growing only a little. */
const headArm = (px: number, thick?: number) => (thick === undefined ? px * 3.8 : 1.7 * 3.8 + Math.max(0, thick - 3) * 0.9);
/** Zoomed out, the heads a little smaller on the screen (as the square root of the zoom), not as small as the board. */
const headZoom = (z: number) => Math.min(1, Math.sqrt(z));
/** Its dashes on the screen: their round ends eat into the gaps, so a thick line's are a little wider. */
const dashesFor = (dash: number[], px: number) => dash.map((d, i) => (i % 2 ? d + Math.max(0, px - 1.7) * 1.3 : d));

function arrow(ctx: CanvasRenderingContext2D, [a, c1, c2, b]: Bezier, color: string, z: number, dash: number[] = [], heads: Heads = END, thick?: number) {
  // The heads follow the curve's tangents at its ends; straight links have no control points, so fall back along the line.
  const from = c2.x !== b.x || c2.y !== b.y ? c2 : c1.x !== b.x || c1.y !== b.y ? c1 : a;
  const back = c1.x !== a.x || c1.y !== a.y ? c1 : c2.x !== a.x || c2.y !== a.y ? c2 : b;
  const ang = Math.atan2(b.y - from.y, b.x - from.x), ang0 = Math.atan2(a.y - back.y, a.x - back.x);
  // Pull a tip back by half the line width so the rounded cap just touches the target.
  const px = thick ?? linkWidth(z), width = px / z;
  const arm = headArm(px, thick) * headZoom(z) / z, sx = Math.cos(ang) * width / 2, sy = Math.sin(ang) * width / 2;
  const tip = heads.end ? { x: b.x - sx, y: b.y - sy } : b;
  const tip0 = heads.start ? { x: a.x - Math.cos(ang0) * width / 2, y: a.y - Math.sin(ang0) * width / 2 } : a;
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.setLineDash(dashesFor(dash, px).map((d) => d / z));
  ctx.beginPath();
  ctx.moveTo(tip0.x, tip0.y);
  ctx.bezierCurveTo(c1.x, c1.y, heads.end ? c2.x - sx : c2.x, heads.end ? c2.y - sy : c2.y, tip.x, tip.y);
  ctx.stroke();
  ctx.setLineDash([]);
  if (heads.end) head(ctx, tip, ang, arm);
  if (heads.start) head(ctx, tip0, ang0, arm);
}

/** The side of a target at `to` a link from `from` comes into: the one facing back along its way. */
function facing(from: Point, to: Point): Side {
  const dx = to.x - from.x, dy = to.y - from.y;
  return Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'left' : 'right') : dy > 0 ? 'top' : 'bottom';
}

/** A link drawn by its shape: a smooth one as its curve; a straight or right-angled one through its
 *  points, its corners rounded, the head along its last stretch. */
function linkArrow(ctx: CanvasRenderingContext2D, shape: LinkShape, color: string, z: number, dash: number[] = [], heads: Heads = END, thick?: number) {
  if (shape.curve) { arrow(ctx, shape.curve, color, z, dash, heads, thick); return; }
  const pts = shape.pts, b = pts[pts.length - 1], from = pts[pts.length - 2], a = pts[0], back = pts[1];
  const ang = Math.atan2(b.y - from.y, b.x - from.x), ang0 = Math.atan2(a.y - back.y, a.x - back.x);
  const px = thick ?? linkWidth(z), width = px / z, arm = headArm(px, thick) * headZoom(z) / z;
  const tip = heads.end ? { x: b.x - Math.cos(ang) * width / 2, y: b.y - Math.sin(ang) * width / 2 } : b;
  const tip0 = heads.start ? { x: a.x - Math.cos(ang0) * width / 2, y: a.y - Math.sin(ang0) * width / 2 } : a;
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.setLineDash(dashesFor(dash, px).map((d) => d / z));
  ctx.beginPath();
  ctx.moveTo(tip0.x, tip0.y);
  for (let i = 1; i < pts.length - 1; i++) {
    // Corners rounded, but never past halfway along either side of them.
    const p = pts[i], n = pts[i + 1], l = pts[i - 1];
    const r = Math.min(10, Math.hypot(p.x - l.x, p.y - l.y) / 2, Math.hypot(n.x - p.x, n.y - p.y) / 2);
    ctx.arcTo(p.x, p.y, n.x, n.y, r);
  }
  ctx.lineTo(tip.x, tip.y);
  ctx.stroke();
  ctx.setLineDash([]);
  if (heads.end) head(ctx, tip, ang, arm);
  if (heads.start) head(ctx, tip0, ang0, arm);
}

/** A link's own look: its colour (the usual grey unset), dashes, arrowheads. */
function linkLook(l: Link, theme: Theme): { color: string; dash: number[]; heads: Heads } {
  const c = l.color && l.color !== 'gray' ? (l.color.startsWith('#') ? l.color : STROKE_COLORS[l.color] || (l.color === 'ink' ? theme.ink : '')) : '';
  return {
    color: c ? shade(c, theme.dim) : theme.link,
    dash: l.dash ? [8, 6] : [],
    heads: { start: l.heads === 'start' || l.heads === 'both', end: l.heads !== 'start' && l.heads !== 'none' },
  };
}

function outline(ctx: CanvasRenderingContext2D, it: Item, z: number, color: string, dash: number[] = [], width = 2, least = 0) {
  const off = 3 / z;
  ctx.strokeStyle = color;
  ctx.lineWidth = width / z;
  ctx.setLineDash(dash.map((d) => d / z));
  // Follows the item's corners, pushed out by the same gap.
  const r = corner(it);
  ctx.beginPath();
  turned(ctx, it, () => ctx.roundRect(it.x - off, it.y - off, it.w + off * 2, it.h + off * 2, Math.max(r ? r + off : 0, least / z)));
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

  const kind = gridKind();
  if (kind === 'none') return;
  if (kind === 'dots') { drawGridDots(ctx, s); return; }
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

/** The dots on the board's background ("Фон доски", src/labs): this far apart on the board at 100%, and
 *  three times as many or as few as it's zoomed, so they stay from DOTS_FROM to three times that apart
 *  on the screen, however far it's zoomed. Their radius on the screen. */
const DOTS_STEP = 56 / 3, DOTS_FROM = 16, DOTS_K = 3, DOTS_R = 1;
function drawGridDots(ctx: CanvasRenderingContext2D, s: Scene) {
  const { cam, theme, width: W, height: H } = s;
  let step = DOTS_STEP;
  while (step * cam.z < DOTS_FROM) step *= DOTS_K;
  while (step * cam.z >= DOTS_FROM * DOTS_K) step /= DOTS_K;
  const px = step * cam.z;
  ctx.fillStyle = `rgba(${theme.grid}, .14)`;
  ctx.beginPath();
  for (let i = Math.floor(-cam.x / px); i * px + cam.x < W + DOTS_R; i++) {
    for (let j = Math.floor(-cam.y / px); j * px + cam.y < H + DOTS_R; j++) {
      const x = i * px + cam.x, y = j * px + cam.y;
      ctx.moveTo(x + DOTS_R, y);
      ctx.arc(x, y, DOTS_R, 0, Math.PI * 2);
    }
  }
  ctx.fill();
}

let linkLayer: HTMLCanvasElement | null = null;

/** Another layer, for links faded through frames of their own (see drawLinks). */
let groupLayer: HTMLCanvasElement | null = null;

/** An item's outline on a path, turned as it is. */
function outlineOn(path: Path2D, it: Item): void {
  const own = new Path2D();
  if (it.type === 'ellipse') {
    own.moveTo(it.x + it.w, it.y + it.h / 2);
    own.ellipse(it.x + it.w / 2, it.y + it.h / 2, it.w / 2, it.h / 2, 0, 0, Math.PI * 2);
  } else if (it.type === 'polygon') outlinePolygon(own, it);
  else own.roundRect(it.x, it.y, it.w, it.h, it.tl ? 10 : corner(it));
  const a = angleOf(it), c = center(it);
  path.addPath(own, a ? new DOMMatrix().translate(c.x, c.y).rotate((a * 180) / Math.PI).translate(-c.x, -c.y) : undefined);
}

/**
 * Links go on their own layer so that where one crosses an item it can be faded to 8%:
 * the items' outlines are filled as one path (so overlaps don't fade twice) and cut out
 * at 92% strength. Frames (timelines too) fade the links crossing them, but not those with an end on
 * something they hold, else every link inside one would fade: links are drawn in groups by the frames
 * holding their ends, each group cut through all but those. Instances and components show no card of
 * their own, so nothing fades through them but what's in them.
 */
function drawLinks(ctx: CanvasRenderingContext2D, s: Scene, view: Rect) {
  const { cam, dpr, theme } = s;
  const W = ctx.canvas.width, H = ctx.canvas.height;
  const layer = (c: HTMLCanvasElement | null) => {
    const l = c ?? document.createElement('canvas');
    if (l.width !== W || l.height !== H) { l.width = W; l.height = H; }
    return l;
  };
  linkLayer = layer(linkLayer);
  groupLayer = layer(groupLayer);
  const lc = linkLayer.getContext('2d')!, gc = groupLayer.getContext('2d')!;
  lc.setTransform(1, 0, 0, 1, 0, 0);
  lc.clearRect(0, 0, W, H);
  // Right-angled ones kept off one another, a line's width apart.
  const shapes = s.links.map((l) => linkShape(l, s.get));
  spreadElbows(shapes.filter((sh, k): sh is LinkShape => !!sh && !s.links[k].via?.length), (linkWidth(cam.z) * 2) / cam.z);
  // What fades links: every item in sight but drawings and the frames of instances and components.
  const seen = s.items.filter((it) => it.type !== 'ink' && !it.inst && !it.comp && rectsIntersect(boxOf(it), view));
  const frames = seen.filter((it) => it.type === 'frame' && !it.fold);
  const items = new Path2D();
  for (const it of seen) if (!frames.includes(it)) outlineOn(items, it);
  // The frames holding a link's ends (the middle of the item it's from or to inside the frame), not
  // the ends themselves: a line between two timelines fades crossing either.
  const holding = (id: string) => { const it = s.get(id); if (!it) return []; const c = center(it); return frames.filter((f) => f.id !== id && pointInRect(c, f)).map((f) => f.id); };
  const groups = new Map<string, number[]>();
  for (const [k, l] of s.links.entries()) {
    if (!shapes[k]) continue;
    const key = [...new Set([...holding(l.from), ...holding(l.to)])].sort().join();
    groups.set(key, [...groups.get(key) ?? [], k]);
  }
  for (const [key, ks] of groups) {
    gc.setTransform(1, 0, 0, 1, 0, 0);
    gc.globalCompositeOperation = 'source-over';
    gc.globalAlpha = 1;
    gc.clearRect(0, 0, W, H);
    gc.setTransform(dpr * cam.z, 0, 0, dpr * cam.z, dpr * cam.x, dpr * cam.y);
    for (const k of ks) {
      const l = s.links[k], shape = shapes[k]!;
      const look = linkLook(l, theme);
      gc.globalAlpha = l.lo ?? 1;
      linkArrow(gc, shape, s.selection.has(l.id) && !s.linksAsThey ? SELECT_COLOR : look.color, cam.z, look.dash, look.heads, l.lw);
      // The one under the pointer a little bluer.
      if (l.id === s.hotLink && !s.selection.has(l.id)) {
        gc.globalAlpha = 0.4 * (l.lo ?? 1);
        linkArrow(gc, shape, SELECT_COLOR, cam.z, look.dash, look.heads, l.lw);
      }
      gc.globalAlpha = 1;
    }
    const own = new Set(key ? key.split(',') : []), cut = new Path2D(items);
    for (const f of frames) if (!own.has(f.id)) outlineOn(cut, f);
    gc.globalCompositeOperation = 'destination-out';
    gc.globalAlpha = 0.92;
    gc.fill(cut);
    lc.drawImage(groupLayer, 0, 0);
  }
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.drawImage(linkLayer, 0, 0);
  ctx.restore();
}

/** An item's four link dots, beside its sides; the one under the pointer bigger. */
function drawDots(ctx: CanvasRenderingContext2D, it: Item, s: Scene, fade = 1) {
  const { cam } = s;
  ctx.fillStyle = s.theme.pick;
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 2 / cam.z;
  const now = performance.now();
  for (const side of SIDES) {
    const p = sidePoint(it, side, dotGap(it, side, now) / cam.z), key = `${it.id}:${side}`, hot = side === s.hotDot && (!s.allDots || it.id === s.linkDots);
    let t = dotTurns.get(key);
    if (!t) dotTurns.set(key, (t = { hot, from: hot ? 1 : 0, at: 0 }));
    else if (t.hot !== hot) dotTurns.set(key, (t = { hot, from: dotLit(t, now), at: now }));
    const k = dotLit(t, now);
    ctx.beginPath();
    ctx.globalAlpha = (DOT_FADE + (DOT_HOT_FADE - DOT_FADE) * k) * fade;
    ctx.arc(p.x, p.y, (DOT_R + (DOT_HOT_R - DOT_R) * k) / cam.z, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

/** «Полукруги на рамке»: the layer the copy a click would make is drawn on (see drawScene). */
let ghostLayer: HTMLCanvasElement | null = null;

/** Mind map colours parallel branches take from a coloured one, worked out once per drawing. */
let tints = new Map<string, { color?: string; fill?: string }>();

export function drawScene(ctx: CanvasRenderingContext2D, s: Scene): void {
  const { cam, theme, dpr } = s;
  tints = siblingTints(s.items);
  if (!s.noBackground) textLinkRects = [];
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  if (!s.noBackground) drawBackground(ctx, s);

  ctx.setTransform(dpr * cam.z, 0, 0, dpr * cam.z, dpr * cam.x, dpr * cam.y);
  const view: Rect = { x: -cam.x / cam.z - 50, y: -cam.y / cam.z - 50, w: s.width / cam.z + 100, h: s.height / cam.z + 100 };

  drawBranches(ctx, s);
  for (const it of s.items) {
    const b = it.inst ? instanceBounds(it, s.items) : boxOf(it), box = it.type === 'frame' ? { x: b.x - 40, y: b.y - 40, w: b.w + 80, h: b.h + 80 } : b;
    if (rectsIntersect(box, view)) {
      // The instance title sits above its contents' board-aligned bounds, including turned copies.
      if (it.inst) drawItem(ctx, it, s);
      else turned(ctx, it, () => drawItem(ctx, it, s));
    }
  }

  // («Полукруги на рамке», src/labs: the copy a click on the ball out would make, at 40%, easing in and out.)
  const alone = s.selection.size === 1 ? s.get([...s.selection][0]) : undefined;
  const gh = s.live ? ghostNow(alone && s.ghostTab && tabsFor(alone, s.editingId ?? null) ? alone.id : null, s.ghostTab ?? null) : null;
  const ghostOf = gh && s.get(gh.id);
  if (gh && ghostOf) {
    // (Drawn on a layer of its own and laid on at 40%: drawing it sets its own opacities.)
    const d = towardOffset(ghostOf, gh.side, s.items), c = ctx.canvas;
    if (d && (!ghostLayer || ghostLayer.width !== c.width || ghostLayer.height !== c.height)) { ghostLayer = document.createElement('canvas'); ghostLayer.width = c.width; ghostLayer.height = c.height; }
    const g = d && ghostLayer?.getContext('2d');
    if (d && ghostLayer && g) {
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.clearRect(0, 0, c.width, c.height);
      g.setTransform(ctx.getTransform());
      drawItem(g, { ...ghostOf, id: `${ghostOf.id}~ghost`, x: ghostOf.x + d.x, y: ghostOf.y + d.y }, s);
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalAlpha = 0.4 * gh.k;
      ctx.drawImage(ghostLayer, 0, 0);
      ctx.restore();
    }
  }
  if (s.links.length) drawLinks(ctx, s, view);
  // Every component's tick, right of it: an instance in its place, the component put away.
  for (const it of s.items) {
    // (Its title being typed in too: done with it there and then.)
    if (!it.comp || it.stowed) continue;
    const fade = zoomFade('comp', cam.z, s.selection.has(it.id));
    if (!fade) continue;
    // Smaller as it's zoomed out (see zoomSize): as at a zoom that much bigger.
    const z = cam.z / zoomSize('comp', cam.z, s.selection.has(it.id)), p = instancePlus(it, z);
    ctx.fillStyle = COMPONENT_COLOR;
    ctx.globalAlpha = (s.hotPlus === `tick:${it.id}` ? 1 : 0.75) * fade;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = fade;
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2 / z;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(p.x - p.r * 0.45, p.y + p.r * 0.02); ctx.lineTo(p.x - p.r * 0.1, p.y + p.r * 0.36); ctx.lineTo(p.x + p.r * 0.45, p.y - p.r * 0.3);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
  // A link picked alone: its nodes, and where new ones can be pulled out (the middles of its stretches).
  const pickedLink = s.selection.size === 1 ? s.links.find((l) => s.selection.has(l.id)) : undefined, ps = pickedLink && linkShape(pickedLink, s.get);
  if (pickedLink && ps) {
    const { nodes, middles } = linkHandles(pickedLink, ps);
    ctx.lineWidth = 1.5 / cam.z;
    for (const m of middles) {
      ctx.beginPath();
      ctx.arc(m.p.x, m.p.y, 4 / cam.z, 0, Math.PI * 2);
      ctx.fillStyle = theme.surface;
      ctx.globalAlpha = 0.85;
      ctx.fill();
      ctx.globalAlpha = 0.6;
      ctx.strokeStyle = SELECT_COLOR;
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    for (const n of nodes) {
      ctx.beginPath();
      ctx.arc(n.x, n.y, 5 / cam.z, 0, Math.PI * 2);
      ctx.fillStyle = theme.surface;
      ctx.fill();
      ctx.lineWidth = 2 / cam.z;
      ctx.strokeStyle = SELECT_COLOR;
      ctx.stroke();
    }
  }
  if (s.stroke) strokeInk(ctx, s.stroke, theme);
  if (s.guides.length) {
    ctx.strokeStyle = theme.muted;
    ctx.globalAlpha = 0.3;
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

  drawRing(ctx);
  // The buttons of a mind map node the pointer has rested on, in place of the picked one's.
  const resting = s.plusOn ? s.get(s.plusOn) : undefined;
  if (resting) drawMindButtons(ctx, resting, s);
  const leaving = s.plusLeaving && s.get(s.plusLeaving.id);
  if (leaving) drawMindButtons(ctx, leaving, { ...s, plusFade: s.plusLeaving!.fade, hotPlus: null, chevronless: null });
  if (s.underPicks) { ctx.save(); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); s.underPicks(ctx); ctx.restore(); }
  // Just unpicked: its frame, handle and dots going.
  const now = performance.now();
  if (s.live) for (const id of picked) if (!s.selection.has(id) && !unpicked.has(id)) unpicked.set(id, { at: now, dots: id === pickedAlone });
  for (const id of s.selection) unpicked.delete(id);
  if (s.live) picked = new Set(s.selection);
  if (s.live) pickedAlone = s.selection.size === 1 && s.showHandle ? [...s.selection][0] : null;
  if (s.live) for (const [id, u] of unpicked) {
    // (A task gliding open or closed, as it's drawn now.)
    const k = (now - u.at) / PICK_OUT, got = s.get(id), it = got && taskShown(got);
    if (k >= 1 || !it) { unpicked.delete(id); continue; }
    if (it.type === 'mind' || it.inst || it.host) continue;
    ctx.globalAlpha = PICK_FRAME * (1 - k);
    outline(ctx, it, cam.z, theme.pick, [], PICK_LINE, PICK_RAD);
    if (u.dots) {
      const hs = (s.byFinger ? HANDLE * 1.5 : HANDLE) / cam.z, off = 3 / cam.z;
      ctx.fillStyle = theme.surface;
      ctx.strokeStyle = theme.pick;
      ctx.lineWidth = PICK_LINE / cam.z;
      ctx.beginPath();
      turned(ctx, it, () => ctx.roundRect(it.x + it.w + off - hs / 2, it.y + it.h + off - hs / 2, hs, hs, 3 / cam.z));
      ctx.globalAlpha = PICK_FADE * (1 - k);
      ctx.fill();
      ctx.stroke();
      if (!s.linkTool) drawDots(ctx, it, s, 1 - k);
    }
    ctx.globalAlpha = 1;
  }
  for (const id of s.selection) {
    const got = s.get(id), it = got && taskShown(got);
    if (!it || s.nodesOf === id) continue;
    // A mind map node shows it's picked by its "+" buttons alone, which a few picked together don't get.
    // An instance keeps its red title alone, without a selection frame.
    if ((it.type !== 'mind' || s.selection.size > 1) && !it.inst) {
      ctx.globalAlpha = PICK_FRAME;
      ctx.save();
      hiddenUnder(ctx, it, s, view);
      outline(ctx, it, cam.z, theme.pick, [], PICK_LINE, PICK_RAD);
      ctx.restore();
      ctx.globalAlpha = 1;
    }
    // (A picture of the board has it as it is, and leaves the one on the board alone.)
    const handleHot = !!s.hotHandle;
    if (s.live && handleTurn.hot !== handleHot) handleTurn = { hot: handleHot, from: dotLit(handleTurn, now, HANDLE_TURN), at: now };
    const handleFade = PICK_FADE + (PICK_HOT_FADE - PICK_FADE) * (s.live ? dotLit(handleTurn, now, HANDLE_TURN) : handleHot ? 1 : 0);
    // A mind map node sizes itself and links by its branches: instead of the handle and dots it
    // gets a "+" beside it for a branch of its own and one under it for a parallel branch.
    if (s.showHandle && it.type === 'mind') {
      if (!s.plusOn) drawMindButtons(ctx, it, s);
    } else if (s.showHandle && s.editingId !== id && it.host) {
      // What's in an instance stays where the instance puts it.
    } else if (s.showHandle && s.editingId !== id && it.inst) {
      // An instance's handle at its contents' corner, to stretch them.
      const b = instanceBounds(it, s.items), hs = (s.byFinger ? HANDLE * 1.5 : HANDLE) / cam.z, off = 3 / cam.z;
      ctx.fillStyle = theme.surface;
      ctx.strokeStyle = theme.pick;
      ctx.lineWidth = PICK_LINE / cam.z;
      ctx.beginPath();
      ctx.roundRect(b.x + b.w + off - hs / 2, b.y + b.h + off - hs / 2, hs, hs, 3 / cam.z);
      ctx.globalAlpha = handleFade;
      ctx.fill();
      ctx.stroke();
      ctx.globalAlpha = 1;
    } else if (s.showHandle && s.editingId !== id) {
      // (Not over what lies over its corner: see coveredAt.)
      const hs = (s.byFinger ? HANDLE * 1.5 : HANDLE) / cam.z, off = 3 / cam.z, hidden = !it.rot && coveredAt(s.items, it, { x: it.x + it.w, y: it.y + it.h });
      ctx.fillStyle = theme.surface;
      ctx.strokeStyle = theme.pick;
      ctx.lineWidth = PICK_LINE / cam.z;
      ctx.beginPath();
      turned(ctx, it, () => ctx.roundRect(it.x + it.w + off - hs / 2, it.y + it.h + off - hs / 2, hs, hs, 3 / cam.z));
      ctx.globalAlpha = hidden ? 0 : handleFade;
      ctx.fill();
      ctx.stroke();
      ctx.globalAlpha = 1;
      // («Полукруги на рамке», src/labs: its half circles instead.)
      if (tabsFor(it, s.editingId ?? null)) drawTabs(ctx, it, cam.z, theme.pick, PICK_FRAME, s.tabAims ?? null);
      else if (!s.linkTool) drawDots(ctx, it, s);
    }
  }
  // With the line tool, the dots of the item under the pointer, whatever it is.
  const dotted = s.linkDots ? s.get(s.linkDots) : undefined;
  if (dotted && (s.allDots ? dotsUnder(dotted, s.selection) : s.linkTool || !(s.selection.size === 1 && s.selection.has(dotted.id)))) drawDots(ctx, linkBox(dotted), s);
  // And with "Связи инструментом", every other one's in sight.
  if (s.allDots) {
    const m = 20 / cam.z, view = { x: -cam.x / cam.z - m, y: -cam.y / cam.z - m, w: s.width / cam.z + m * 2, h: s.height / cam.z + m * 2 };
    for (const it of s.items) if (it.id !== dotted?.id && dotsAlways(it, s.selection) && rectsIntersect(view, boxOf(it))) drawDots(ctx, linkBox(it), s);
  }

  if (s.mindMove) {
    const { from, to } = s.mindMove;
    arrow(ctx, [from, from, to, to], SELECT_COLOR, cam.z, [6, 6]);
  }

  if (s.linkPreview) {
    const { from, fromSide, fromAt, to, target, style, heads = END } = s.linkPreview;
    if (target) outline(ctx, target, cam.z, SELECT_COLOR, [4, 4]);
    let curve: Bezier;
    // Drawn the way it will run: straight or in right angles, as the last one was made to.
    // Pulled from a link dot, it starts at the dot (and ends on what it's led to, as it'll be made).
    // (Where along its side it starts, a link led on from a place of its own there.)
    const dot = fromSide ? dotGap(from, fromSide) / cam.z : 0, along = fromAt ?? 0.5;
    // Over an item: the side it's going into, and where along it (its middle when near that).
    const anchor = target ? anchorAt(target, to, 10 / cam.z) : null;
    if (style && style !== 'arc') {
      const ps = fromSide ?? nearestSide(from, target ? center(target) : to);
      const qs = anchor ? anchor.side : facing(sidePoint(from, ps, dot), to);
      const p = sidePoint(from, ps, dot, fromSide ? along : 0.5), q = target && anchor ? sidePoint(target, anchor.side, 0, anchor.at) : to;
      linkArrow(ctx, { pts: style === 'straight' ? [p, q] : elbowRoute(p, ps, q, qs) }, SELECT_COLOR, cam.z, [6, 6], heads);
    } else if (style === 'arc') {
      // An arc: out of its side, into where it's led any way.
      const ps = fromSide ?? nearestSide(from, target ? center(target) : to), p = sidePoint(from, ps, dot, fromSide ? along : 0.5);
      curve = curveBetween(p, ps, target && anchor ? sidePoint(target, anchor.side, 0, anchor.at) : to, null, angleOf(from));
    } else if (fromSide || (anchor && anchor.at !== 0.5)) {
      const ps = fromSide ?? nearestSide(from, target ? center(target) : to);
      curve = curveBetween(sidePoint(from, ps, dot, fromSide ? along : 0.5), ps, target && anchor ? sidePoint(target, anchor.side, 0, anchor.at) : to, anchor?.side ?? null, angleOf(from), target ? angleOf(target) : 0);
    } else {
      const end = target ? edgePoint(target, center(from)) : to, start = edgePoint(from, end);
      curve = [start, start, end, end];
    }
    if (!style || style === 'arc') arrow(ctx, curve!, SELECT_COLOR, cam.z, [6, 6], heads);
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

  // Other people's cursors, drawn at screen size (Figma "Component 6"): the arrow in their colour,
  // turned 4.22°, and their name on a pill of it below and right, both at 90%.
  for (const p of s.peers) {
    if (!p.cursor) continue;
    const x = p.cursor.x * cam.z + cam.x, y = p.cursor.y * cam.z + cam.y;
    if (x < -20 || y < -20 || x > s.width + 20 || y > s.height + 20) continue;
    ctx.globalAlpha = 0.9;
    const arrow = tintedCursor(p.color);
    if (arrow) {
      ctx.save();
      ctx.translate(x + 2 + CURSOR_W / 2, y + 1 + CURSOR_H / 2);
      ctx.rotate((4.22 * Math.PI) / 180);
      ctx.drawImage(arrow, -CURSOR_W / 2, -CURSOR_H / 2, CURSOR_W, CURSOR_H);
      ctx.restore();
    }
    ctx.font = font(10, 500, 'inter');
    const tw = ctx.measureText(p.name).width;
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.roundRect(x + 17, y + 16, tw + 14, 22, 7);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(p.name, x + 24, y + 29.7);
    ctx.globalAlpha = 1;
  }
}

/** The cursor's arrow from Figma (src/canvas/cursor.svg), and its size there. */
const CURSOR_W = 17.9245, CURSOR_H = 17.4262;
let cursorImg: HTMLImageElement | null = null;
const tintedCursors = new Map<string, HTMLCanvasElement>();
/** The arrow in this colour, drawn three times over for sharp screens; null till it's loaded. */
function tintedCursor(color: string): HTMLCanvasElement | null {
  if (!cursorImg) {
    cursorImg = new Image();
    cursorImg.onload = () => tintedCursors.clear();
    cursorImg.src = cursorUrl;
  }
  if (!cursorImg.complete || !cursorImg.naturalWidth) return null;
  let c = tintedCursors.get(color);
  if (!c) {
    c = document.createElement('canvas');
    c.width = Math.ceil(CURSOR_W * 3);
    c.height = Math.ceil(CURSOR_H * 3);
    const g = c.getContext('2d')!;
    g.drawImage(cursorImg, 0, 0, CURSOR_W * 3, CURSOR_H * 3);
    g.globalCompositeOperation = 'source-in';
    g.fillStyle = color;
    g.fillRect(0, 0, c.width, c.height);
    tintedCursors.set(color, c);
  }
  return c;
}
