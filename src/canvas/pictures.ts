import { doodle } from './doodles';
import type { Item } from '../model/types';

/**
 * Pictures put on the board. Each is kept in its item as a data URL (so it syncs with the board
 * like everything else) and drawn from a cache of loaded images, keyed by item.
 */
const images = new Map<string, { src: string; img: HTMLImageElement }>();
const listeners = new Set<() => void>();

/** Called whenever another picture finishes loading, so the board can redraw. */
export function onPictureLoad(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Draws the picture stretched over the item; a plain box until it has loaded. */
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
  if (!c.img.complete || !c.img.naturalWidth) {
    ctx.fillStyle = placeholder;
    ctx.fillRect(it.x, it.y, it.w, it.h);
    return;
  }
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(c.img, it.x, it.y, it.w, it.h);
}

/** Longest side a picture is stored at; bigger ones are scaled down so the board stays light. */
const MAX_SIDE = 1600;

export interface Picture { src: string; w: number; h: number }

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
