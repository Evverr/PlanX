import data from './icons.json';

/** `stroke` is a line width: the path is drawn as a line, `round` gives it round caps and joins. */
export interface IconPath { d: string; fill: string; opacity?: number; evenodd?: boolean; stroke?: number; round?: boolean }
/** `aliases` are the smaller sizes of the same icon, dropped from the set; boards that use them get this one. */
export interface IconDef { id: string; en: string; ru: string; paths: IconPath[]; aliases?: string[] }

/** The icon set, generated from assets/icons by `npm run icons`. */
export const ICONS = data as IconDef[];
export const ICON_BY_ID = new Map(ICONS.flatMap((i) => [i.id, ...(i.aliases ?? [])].map((id) => [id, i] as const)));

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
    const paint = p.fill === 'current' ? color : p.fill;
    if (p.stroke) {
      ctx.strokeStyle = paint;
      ctx.lineWidth = p.stroke;
      ctx.lineCap = p.round ? 'round' : 'butt';
      ctx.lineJoin = p.round ? 'round' : 'miter';
      ctx.stroke(path);
    } else {
      ctx.fillStyle = paint;
      ctx.fill(path, p.evenodd ? 'evenodd' : 'nonzero');
    }
  }
  ctx.restore();
}

export function searchIcons(query: string): IconDef[] {
  const q = query.trim().toLowerCase();
  if (!q) return ICONS;
  return ICONS.filter((i) => i.ru.toLowerCase().includes(q) || i.en.toLowerCase().includes(q) || i.id.includes(q));
}
