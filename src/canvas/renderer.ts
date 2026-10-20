import type { Item, Link } from '../model/types';
import { FILLS, ICON_COLORS } from '../model/types';
import { drawIcon } from '../icons/icons';
import type { Point, Rect } from './geometry';
import { center, edgePoint, linkEnds, rectsIntersect } from './geometry';
import { font, layoutText, type TextLayout } from './text';

export interface Camera { x: number; y: number; z: number }

export interface Theme {
  bg: string; dot: string; ink: string; muted: string; line: string;
  accent: string; frame: string; surface: string; stickyInk: string; shapeStroke: string;
}

export function readTheme(): Theme {
  const cs = getComputedStyle(document.documentElement);
  const v = (n: string) => cs.getPropertyValue(n).trim();
  return {
    bg: v('--bg'), dot: v('--dot'), ink: v('--ink'), muted: v('--muted'), line: v('--line'),
    accent: v('--accent'), frame: v('--frame'), surface: v('--surface'),
    stickyInk: v('--sticky-ink'), shapeStroke: v('--shape-stroke'),
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
  linkPreview: { from: Item; to: Point; target: Item | null } | null;
  peers: Peer[];
  showHandle: boolean;
}

/** Size of the resize handle in screen pixels. */
export const HANDLE = 12;

const layoutCache = new Map<string, TextLayout>();

function cachedLayout(ctx: CanvasRenderingContext2D, key: string, text: string, w: number, h: number, size: number, weight: number) {
  let l = layoutCache.get(key);
  if (!l) {
    if (layoutCache.size > 3000) layoutCache.clear();
    l = layoutText(ctx, text, Math.max(1, w), h, size, weight);
    layoutCache.set(key, l);
  }
  return l;
}

/** Forget measured text, e.g. after the web font finishes loading. */
export const clearTextCache = () => layoutCache.clear();

function drawText(ctx: CanvasRenderingContext2D, it: Item, pad: number, align: 'center' | 'left', weight: number, color: string, shrink: boolean, z: number) {
  const text = it.text ?? '';
  if (!text) return;
  const size = it.fs ?? 16;
  if (size * z < 2.5) return; // too small to read; skip the work
  const w = it.w - pad * 2, h = shrink ? it.h - pad * 2 : Infinity;
  const l = cachedLayout(ctx, `${it.type}|${w}|${h}|${size}|${weight}|${text}`, text, w, h, size, weight);
  ctx.font = font(l.size, weight);
  ctx.fillStyle = color;
  ctx.textBaseline = 'middle';
  ctx.textAlign = align;
  const total = l.lines.length * l.lineHeight;
  const x = align === 'center' ? it.x + it.w / 2 : it.x + pad;
  let y = align === 'center' ? it.y + it.h / 2 - total / 2 : it.y + pad;
  for (const line of l.lines) {
    ctx.fillText(line, x, y + l.lineHeight / 2);
    y += l.lineHeight;
  }
}

function drawItem(ctx: CanvasRenderingContext2D, it: Item, s: Scene) {
  const { theme, cam } = s;
  const editing = s.editingId === it.id;
  switch (it.type) {
    case 'sticky': {
      ctx.save();
      ctx.shadowColor = 'rgba(0,0,0,0.22)';
      ctx.shadowBlur = 14 * cam.z * s.dpr;
      ctx.shadowOffsetY = 5 * cam.z * s.dpr;
      ctx.fillStyle = FILLS[it.color ?? 'yellow'] ?? FILLS.yellow;
      ctx.fillRect(it.x, it.y, it.w, it.h);
      ctx.restore();
      if (!editing) drawText(ctx, it, 14, 'center', 500, theme.stickyInk, true, cam.z);
      break;
    }
    case 'rect':
    case 'ellipse': {
      const none = it.color === 'none';
      ctx.beginPath();
      if (it.type === 'rect') ctx.roundRect(it.x, it.y, it.w, it.h, Math.min(8, it.w / 4, it.h / 4));
      else ctx.ellipse(it.x + it.w / 2, it.y + it.h / 2, it.w / 2, it.h / 2, 0, 0, Math.PI * 2);
      if (!none) { ctx.fillStyle = FILLS[it.color ?? 'blue'] ?? FILLS.blue; ctx.fill(); }
      ctx.lineWidth = 2;
      ctx.strokeStyle = none ? theme.ink : theme.shapeStroke;
      ctx.stroke();
      const pad = it.type === 'ellipse' ? Math.min(it.w, it.h) * 0.15 + 6 : 10;
      if (!editing) drawText(ctx, it, pad, 'center', 600, none ? theme.ink : theme.stickyInk, true, cam.z);
      break;
    }
    case 'text':
      if (!editing) drawText(ctx, it, 0, 'left', it.fw ?? 400, theme.ink, false, cam.z);
      break;
    case 'frame': {
      ctx.fillStyle = theme.frame;
      ctx.strokeStyle = theme.line;
      ctx.lineWidth = 1 / cam.z;
      ctx.beginPath();
      ctx.roundRect(it.x, it.y, it.w, it.h, 6);
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
      drawIcon(ctx, it.icon ?? '', it.x, it.y, Math.min(it.w, it.h), ICON_COLORS[it.color ?? 'ink'] || theme.ink);
      break;
  }
}

function arrow(ctx: CanvasRenderingContext2D, a: Point, b: Point, color: string, width: number, dash: number[] = []) {
  const ang = Math.atan2(b.y - a.y, b.x - a.x), head = 10;
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = 'round';
  ctx.setLineDash(dash);
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x - Math.cos(ang) * head * 0.6, b.y - Math.sin(ang) * head * 0.6);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.beginPath();
  ctx.moveTo(b.x, b.y);
  ctx.lineTo(b.x - head * Math.cos(ang - 0.42), b.y - head * Math.sin(ang - 0.42));
  ctx.lineTo(b.x - head * Math.cos(ang + 0.42), b.y - head * Math.sin(ang + 0.42));
  ctx.closePath();
  ctx.fill();
}

function outline(ctx: CanvasRenderingContext2D, it: Item, z: number, color: string, dash: number[] = []) {
  const off = 3 / z;
  ctx.strokeStyle = color;
  ctx.lineWidth = 2 / z;
  ctx.setLineDash(dash.map((d) => d / z));
  ctx.strokeRect(it.x - off, it.y - off, it.w + off * 2, it.h + off * 2);
  ctx.setLineDash([]);
}

export function drawScene(ctx: CanvasRenderingContext2D, s: Scene): void {
  const { cam, theme, dpr } = s;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = theme.bg;
  ctx.fillRect(0, 0, s.width, s.height);

  // Dot grid, coarser as you zoom out so it never turns into noise.
  let step = 24;
  while (step * cam.z < 14) step *= 4;
  ctx.fillStyle = theme.dot;
  const sx0 = ((cam.x % (step * cam.z)) + step * cam.z) % (step * cam.z);
  const sy0 = ((cam.y % (step * cam.z)) + step * cam.z) % (step * cam.z);
  for (let x = sx0; x < s.width; x += step * cam.z)
    for (let y = sy0; y < s.height; y += step * cam.z) ctx.fillRect(Math.round(x) - 1, Math.round(y) - 1, 2, 2);

  ctx.setTransform(dpr * cam.z, 0, 0, dpr * cam.z, dpr * cam.x, dpr * cam.y);
  const view: Rect = { x: -cam.x / cam.z - 50, y: -cam.y / cam.z - 50, w: s.width / cam.z + 100, h: s.height / cam.z + 100 };

  for (const it of s.items) {
    const box = it.type === 'frame' ? { ...it, y: it.y - 40, h: it.h + 40 } : it;
    if (rectsIntersect(box, view)) drawItem(ctx, it, s);
  }

  for (const l of s.links) {
    const ends = linkEnds(l, s.get);
    if (ends) arrow(ctx, ends[0], ends[1], s.selection.has(l.id) ? theme.accent : theme.ink, (s.selection.has(l.id) ? 3 : 2));
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
    outline(ctx, it, cam.z, theme.accent);
    if (s.showHandle && s.editingId !== id) {
      const hs = HANDLE / cam.z, off = 3 / cam.z;
      ctx.fillStyle = theme.surface;
      ctx.strokeStyle = theme.accent;
      ctx.lineWidth = 2 / cam.z;
      ctx.beginPath();
      ctx.roundRect(it.x + it.w + off - hs / 2, it.y + it.h + off - hs / 2, hs, hs, 3 / cam.z);
      ctx.fill();
      ctx.stroke();
    }
  }

  if (s.linkPreview) {
    const { from, to, target } = s.linkPreview;
    if (target) outline(ctx, target, cam.z, theme.accent, [4, 4]);
    const end = target ? edgePoint(target, center(from)) : to;
    arrow(ctx, edgePoint(from, end), end, theme.accent, 2 / Math.max(cam.z, 0.5), [6, 6]);
  }

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  if (s.marquee) {
    const m = s.marquee;
    const x = m.x * cam.z + cam.x, y = m.y * cam.z + cam.y;
    ctx.fillStyle = theme.accent + '22';
    ctx.strokeStyle = theme.accent;
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
