import { doodle } from './doodles';
import type { Item } from '../model/types';

/**
 * Pictures put on the board. Each is kept in its item as a data URL (so it syncs with the board
 * like everything else) and drawn from a cache of loaded images, keyed by item.
 */
const images = new Map<string, { src: string; img: HTMLImageElement | HTMLCanvasElement }>();
const listeners = new Set<() => void>();

/** The picture being cut ("Кроп картинки", src/labs): drawn whole, with no rounding. */
let plain: string | null = null;
export const setPlainPicture = (id: string | null) => { plain = id; };

/** Called whenever another picture finishes loading, so the board can redraw. */
export function onPictureLoad(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Draws the picture stretched over the item, its corners rounded by its `rad`; a plain box until it has loaded. */
export function drawPicture(ctx: CanvasRenderingContext2D, it: Item, placeholder: string): void {
  // A game sticker, with its white outline.
  const src = (it.doodle && doodle(it.doodle)?.outlined) || it.src || '';
  let c = images.get(it.id);
  if (!c || c.src !== src) {
    const img = new Image();
    img.onload = () => listeners.forEach((fn) => fn());
    img.src = src;
    c = { src, img };
    images.set(it.id, c);
  }
  if (c.img instanceof HTMLImageElement && (!c.img.complete || !c.img.naturalWidth)) {
    ctx.fillStyle = placeholder;
    ctx.fillRect(it.x, it.y, it.w, it.h);
    return;
  }
  ctx.imageSmoothingQuality = 'high';
  const rad = it.id === plain ? 0 : it.rad ?? 0;
  if (rad) {
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(it.x, it.y, it.w, it.h, rad);
    ctx.clip();
  }
  ctx.drawImage(c.img, it.x, it.y, it.w, it.h);
  if (rad) ctx.restore();
}

/** The part of a picture (each from 0 to 1 of its size) as a picture of its own, at its own pixels,
 *  ready to be drawn; none if it hasn't loaded. */
export function croppedPicture(it: Item, part: { x: number; y: number; w: number; h: number }): string | null {
  const img = images.get(it.id)?.img;
  if (!img) return null;
  const W = img instanceof HTMLImageElement ? img.naturalWidth : img.width, H = img instanceof HTMLImageElement ? img.naturalHeight : img.height;
  if (!W || !H) return null;
  const w = Math.max(1, Math.round(part.w * W)), h = Math.max(1, Math.round(part.h * H));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  canvas.getContext('2d')!.drawImage(img, Math.round(part.x * W), Math.round(part.y * H), w, h, 0, 0, w, h);
  const src = canvas.toDataURL('image/webp', 0.85);
  // (Drawn at once from this, so it doesn't blink as the new one loads.)
  images.set(it.id, { src, img: canvas });
  return src;
}

/** Longest side a picture is stored at; bigger ones are scaled down so the board stays light. */
const MAX_SIDE = 1600;

/** `doc` and `dn`: a Word document it's the first page of ("Документы Word", src/labs/docx.ts). */
export interface Picture { src: string; w: number; h: number; doc?: string; dn?: string }

/** Reads an image file into a picture: scaled down to MAX_SIDE and re-encoded as WebP. */
export async function readPicture(file: File): Promise<Picture> {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const k = Math.min(1, MAX_SIDE / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.max(1, Math.round(img.naturalWidth * k)), h = Math.max(1, Math.round(img.naturalHeight * k));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    canvas.getContext('2d')!.drawImage(img, 0, 0, w, h);
    return { src: canvas.toDataURL('image/webp', 0.85), w, h };
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Image files among a drop or a file picker's choice, read as pictures; files that fail to load are skipped. */
export async function readPictures(files: Iterable<File>): Promise<Picture[]> {
  const read = await Promise.allSettled([...files].filter((f) => f.type.startsWith('image/')).map(readPicture));
  return read.flatMap((r) => (r.status === 'fulfilled' ? [r.value] : []));
}
