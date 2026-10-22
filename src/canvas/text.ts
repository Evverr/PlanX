import { baseWeight, DEFAULTS, type Item, type ListKind } from '../model/types';
import { TASK_INSET } from './geometry';

export const FONT_FAMILY = 'Onest, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
export const LINE_HEIGHT = 1.28;

/** Fonts for text on the board, all with Cyrillic, loaded from Google Fonts in index.html. */
export const FONTS: Record<string, { label: string; css: string }> = {
  onest: { label: 'Onest', css: FONT_FAMILY },
  inter: { label: 'Inter', css: 'Inter, system-ui, sans-serif' },
  montserrat: { label: 'Montserrat', css: 'Montserrat, system-ui, sans-serif' },
  serif: { label: 'PT Serif', css: '"PT Serif", Georgia, serif' },
  mono: { label: 'JetBrains Mono', css: '"JetBrains Mono", ui-monospace, monospace' },
  hand: { label: 'Caveat', css: 'Caveat, cursive' },
};

export interface FontStyle { weight?: number; family?: string; italic?: boolean }

export const font = (size: number, weight = 400, family = 'onest', italic = false): string =>
  `${italic ? 'italic ' : ''}${weight} ${size}px ${FONTS[family]?.css ?? FONT_FAMILY}`;

export const fontOf = (it: Item): FontStyle => ({ weight: it.fw ?? baseWeight(it.type), family: it.ff, italic: it.fi });

/** The text as drawn: in a list, each paragraph starts with a bullet or its number. */
export function withList(text: string, list?: ListKind): string {
  if (!list) return text;
  return text.split('\n').map((p, i) => (list === 'bullet' ? '•  ' : `${i + 1}. `) + p).join('\n');
}

type Measure = (s: string) => number;

/** Breaks text into lines no wider than maxWidth, splitting words that do not fit on their own. */
export function wrapText(text: string, maxWidth: number, measure: Measure): string[] {
  const lines: string[] = [];
  for (const para of text.split('\n')) {
    let line = '';
    // Spaces are their own tokens; a hyphenated word may break after its hyphen.
    const tokens = para.split(/(\s+)/).flatMap((t) => (/^\s+$/.test(t) ? [t] : t.split(/(?<=-)/))).filter(Boolean);
    for (const tok of tokens) {
      if (measure((line + tok).trimEnd()) <= maxWidth) { line += tok; continue; }
      if (/^\s+$/.test(tok)) { lines.push(line.trimEnd()); line = ''; continue; }
      if (line.trim()) lines.push(line.trimEnd());
      line = '';
      for (const ch of tok) {
        if (line && measure(line + ch) > maxWidth) { lines.push(line); line = ''; }
        line += ch;
      }
    }
    lines.push(line.trimEnd());
  }
  return lines;
}

export interface TextLayout { lines: string[]; size: number; lineHeight: number }

/**
 * Lays text out in a box, shrinking the font until it fits (how stickers behave in Miro).
 * Pass maxHeight = Infinity to never shrink.
 */
export function layoutText(
  ctx: CanvasRenderingContext2D, text: string, maxWidth: number, maxHeight: number, size: number, style: FontStyle = {},
): TextLayout {
  let s = size;
  for (;;) {
    ctx.font = font(s, style.weight, style.family, style.italic);
    const lines = wrapText(text, maxWidth, (t) => ctx.measureText(t).width);
    const lh = s * LINE_HEIGHT;
    // In a fixed box, shrink rather than split a word across lines.
    const wordTooWide = maxHeight !== Infinity &&
      text.split(/\s+|(?<=-)/).some((w) => ctx.measureText(w).width > maxWidth);
    if ((lines.length * lh <= maxHeight && !wordTooWide) || s <= 7) return { lines, size: s, lineHeight: lh };
    s = Math.max(7, Math.floor(s * 0.9));
  }
}

let measureCtx: CanvasRenderingContext2D | null = null;

/** Height a text item needs at its width, used to keep its box in step with its content. */
export function measureTextHeight(text: string, width: number, size: number, style: FontStyle = {}): number {
  if (typeof document === 'undefined') return Math.ceil(size * LINE_HEIGHT);
  measureCtx ??= document.createElement('canvas').getContext('2d');
  if (!measureCtx) return Math.ceil(size * LINE_HEIGHT);
  const { lines, lineHeight } = layoutText(measureCtx, text || ' ', width, Infinity, size, style);
  return Math.ceil(lines.length * lineHeight);
}

/** Height a text item needs with its own font, size and list, optionally with other text or width. */
export const itemTextHeight = (it: Item, text = it.text ?? '', width = it.w): number =>
  measureTextHeight(withList(text || ' ', it.ls), width, it.fs ?? 20, fontOf(it));

/** Height a task needs: its lines beside the checkbox plus 8 above and below, at least its usual height. */
export const taskHeight = (it: Item, text = it.text ?? '', width = it.w): number =>
  Math.max(DEFAULTS.task.h, measureTextHeight(withList(text || ' ', it.ls), width - TASK_INSET - 16, it.fs ?? 16, fontOf(it)) + 16);

/** Height a text item or task needs for its text; other items have none to fit. */
export const fitHeight = (it: Item, text = it.text ?? '', width = it.w): number | null =>
  it.type === 'text' ? itemTextHeight(it, text, width) : it.type === 'task' ? taskHeight(it, text, width) : null;
