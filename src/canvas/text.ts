export const FONT_FAMILY = 'Onest, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
export const LINE_HEIGHT = 1.28;

export const font = (size: number, weight = 400): string => `${weight} ${size}px ${FONT_FAMILY}`;

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
  ctx: CanvasRenderingContext2D, text: string, maxWidth: number, maxHeight: number, size: number, weight = 400,
): TextLayout {
  let s = size;
  for (;;) {
    ctx.font = font(s, weight);
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
export function measureTextHeight(text: string, width: number, size: number, weight = 400): number {
  if (typeof document === 'undefined') return Math.ceil(size * LINE_HEIGHT);
  measureCtx ??= document.createElement('canvas').getContext('2d');
  if (!measureCtx) return Math.ceil(size * LINE_HEIGHT);
  const { lines, lineHeight } = layoutText(measureCtx, text || ' ', width, Infinity, size, weight);
  return Math.ceil(lines.length * lineHeight);
}
