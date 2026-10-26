import type { Editor } from '../editor/editor';
import { fileName, saveFile } from '../files';
import type { Item, Link } from '../model/types';
import { boundsOf } from '../canvas/geometry';
import { drawScene, readTheme, type Theme } from '../canvas/renderer';

/** "Экспорт в PNG": the board, or what's selected, drawn into a picture and saved. */
export type Background = 'board' | 'white' | 'none';
export interface ExportOptions { what: 'all' | 'selection'; scale: number; bg: Background }

/** Room left round what's drawn, in board units; the picture's longest side and most pixels. */
const PAD = 32, MAX_SIDE = 8192, MAX_PIXELS = 40e6;

/** What goes in the picture: everything in sight, or the selection with what its frames hold. */
export function exportItems(ed: Editor, what: ExportOptions['what']): { items: Item[]; links: Link[] } {
  const shown = ed.shown();
  const ids = what === 'all' ? new Set(shown.map((i) => i.id)) : new Set(ed.carried(ed.selectedItems()).keys());
  const items = shown.filter((i) => ids.has(i.id));
  return { items, links: ed.shownLinks().filter((l) => ids.has(l.from) && ids.has(l.to)) };
}

/** The light theme's colours whatever the screen shows, for a picture on white. */
function lightTheme(): Theme {
  const root = document.documentElement, was = root.dataset.theme;
  if (was === 'light') return readTheme();
  root.dataset.theme = 'light';
  const theme = readTheme();
  root.dataset.theme = was;
  return theme;
}

/** Draws the picture; `fit` instead makes it fit in a box that size (for the preview). Null when
 *  there's nothing to draw. */
export function renderPicture(ed: Editor, opts: ExportOptions, fit?: { w: number; h: number }): HTMLCanvasElement | null {
  const { items, links } = exportItems(ed, opts.what);
  const b = boundsOf(items);
  if (!b) return null;
  const bw = b.w + PAD * 2, bh = b.h + PAD * 2;
  let z = fit ? Math.min(fit.w / bw, fit.h / bh) : opts.scale;
  z = Math.min(z, MAX_SIDE / bw, MAX_SIDE / bh, Math.sqrt(MAX_PIXELS / (bw * bh)));
  const w = Math.max(1, Math.round(bw * z)), h = Math.max(1, Math.round(bh * z));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  if (opts.bg === 'white') { ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h); }
  const byId = new Map(items.map((i) => [i.id, i]));
  drawScene(ctx, {
    items, links, get: (id) => byId.get(id) ?? ed.board.get(id),
    cam: { x: (PAD - b.x) * z, y: (PAD - b.y) * z, z },
    theme: opts.bg === 'white' ? lightTheme() : readTheme(), width: w, height: h, dpr: 1,
    noBackground: opts.bg !== 'board', selection: new Set(), editingId: null, marquee: null, linkPreview: null, peers: [],
    showHandle: false, byFinger: false, hotDot: null, hotPlus: null, plusFade: 0, mindMove: null, tableLines: [], editingCell: null,
    guides: [], pickedCells: null, stroke: null,
  });
  return canvas;
}

/** The size the picture comes out at, in pixels. */
export function pictureSize(ed: Editor, opts: ExportOptions): { w: number; h: number } | null {
  const b = boundsOf(exportItems(ed, opts.what).items);
  if (!b) return null;
  const bw = b.w + PAD * 2, bh = b.h + PAD * 2;
  const z = Math.min(opts.scale, MAX_SIDE / bw, MAX_SIDE / bh, Math.sqrt(MAX_PIXELS / (bw * bh)));
  return { w: Math.round(bw * z), h: Math.round(bh * z) };
}

/** Saves the picture as a PNG file named after the board. */
export function downloadPicture(ed: Editor, opts: ExportOptions): Promise<boolean> {
  const canvas = renderPicture(ed, opts);
  if (!canvas) return Promise.resolve(false);
  return new Promise((resolve) => canvas.toBlob((blob) => {
    if (blob) saveFile(blob, fileName(ed, 'png'));
    resolve(!!blob);
  }, 'image/png'));
}
