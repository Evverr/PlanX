import type { Item } from './types';
import { FILLS } from './types';
import { nodeColors } from './mind';

/** How light a '#rrggbb' colour looks, 0 (black) to 1 (white): its relative luminance. */
export function luminance(hex: string): number {
  const n = parseInt(hex.slice(1, 7), 16);
  const [r, g, b] = [16, 8, 0].map((sh) => {
    const v = ((n >> sh) & 255) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Whether text on this colour reads better white than dark (past where both read alike). */
export const isDark = (hex: string): boolean => luminance(hex) < 0.179;

/** The colour an item's text sits on: its fill, when it has one solid enough to matter. */
export function fillUnder(it: Item, tints: Map<string, { color?: string; fill?: string }> = new Map()): string | null {
  if ((it.fo ?? 1) < 0.5) return null;
  const c = it.type === 'mind' ? nodeColors(it, tints).fill : ['sticky', 'rect', 'ellipse', 'polygon', 'task'].includes(it.type) ? it.color : null;
  if (!c || c === 'none') return null;
  return c.startsWith('#') ? c : FILLS[c] ?? null;
}

/** The text colour an item takes by itself, with none given it: white on a dark fill, else its usual (null). */
export function autoInk(it: Item, tints?: Map<string, { color?: string; fill?: string }>): string | null {
  if (it.tc) return null;
  const bg = fillUnder(it, tints);
  return bg && isDark(bg) ? '#FFFFFF' : null;
}
