import type { Item } from '../model/types';
import { labOn } from './labs';

/**
 * "Ссылка в тексте": text, a sticker, a shape or a task can lead to an address. Its text turns blue;
 * Cmd+click (Ctrl+click) on it opens the address in a new tab.
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

/** Opens the item's address, when it has one and the feature is on; whether it did. */
export function openLink(it: Item | null | undefined): boolean {
  if (!it?.url || !labOn('textLink')) return false;
  window.open(it.url, '_blank', 'noopener');
  return true;
}
