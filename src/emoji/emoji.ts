import { EMOJI_FRAMES } from './frames';

/** Emoji set: the PNGs in assets/emoji (emoji-0.png … emoji-80.png), drawn on the board as pictures. */
const URLS = import.meta.glob<string>('../../assets/emoji/*.png', { eager: true, query: '?url', import: 'default' });

export interface EmojiDef { id: string; url: string }

export const EMOJI: EmojiDef[] = Object.entries(URLS)
  .map(([path, url]) => ({ id: path.match(/(emoji-\d+)\.png$/)![1], url }))
  .sort((a, b) => Number(a.id.slice(6)) - Number(b.id.slice(6)));

const URL_BY_ID = new Map(EMOJI.map((e) => [e.id, e.url]));
export const emojiUrl = (id: string): string | undefined => URL_BY_ID.get(id);

/** Cats for people's avatars: yours is the smiling one, everyone else gets one of the others by their id. */
const CATS = ['emoji-66', 'emoji-68', 'emoji-69', 'emoji-70', 'emoji-71'];
export const catFor = (peerId?: number): string => emojiUrl(peerId === undefined ? 'emoji-67' : CATS[peerId % CATS.length]) ?? '';
const listeners = new Set<() => void>();

/** Called whenever another emoji picture is ready, so the board and the picker can redraw. */
export function onEmojiLoad(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/**
 * The pictures have margins of their own, all different. Each is cut to what's drawn in it, kept as
 * a canvas (for the board) and as a data URL (for the picker), once it has loaded, and then laid in
 * the box it has in its container in the Figma set (see emojiRect).
 */
const trimmed = new Map<string, { canvas: HTMLCanvasElement; url: string }>();
const loading = new Set<string>();

function load(id: string): void {
  const url = URL_BY_ID.get(id);
  if (!url || loading.has(id) || typeof document === 'undefined') return;
  loading.add(id);
  const img = new Image();
  img.onload = () => {
    const canvas = trim(img);
    trimmed.set(id, { canvas, url: canvas.toDataURL('image/png') });
    listeners.forEach((fn) => fn());
  };
  img.src = url;
}

/** The picture cut to the box of its pixels that aren't (nearly) see-through. */
function trim(img: HTMLImageElement): HTMLCanvasElement {
  const w = img.naturalWidth, h = img.naturalHeight, src = document.createElement('canvas');
  src.width = w; src.height = h;
  const sc = src.getContext('2d')!;
  sc.drawImage(img, 0, 0);
  const a = sc.getImageData(0, 0, w, h).data;
  let x1 = w, y1 = h, x2 = -1, y2 = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (a[(y * w + x) * 4 + 3] > 16) { if (x < x1) x1 = x; if (x > x2) x2 = x; if (y < y1) y1 = y; if (y > y2) y2 = y; }
  }
  if (x2 < 0) return src;
  const bw = x2 - x1 + 1, bh = y2 - y1 + 1, out = document.createElement('canvas');
  out.width = bw;
  out.height = bh;
  out.getContext('2d')!.drawImage(src, x1, y1, bw, bh, 0, 0, bw, bh);
  return out;
}

/** The picture to show for an emoji: cut to size once ready, the file as it is till then. */
export function emojiSrc(id: string): string | undefined {
  load(id);
  return trimmed.get(id)?.url ?? URL_BY_ID.get(id);
}

/**
 * Where an emoji's picture goes in a square of `size` at (x, y): in the box it has in its 34×34
 * container in the Figma set, the picture (cut to what's drawn) fitted into that box and centred.
 * Something sticking out past the container goes past the square too, as in Figma.
 */
export function emojiRect(id: string, x: number, y: number, size: number): { x: number; y: number; w: number; h: number } {
  const [fx, fy, fw, fh] = EMOJI_FRAMES[id] ?? [0, 0, 34, 34], k = size / 34;
  const c = trimmed.get(id)?.canvas, aspect = c ? c.width / c.height : fw / fh;
  const w = Math.min(fw, fh * aspect) * k, h = Math.min(fh, fw / aspect) * k;
  return { x: x + fx * k + (fw * k - w) / 2, y: y + fy * k + (fh * k - h) / 2, w, h };
}

/** Draws the emoji in the square at (x, y), as it lies in the Figma set; nothing until its picture is ready. */
export function drawEmoji(ctx: CanvasRenderingContext2D, id: string, x: number, y: number, size: number): void {
  load(id);
  const pic = trimmed.get(id);
  if (!pic) return;
  const r = emojiRect(id, x, y, size);
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(pic.canvas, r.x, r.y, r.w, r.h);
}
