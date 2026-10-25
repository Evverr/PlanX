import type { Editor } from '../editor/editor';
import { fileName, renderPicture, saveFile, type ExportOptions } from './exportPng';

/**
 * "Экспорт в PDF": the same picture as "Экспорт в PNG" (on white or the board's background, as there's
 * nothing see-through in it), on a single page as big as what's drawn at the board's own size (96 to
 * the inch), the picture's pixels as sharp as the quality picked.
 */

/** The largest a PDF page may be on a side, in points. */
const MAX_PAGE = 14400;

/** A PDF of one page `pageW` × `pageH` points with a JPEG picture `w` × `h` pixels filling it. */
export function pdfOf(jpeg: Uint8Array, w: number, h: number, pageW: number, pageH: number): Uint8Array {
  const enc = new TextEncoder(), parts: Uint8Array[] = [], offsets: number[] = [];
  let at = 0;
  const put = (b: Uint8Array | string) => { const u = typeof b === 'string' ? enc.encode(b) : b; parts.push(u); at += u.length; };
  const obj = (n: number, dict: string, stream?: Uint8Array) => {
    offsets[n] = at;
    put(`${n} 0 obj\n${dict}\n`);
    if (stream) { put('stream\n'); put(stream); put('\nendstream\n'); }
    put('endobj\n');
  };
  const pw = +pageW.toFixed(2), ph = +pageH.toFixed(2), draw = enc.encode(`q ${pw} 0 0 ${ph} 0 0 cm /Im0 Do Q`);
  put('%PDF-1.4\n');
  obj(1, '<< /Type /Catalog /Pages 2 0 R >>');
  obj(2, '<< /Type /Pages /Kids [3 0 R] /Count 1 >>');
  obj(3, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pw} ${ph}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>`);
  obj(4, `<< /Type /XObject /Subtype /Image /Width ${w} /Height ${h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>`, jpeg);
  obj(5, `<< /Length ${draw.length} >>`, draw);
  // Where each object starts, 20 bytes a line, and where that table starts.
  const xref = at;
  put(`xref\n0 6\n0000000000 65535 f \n${offsets.slice(1).map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}`);
  put(`trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
  const out = new Uint8Array(at);
  let i = 0;
  for (const p of parts) { out.set(p, i); i += p.length; }
  return out;
}

/** Saves the board, or what's selected, as a PDF file named after the board. */
export async function downloadPdf(ed: Editor, opts: ExportOptions): Promise<boolean> {
  const canvas = renderPicture(ed, { ...opts, bg: opts.bg === 'none' ? 'white' : opts.bg });
  if (!canvas) return false;
  const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/jpeg', 0.92));
  if (!blob) return false;
  // The board's own size, at 72 points to 96 pixels; a huge one shrunk to fit a page.
  let pw = (canvas.width / opts.scale) * 0.75, ph = (canvas.height / opts.scale) * 0.75;
  const k = Math.min(1, MAX_PAGE / pw, MAX_PAGE / ph);
  pw *= k; ph *= k;
  const pdf = pdfOf(new Uint8Array(await blob.arrayBuffer()), canvas.width, canvas.height, pw, ph);
  saveFile(new Blob([pdf], { type: 'application/pdf' }), fileName(ed, 'pdf'));
  return true;
}
