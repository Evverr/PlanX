import type { Editor } from '../editor/editor';
import { PAGE, type Item } from '../model/types';
import { headingAt, paraAt, type TextRun } from '../model/textLinks';
import { drawScene } from '../canvas/renderer';
import { fileName, saveFile } from '../files';
import { pdfOfPages } from './exportPdf';
import { lightTheme } from './exportPng';
import { pagesOf, showPage } from './docPage';

/**
 * «Документ» (docPage.ts) saved as a file: Markdown (its styles as Markdown has them: bold **, italic *,
 * struck through ~~, underlined as <u>; colours left out; each line a paragraph), or a PDF of its pages,
 * each an A4 page as the sheet shows it.
 */

/** Its text in Markdown. */
export function docMarkdown(it: Item): string {
  const text = it.text ?? '', runs = (it.rs ?? []) as TextRun[];
  const cuts = [...new Set([0, text.length, ...runs.flatMap((r) => [r.s, r.e])])].filter((c) => c >= 0 && c <= text.length).sort((a, b) => a - b);
  let out = '';
  for (let i = 0; i + 1 < cuts.length; i++) {
    const piece = text.slice(cuts[i], cuts[i + 1]), r = runs.find((k) => k.s <= cuts[i] && k.e >= cuts[i + 1]);
    // A styled piece a line at a time (the marks don't run across lines), its spaces outside them.
    out += piece.split('\n').map((line) => {
      const m = /^(\s*)(.*?)(\s*)$/.exec(line)!;
      if (!r || !m[2]) return line;
      let core = m[2];
      if (r.u) core = `<u>${core}</u>`;
      if (r.x) core = `~~${core}~~`;
      if (r.i) core = `*${core}*`;
      if (r.b) core = `**${core}**`;
      return m[1] + core + m[3];
    }).join('\n');
  }
  // Each paragraph on its own, a heading's after its #s.
  let at = 0;
  const paras = text.split('\n').map((p) => { const k = { h: headingAt(text, runs, at), l: paraAt(text, runs, at, 'l') }; at += p.length + 1; return k; });
  // A list's items one under another (numbered from 1 as they follow one another), the rest a blank line apart.
  let n = 0;
  return out.split('\n').map((p, i) => {
    const { h, l } = paras[i];
    n = l === 'number' ? n + 1 : 0;
    const line = h && p.trim() ? `${'#'.repeat(h)} ${p.replace(/^\*\*(.*)\*\*$/, '$1')}` : l ? `${l === 'number' ? `${n}.` : '-'} ${p}` : p;
    return i === 0 ? line : `${l && paras[i - 1].l ? '\n' : '\n\n'}${line}`;
  }).join('') + '\n';
}

/** Saves it as Markdown, named after its first line. */
export function saveMarkdown(ed: Editor, it: Item): void {
  saveFile(new Blob([docMarkdown(it)], { type: 'text/markdown' }), fileName(ed, 'md', titleOf(it)));
}

/** Saves it as a PDF, a page of A4 for each of its pages, at twice the board's size for sharpness. */
export async function savePdf(ed: Editor, it: Item): Promise<void> {
  const scale = 2, pages = pagesOf(it), out: Array<{ jpeg: Uint8Array; w: number; h: number }> = [];
  for (let n = 0; n < pages.length; n++) {
    const canvas = document.createElement('canvas');
    canvas.width = PAGE.W * scale;
    canvas.height = PAGE.H * scale;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    const sheet = { ...it, x: 0, y: 0 }, was = showPage(it.id, n);
    drawScene(ctx, {
      items: [sheet], links: [], get: (id) => (id === it.id ? sheet : ed.board.get(id)), cam: { x: 0, y: 0, z: scale }, theme: lightTheme(),
      width: canvas.width, height: canvas.height, dpr: 1, noBackground: true, selection: new Set(), editingId: null, marquee: null, linkPreview: null,
      peers: [], showHandle: false, byFinger: false, hotDot: null, hotPlus: null, plusFade: 0, mindMove: null, tableLines: [], editingCell: null,
      guides: [], pickedCells: null, stroke: null,
    });
    showPage(it.id, was);
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/jpeg', 0.92));
    if (!blob) return;
    out.push({ jpeg: new Uint8Array(await blob.arrayBuffer()), w: canvas.width, h: canvas.height });
  }
  // A4 in points.
  saveFile(new Blob([pdfOfPages(out, 595.28, 841.89)], { type: 'application/pdf' }), fileName(ed, 'pdf', titleOf(it)));
}

/** A name for its file: its first line, or «Документ». */
const titleOf = (it: Item) => (it.text ?? '').split('\n').find((l) => l.trim())?.trim().slice(0, 60) || 'Документ';
