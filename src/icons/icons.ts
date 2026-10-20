import data from './icons.json';

export interface IconPath { d: string; fill: string; opacity?: number; evenodd?: boolean }
export interface IconDef { id: string; en: string; ru: string; paths: IconPath[] }

/** The icon set, generated from assets/icons by `npm run icons`. */
export const ICONS = data as IconDef[];
export const ICON_BY_ID = new Map(ICONS.map((i) => [i.id, i]));

/** Icons are drawn on a 24×24 grid. */
const GRID = 24;
const pathCache = new Map<string, Path2D>();

/** Draws an icon scaled into the given square. "current" fills take `color`. */
export function drawIcon(ctx: CanvasRenderingContext2D, id: string, x: number, y: number, size: number, color: string): void {
  const icon = ICON_BY_ID.get(id);
  if (!icon) return;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(size / GRID, size / GRID);
  for (const p of icon.paths) {
    let path = pathCache.get(p.d);
    if (!path) { path = new Path2D(p.d); pathCache.set(p.d, path); }
    ctx.globalAlpha = p.opacity ?? 1;
    ctx.fillStyle = p.fill === 'current' ? color : p.fill;
    ctx.fill(path, p.evenodd ? 'evenodd' : 'nonzero');
  }
  ctx.restore();
}

export function searchIcons(query: string): IconDef[] {
  const q = query.trim().toLowerCase();
  if (!q) return ICONS;
  return ICONS.filter((i) => i.ru.toLowerCase().includes(q) || i.en.toLowerCase().includes(q) || i.id.includes(q));
}
