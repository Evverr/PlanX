import { readPictures, type Picture } from '../canvas/pictures';
import { labOn } from './labs';

/**
 * Word documents on the board ("Документы Word"): a .docx goes on it as a picture of its first page,
 * the file itself kept in the item (`doc`, a data URL, and its name `dn`) so it syncs like a picture
 * does; a double click opens it whole, read only (DocViewer.tsx). Drawn by docx-preview, loaded only
 * when a document is.
 */

/** Biggest file taken; a document is sent to everyone on the board, so it stays a few MB at most. */
export const MAX_DOC_MB = 10;

export const isDocx = (f: File) => /\.docx$/i.test(f.name) || f.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

/** Pictures and (with the feature on) Word documents among a drop or a file picker's choice;
 *  `onTooBig` hears of documents left out for their size. */
export async function readFiles(files: Iterable<File>, onTooBig?: (name: string) => void): Promise<Picture[]> {
  const all = [...files];
  const docs = labOn('docx') ? all.filter(isDocx) : [];
  const fit = docs.filter((f) => f.size <= MAX_DOC_MB * 1024 * 1024 || (onTooBig?.(f.name), false));
  const [pics, read] = await Promise.all([readPictures(all), Promise.allSettled(fit.map(readDoc))]);
  return [...pics, ...read.flatMap((r) => (r.status === 'fulfilled' ? [r.value] : []))];
}

/** A document whole, as pages in `into` (its styles too); with `wrapped`, on a grey backing. */
export async function renderDoc(data: Blob, into: HTMLElement, wrapped = true): Promise<void> {
  const { renderAsync } = await import('docx-preview');
  into.replaceChildren();
  await renderAsync(data, into, undefined, { className: 'docx', inWrapper: wrapped, useBase64URL: true, breakPages: true, experimental: true });
}

/** The file back from its item's data URL. */
export const docBlob = async (src: string): Promise<Blob> => (await fetch(src)).blob();

const asDataUrl = (f: Blob) => new Promise<string>((resolve, reject) => {
  const r = new FileReader();
  r.onload = () => resolve(r.result as string);
  r.onerror = () => reject(r.error);
  r.readAsDataURL(f);
});

/** Width the first page's picture is kept at. */
const THUMB_W = 800;

/** A .docx read into a picture of its first page, carrying the file. */
async function readDoc(file: File): Promise<Picture> {
  const host = document.createElement('div');
  host.style.cssText = 'position:fixed;left:-20000px;top:0;pointer-events:none;';
  document.body.append(host);
  try {
    await renderDoc(file, host, false);
    const page = host.querySelector<HTMLElement>('section.docx');
    if (!page) throw new Error('no page');
    const w = page.offsetWidth || 794;
    // The first page; a short one as long as it is, but never shorter than half a sheet.
    const h = Math.max(Math.round(w * 0.7), Math.min(page.offsetHeight || w * 1.414, Math.round(w * 1.414)));
    let src: string;
    try { src = await pagePicture(host, page, w, h); } catch { src = textPicture(file.name, page.innerText, w, h); }
    const k = THUMB_W / w;
    return { src, w: THUMB_W, h: Math.round(h * k), doc: await asDataUrl(file), dn: file.name };
  } finally {
    host.remove();
  }
}

/** The page as it looks, drawn through an SVG. Safari won't let a canvas give such a drawing back
 *  (it throws), and textPicture is used there. */
async function pagePicture(host: HTMLElement, page: HTMLElement, w: number, h: number): Promise<string> {
  const box = document.createElement('div');
  box.setAttribute('style', `width:${w}px;height:${h}px;overflow:hidden;background:#fff;`);
  host.querySelectorAll('style').forEach((s) => box.append(s.cloneNode(true)));
  const clone = page.cloneNode(true) as HTMLElement;
  clone.style.margin = '0';
  clone.style.boxShadow = 'none';
  box.append(clone);
  const xhtml = new XMLSerializer().serializeToString(box);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><foreignObject width="100%" height="100%">${xhtml}</foreignObject></svg>`;
  const img = new Image();
  img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  await img.decode();
  const k = THUMB_W / w;
  const canvas = document.createElement('canvas');
  canvas.width = THUMB_W;
  canvas.height = Math.round(h * k);
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  badge(ctx, canvas.width);
  return canvas.toDataURL('image/webp', 0.85);
}

/** A plain page instead: the file's name and the first page's text. */
function textPicture(name: string, text: string, w: number, h: number): string {
  const k = THUMB_W / w;
  const canvas = document.createElement('canvas');
  canvas.width = THUMB_W;
  canvas.height = Math.round(h * k);
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const pad = 72, maxW = canvas.width - pad * 2;
  let y = pad + 30;
  ctx.fillStyle = '#1f2328';
  ctx.font = '700 30px Inter, system-ui, sans-serif';
  y = wrap(ctx, name.replace(/\.docx$/i, ''), pad, y, maxW, 40, 3) + 24;
  ctx.fillStyle = '#444';
  ctx.font = '400 20px Inter, system-ui, sans-serif';
  for (const para of text.split(/\n+/).map((s) => s.trim()).filter(Boolean)) {
    if (y > canvas.height - pad) break;
    y = wrap(ctx, para, pad, y, maxW, 30, Math.floor((canvas.height - pad - y) / 30) + 1) + 12;
  }
  badge(ctx, canvas.width);
  return canvas.toDataURL('image/webp', 0.85);
}

/** Writes `text` in lines up to `maxW` wide, at most `lines` of them; where the next line would go. */
function wrap(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, maxW: number, lh: number, lines: number): number {
  let line = '', n = 0;
  for (const word of text.split(/\s+/)) {
    const next = line ? `${line} ${word}` : word;
    if (line && ctx.measureText(next).width > maxW) {
      if (++n >= lines) { ctx.fillText(line + '…', x, y); return y + lh; }
      ctx.fillText(line, x, y);
      y += lh;
      line = word;
    } else line = next;
  }
  if (line) { ctx.fillText(line, x, y); y += lh; }
  return y;
}

/** A blue "DOCX" tag in the page's top right corner, to tell it from a picture. */
function badge(ctx: CanvasRenderingContext2D, w: number): void {
  ctx.fillStyle = '#2B579A';
  ctx.beginPath();
  ctx.roundRect(w - 118, 18, 100, 40, 8);
  ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.font = '700 20px Inter, system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('DOCX', w - 68, 39);
  ctx.textAlign = 'start';
  ctx.textBaseline = 'alphabetic';
}

/* ---------- opening ---------- */

const DOC_EVENT = 'planx-open-doc';

/** Opens the document in an item whole (DocViewer listens). */
export function openDoc(id: string): void {
  window.dispatchEvent(new CustomEvent(DOC_EVENT, { detail: id }));
}

export function onOpenDoc(fn: (id: string) => void): () => void {
  const h = (e: Event) => fn((e as CustomEvent<string>).detail);
  window.addEventListener(DOC_EVENT, h);
  return () => window.removeEventListener(DOC_EVENT, h);
}
