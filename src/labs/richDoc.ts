import { TEXT_COLORS, type Item } from '../model/types';
import { headingAt, setHeading, setRun, type RunStyle, type TextRun } from '../model/textLinks';
import { HEADING_GAP, HEADING_SIZE } from './docPage';

/**
 * «Документ» typed in as it looks (RichEditor.tsx): its text and the styles on its parts (model/textLinks.ts)
 * as the paragraphs and pieces of a field the browser edits, and back. Whatever the browser makes of it as
 * it's typed in (its own <b>, <i>, <font>, spans, line breaks), it's read back by how it looks: each piece
 * of text by its weight, slant, lines and colour as the page has them, each paragraph by its heading level.
 */

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
/** A colour of the text panel's as CSS ('#rrggbb' as it is). */
export const cssColor = (c: string) => (c.startsWith('#') ? c : TEXT_COLORS[c] || '');

/** A paragraph's look as a heading (or plain), as the page draws it. */
export function headingStyle(level: number, fs: number, first: boolean): string {
  const size = Math.round(fs * HEADING_SIZE[level]);
  return level ? `font-size:${size}px;font-weight:700;margin-top:${first ? 0 : Math.round(size * HEADING_GAP)}px` : '';
}

/** Its text as the field's HTML: a <div> a paragraph (data-h its level), a <span> a styled piece. */
export function toHtml(it: Item): string {
  const text = it.text ?? '', runs = (it.rs ?? []) as TextRun[], fs = it.fs ?? 16;
  let at = 0;
  return text.split('\n').map((para, n) => {
    const s0 = at, h = headingAt(text, runs, s0);
    at += para.length + 1;
    const cuts = [...new Set([0, para.length, ...runs.flatMap((r) => [r.s - s0, r.e - s0]).filter((c) => c > 0 && c < para.length)])].sort((a, b) => a - b);
    const inner = cuts.slice(0, -1).map((c, i) => {
      const e = cuts[i + 1], r = runs.filter((k) => !k.h && k.s <= s0 + c && k.e >= s0 + e).reduce((m, k) => ({ ...m, ...k }), {} as RunStyle);
      const css = [r.b && 'font-weight:700', r.i && 'font-style:italic', (r.u || r.x) && `text-decoration:${[r.u && 'underline', r.x && 'line-through'].filter(Boolean).join(' ')}`,
        r.c && `color:${cssColor(r.c)}`].filter(Boolean).join(';');
      const t = esc(para.slice(c, e));
      return css ? `<span style="${css}">${t}</span>` : t;
    }).join('');
    return `<div data-h="${h}" style="${headingStyle(h, fs, n === 0)}">${inner || '<br>'}</div>`;
  }).join('');
}

/** Pasted HTML (copied here, or from anywhere) as the field's own: paragraphs (a heading's level from
 *  <h1>…<h3> or a paragraph of ours), and in them only what a document has, bold, italic, underlined,
 *  struck through and coloured, by the tags or the inline styles it comes with; the rest (fonts, sizes,
 *  backgrounds, tables, pictures) left out, their text kept. */
export function cleanPaste(html: string, fs: number): string {
  const doc = new DOMParser().parseFromString(html, 'text/html'), out: string[] = [];
  let line = '', level = 0;
  const flush = () => { out.push(`<div data-h="${level}" style="${headingStyle(level, fs, !out.length)}">${line || '<br>'}</div>`); line = ''; level = 0; };
  const BLOCK = /^(DIV|P|LI|H[1-6]|TR|BLOCKQUOTE|PRE|UL|OL|TABLE|SECTION|ARTICLE)$/;
  const walk = (node: Node, st: { b?: boolean; i?: boolean; u?: boolean; x?: boolean; c?: string }) => {
    if (node.nodeType === Node.TEXT_NODE) {
      const t = esc((node.textContent ?? '').replace(/\s+/g, ' '));
      if (!t.trim() && !line) return;
      const css = [st.b && 'font-weight:700', st.i && 'font-style:italic', (st.u || st.x) && `text-decoration:${[st.u && 'underline', st.x && 'line-through'].filter(Boolean).join(' ')}`,
        st.c && `color:${st.c}`].filter(Boolean).join(';');
      line += css ? `<span style="${css}">${t}</span>` : t;
      return;
    }
    if (!(node instanceof HTMLElement)) return;
    const tag = node.tagName, s = node.style, next = { ...st };
    if (tag === 'BR') { flush(); return; }
    if (/^(SCRIPT|STYLE|IMG|SVG|VIDEO|IFRAME|HEAD|META)$/.test(tag)) return;
    if (tag === 'B' || tag === 'STRONG' || (parseInt(s.fontWeight) || (s.fontWeight === 'bold' ? 700 : 0)) >= 600) next.b = true;
    if (s.fontWeight && (parseInt(s.fontWeight) || 0) > 0 && parseInt(s.fontWeight) < 600) next.b = false;
    if (tag === 'I' || tag === 'EM' || s.fontStyle === 'italic') next.i = true;
    if (tag === 'U' || s.textDecoration.includes('underline') || s.textDecorationLine.includes('underline')) next.u = true;
    if (tag === 'S' || tag === 'STRIKE' || tag === 'DEL' || s.textDecoration.includes('line-through') || s.textDecorationLine.includes('line-through')) next.x = true;
    if (s.color) next.c = s.color;
    const block = BLOCK.test(tag), h = /^H([1-3])$/.exec(tag)?.[1] ?? (node.dataset.h && node.dataset.h !== '0' ? node.dataset.h : undefined);
    if (block && line) flush();
    if (h) level = Number(h);
    // (A heading's text bold as it is.)
    if (h) next.b = false;
    node.childNodes.forEach((c) => walk(c, next));
    if (block && (line || h)) flush();
  };
  walk(doc.body, {});
  if (line) flush();
  return out.join('');
}

/** '#rrggbb' of a CSS colour ('rgb(…)'), a key of TEXT_COLORS when it's one of them. */
function colorKey(css: string): string {
  const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(css);
  if (!m) return css;
  const hex = `#${[m[1], m[2], m[3]].map((v) => (+v).toString(16).padStart(2, '0')).join('')}`.toUpperCase();
  return Object.entries(TEXT_COLORS).find(([, v]) => v.toUpperCase() === hex)?.[0] ?? hex;
}

/** The text and its styles as the field has them now: `ink` the text's own colour (no colour of its own). */
export function fromDom(root: HTMLElement, ink: string): { text: string; rs: TextRun[] | undefined } {
  let text = '';
  const marks: Array<{ s: number; e: number; st: RunStyle }> = [], heads: Array<[number, number]> = [];
  const own = colorKey(ink);
  /** The look of a piece of text by the element it's in, up to its paragraph. */
  const look = (el: Element, para: Element, heading: boolean): RunStyle => {
    const cs = getComputedStyle(el), st: RunStyle = {};
    // (A heading's text is bold as it is: bold in it only beyond that.)
    if (!heading && (parseInt(cs.fontWeight) || 400) >= 600) st.b = true;
    if (cs.fontStyle === 'italic') st.i = true;
    for (let e: Element | null = el; e && e !== para.parentElement; e = e.parentElement) {
      const d = getComputedStyle(e).textDecorationLine;
      if (d.includes('underline') || e.tagName === 'U') st.u = true;
      if (d.includes('line-through') || e.tagName === 'S' || e.tagName === 'STRIKE') st.x = true;
    }
    const c = colorKey(cs.color);
    if (c !== own) st.c = c;
    return st;
  };
  const paras: Element[] = [];
  // (Text straight in the field, as when all of it was taken away and typed again: a paragraph of its own.)
  if ([...root.childNodes].some((n) => n.nodeType === Node.TEXT_NODE && n.textContent)) {
    const div = document.createElement('div');
    while (root.firstChild) div.appendChild(root.firstChild);
    root.appendChild(div);
  }
  for (const el of root.children) paras.push(el);
  paras.forEach((para, n) => {
    if (n > 0) text += '\n';
    const h = Number((para as HTMLElement).dataset.h) || 0, start = text.length;
    const walk = (node: Node) => {
      if (node.nodeType === Node.TEXT_NODE) {
        const t = (node.textContent ?? '').replace(/ /g, ' ');
        if (!t) return;
        const st = look(node.parentElement ?? para, para, h > 0);
        if (Object.keys(st).length) marks.push({ s: text.length, e: text.length + t.length, st });
        text += t;
      } else if (node.nodeName === 'BR') {
        // A line break inside a paragraph (Shift+Enter): a paragraph of its own; one at its end, nothing.
        if (node.nextSibling || (node.parentNode !== para && node.parentNode?.nextSibling)) text += '\n';
      } else if (node.nodeName === 'DIV' || node.nodeName === 'P') {
        if (text.length > start && !text.endsWith('\n')) text += '\n';
        node.childNodes.forEach(walk);
      } else node.childNodes.forEach(walk);
    };
    para.childNodes.forEach(walk);
    if (h) heads.push([start, h]);
  });
  let rs: TextRun[] | undefined;
  for (const m of marks) for (const [k, v] of Object.entries(m.st)) rs = setRun(rs, m.s, m.e, k as keyof RunStyle, true, v as string | number);
  for (const [at, h] of heads) rs = setHeading(text, rs, at, at, h);
  return { text, rs };
}
