import type { Item } from '../model/types';
import type { Point } from '../canvas/geometry';
import { linkInTextAt } from '../canvas/renderer';
import { remapLinks, setLink } from '../model/textLinks';
import { labOn } from './labs';

/**
 * "Ссылка в тексте": text, a sticker, a shape or a task can lead to an address. Its text turns blue;
 * Cmd+click (Ctrl+click) on it opens the address in a new tab. Or a part of its text, picked while
 * typing, can: just that part blue (see model/textLinks.ts).
 */

/** An address as typed, made one a browser opens: "example.com" -> "https://example.com". */
export function normalUrl(typed: string): string {
  const t = typed.trim();
  if (!t) return '';
  return /^[a-z][a-z0-9+.-]*:/i.test(t) ? t : `https://${t}`;
}

/** What setting the link (or taking it off, for '') does to the item: blue text with it, the usual
 *  without (unless another colour was given). */
export function linkPatch(it: Item, typed: string): Partial<Item> {
  const url = normalUrl(typed);
  if (url) return { url, tc: it.tc ?? 'blue' };
  return { url: undefined, ...(it.tc === 'blue' && { tc: undefined }) };
}

/** Opens the link in text at the board point, or else the item's address, when the feature is on;
 *  whether it did. */
export function openLink(it: Item | null | undefined, w: Point): boolean {
  if (!labOn('textLink')) return false;
  const url = linkInTextAt(w) ?? it?.url;
  if (!url) return false;
  window.open(url, '_blank', 'noopener');
  return true;
}

/** What linking the typed text's s…e to an address (or unlinking it, for '') does: the text as typed
 *  so far goes in with it, the links there before moved along with it. */
export function linkPartPatch(it: Item, typedText: string, s: number, e: number, typed: string): Partial<Item> {
  const links = remapLinks(it.text ?? '', typedText, it.links);
  return { text: typedText, links: setLink(links, s, e, normalUrl(typed)) };
}
