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
const images = new Map<string, HTMLImageElement>();
const listeners = new Set<() => void>();

/** Called whenever another emoji picture finishes loading, so the board can redraw. */
export function onEmojiLoad(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Draws the emoji fitted into the square at (x, y); nothing until its picture has loaded. */
export function drawEmoji(ctx: CanvasRenderingContext2D, id: string, x: number, y: number, size: number): void {
  let img = images.get(id);
  if (!img) {
    const url = URL_BY_ID.get(id);
    if (!url) return;
    img = new Image();
    img.onload = () => listeners.forEach((fn) => fn());
    img.src = url;
    images.set(id, img);
  }
  if (!img.complete || !img.naturalWidth) return;
  // The pictures aren't all square; keep their proportions inside the item.
  const k = size / Math.max(img.naturalWidth, img.naturalHeight);
  const w = img.naturalWidth * k, h = img.naturalHeight * k;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, x + (size - w) / 2, y + (size - h) / 2, w, h);
}
