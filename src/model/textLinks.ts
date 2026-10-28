import type { ListKind } from './types';

/**
 * Links on part of an item's text ("Ссылка в тексте", src/labs): ranges of its text, by character,
 * each with its address. They move with the text as it's typed in, and go where it's cut out.
 */
export interface TextLink { s: number; e: number; url: string }

/** The links kept on new text: those after a change shift with it, those in what was cut out go,
 *  those it was typed into stretch round it. */
export function remapLinks(before: string, after: string, links: TextLink[] | undefined): TextLink[] | undefined {
  if (!links?.length || before === after) return links;
  let start = 0;
  while (start < before.length && start < after.length && before[start] === after[start]) start++;
  let tail = 0;
  while (tail < before.length - start && tail < after.length - start && before[before.length - 1 - tail] === after[after.length - 1 - tail]) tail++;
  const oldEnd = before.length - tail, shift = after.length - before.length;
  const at = (i: number, end: boolean) => (i < start || (end && i === start) ? i : i >= oldEnd ? i + shift : end ? oldEnd + shift : start);
  const out = links.map((l) => ({ ...l, s: at(l.s, false), e: at(l.e, true) })).filter((l) => l.e > l.s);
  return out.length ? out : undefined;
}

/** The links with `url` on s…e, in place of what was there (an empty url takes them off there). */
export function setLink(links: TextLink[] | undefined, s: number, e: number, url: string): TextLink[] | undefined {
  const out: TextLink[] = [];
  for (const l of links ?? []) {
    if (l.e <= s || l.s >= e) { out.push(l); continue; }
    if (l.s < s) out.push({ ...l, e: s });
    if (l.e > e) out.push({ ...l, s: e });
  }
  if (url) out.push({ s, e, url });
  out.sort((a, b) => a.s - b.s);
  return out.length ? out : undefined;
}

/** The links on the text as drawn, where a list puts a bullet or number before each paragraph. */
export function drawnLinks(text: string, list: ListKind | undefined, links: TextLink[]): TextLink[] {
  if (!list) return links;
  // Where each paragraph starts, and how much went before it by then.
  const starts: Array<[number, number]> = [];
  let at = 0, added = 0;
  text.split('\n').forEach((p, i) => {
    added += list === 'bullet' ? 3 : `${i + 1}. `.length;
    starts.push([at, added]);
    at += p.length + 1;
  });
  const to = (i: number) => { let add = 0; for (const [from, a] of starts) if (from <= i) add = a; return i + add; };
  return links.map((l) => ({ ...l, s: to(l.s), e: to(l.e) }));
}
