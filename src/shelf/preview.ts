import type { Board } from '../model/board';
import { boundsOf } from '../canvas/geometry';
import { drawScene, readTheme } from '../canvas/renderer';
import { hiddenIn, linksIn, stacked } from '../editor/frames';

/** The board's tile on the shelf: this many pixels a side (twice the tile, for sharp screens). */
const SIZE = 360, PAD = 22;

/**
 * Everything on the board, fitted into a square on the panels' colour: what the board's tile shows,
 * so it can be told from the others at a glance. Null for an empty board.
 */
export function previewOf(board: Board): string | null {
  const all = board.list(), hidden = hiddenIn(board, all);
  const items = stacked(board, hidden.size ? all.filter((i) => !hidden.has(i.id)) : all);
  const b = boundsOf(items);
  if (!b) return null;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = SIZE;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  const theme = readTheme();
  ctx.fillStyle = theme.surface || '#fff';
  ctx.fillRect(0, 0, SIZE, SIZE);
  // Small boards aren't blown up past their real size.
  const z = Math.min((SIZE - PAD * 2) / Math.max(b.w, 1), (SIZE - PAD * 2) / Math.max(b.h, 1), 1);
  drawScene(ctx, {
    items, links: linksIn(board, all, hidden), get: (id) => board.get(id),
    cam: { x: (SIZE - b.w * z) / 2 - b.x * z, y: (SIZE - b.h * z) / 2 - b.y * z, z },
    theme, width: SIZE, height: SIZE, dpr: 1,
    noBackground: true, selection: new Set(), editingId: null, marquee: null, linkPreview: null, peers: [],
    showHandle: false, byFinger: false, hotDot: null, hotPlus: null, plusFade: 0, mindMove: null, tableLines: [], editingCell: null,
    guides: [], pickedCells: null, stroke: null,
  });
  try { return canvas.toDataURL('image/webp', 0.8); } catch { return null; }
}
