import { useSyncExternalStore } from 'react';
import type { Item } from '../model/types';
import { readJSON, writeJSON } from '../storage';

/**
 * How new shapes come out (rectangles, ellipses, polygons), set under the gear of the shapes' panel and
 * kept per browser: their corners' rounding, an outline or none, a fill or none, the text in the middle
 * or at the top, and drawn square (Shift then frees them, as it squares them otherwise).
 */
export interface ShapeStyle { rad: number; stroke: boolean; noFill: boolean; center: boolean; square: boolean }

const KEY = 'planx-shape-style';
const DEFAULT: ShapeStyle = { rad: 4, stroke: false, noFill: false, center: false, square: false };
let style: ShapeStyle = { ...DEFAULT, ...readJSON<Partial<ShapeStyle>>(KEY) };
const listeners = new Set<() => void>();

export const shapeStyle = () => style;
export function setShapeStyle(patch: Partial<ShapeStyle>): void {
  style = { ...style, ...patch };
  writeJSON(KEY, style);
  listeners.forEach((fn) => fn());
}
export const useShapeStyle = () => useSyncExternalStore((fn) => { listeners.add(fn); return () => listeners.delete(fn); }, shapeStyle);

/** What a shape takes from the style: for a new one, all of it; for one already there, what's changed. */
export function shapePatch(type: Item['type'], s: Partial<ShapeStyle>): Partial<Item> {
  const p: Partial<Item> = {};
  if ('rad' in s && type !== 'ellipse') p.rad = Math.max(0, s.rad ?? 0);
  if ('stroke' in s) p.sc = s.stroke ? undefined : 'none';
  if ('noFill' in s && s.noFill) p.color = 'none';
  if ('center' in s) p.va = s.center ? undefined : 'top';
  return p;
}
