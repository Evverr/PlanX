import type { PolyShape } from '../model/types';
import { readJSON } from '../storage';

export type Tool = 'select' | 'hand' | 'sticky' | 'text' | 'rect' | 'ellipse' | 'link' | 'frame' | 'pen' | 'marker' | 'eraser' | 'task' | 'table' | 'mind' | 'timeline' | 'comment' | PolyShape;
export type PenTool = 'pen' | 'marker';
export const DRAW_TOOLS: Tool[] = ['pen', 'marker', 'eraser'];
/** Tools that draw a figure by dragging out its box; the polygons are one item type with a `shape`. */
export const SHAPE_TOOLS: Tool[] = ['rect', 'ellipse', 'triangle', 'rhombus', 'pentagon', 'star'];
export const isPoly = (t: Tool): t is PolyShape => ['triangle', 'rhombus', 'pentagon', 'star', 'hexagon', 'parallelogram', 'trapezoid', 'arrow', 'cross'].includes(t);

/** What a new mind map's central topic says until it's typed over. */
export const MIND_TOPIC = 'Центральная тема';

/** A pen's colour (a key of INK_COLORS or '#rrggbb') and line width in screen pixels at the zoom it's drawn at. */
export interface InkStyle { color: string; size: number; op?: number }
/** Each pen has three presets, as in Miro; `active` is the one it draws with. */
export interface PenSet { presets: InkStyle[]; active: number }
export type Pens = Record<PenTool, PenSet>;

export const INK_SIZES: Record<PenTool, number[]> = { pen: [2, 4, 8, 14], marker: [12, 20, 32, 48] };
export const DEFAULT_PENS: Pens = {
  pen: { presets: [{ color: 'ink', size: 2 }, { color: 'red', size: 4 }, { color: 'blue', size: 8 }], active: 0 },
  marker: { presets: [{ color: 'yellow', size: 20 }, { color: 'green', size: 20 }, { color: 'pink', size: 20 }], active: 0 },
};
export const PENS_KEY = 'planx-pens';

/** The pens as this browser keeps them, or as by default. */
export function readPens(): Pens {
  const saved = readJSON<Pens>(PENS_KEY);
  return saved?.pen?.presets?.length && saved.marker?.presets?.length ? saved : DEFAULT_PENS;
}
