import type { ListKind } from './types';

/**
 * Links on part of an item's text ("Ссылка в тексте", src/labs): ranges of its text, by character,
 * each with its address. They move with the text as it's typed in, and go where it's cut out.
 */
export interface TextLink { s: number; e: number; url: string }

/** The links kept on new text: those after a change shift with it, those in what was cut out go,
 *  those it was typed into stretch round it. */
export function remapLinks<T extends { s: number; e: number }>(before: string, after: string, links: T[] | undefined): T[] | undefined {
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
export function drawnLinks<T extends { s: number; e: number }>(text: string, list: ListKind | undefined, links: T[]): T[] {
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

/** A style on part of an item's text («Документ», src/labs/docPage.ts): bold, italic, underlined, struck
 *  through, its colour (a key of TEXT_COLORS or '#rrggbb'). Kept by character as the links are, moving
 *  with the text as it's typed in (remapLinks). */
export interface TextRun { s: number; e: number; b?: boolean; i?: boolean; u?: boolean; x?: boolean; c?: string; h?: number; l?: string }
export type RunStyle = Omit<TextRun, 's' | 'e'>;

/** The style on each character of s…e, from the runs. */
function stylesIn(runs: TextRun[] | undefined, s: number, e: number, extra: number[] = []): Array<{ s: number; e: number; st: RunStyle }> {
  const cuts = [...new Set([s, e, ...[...(runs ?? []).flatMap((r) => [r.s, r.e]), ...extra].filter((c) => c > s && c < e)])].sort((a, b) => a - b);
  const out: Array<{ s: number; e: number; st: RunStyle }> = [];
  for (let i = 0; i + 1 < cuts.length; i++) {
    const st: RunStyle = {};
    for (const r of runs ?? []) if (r.s <= cuts[i] && r.e >= cuts[i + 1]) Object.assign(st, Object.fromEntries(Object.entries(r).filter(([k]) => k !== 's' && k !== 'e')));
    out.push({ s: cuts[i], e: cuts[i + 1], st });
  }
  return out;
}

/** Whether all of s…e has `key` set (to `value`, for a colour). */
export function runsHave(runs: TextRun[] | undefined, s: number, e: number, key: keyof RunStyle, value?: string | number): boolean {
  return e > s && stylesIn(runs, s, e).every((p) => (value === undefined ? !!p.st[key] : p.st[key] === value));
}

/** The runs with `key` set on s…e (to `value`), or taken off there (`value` undefined for a colour, `on`
 *  false for the rest); next to each other with the same style, made one. */
export function setRun(runs: TextRun[] | undefined, s: number, e: number, key: keyof RunStyle, on: boolean, value?: string | number): TextRun[] | undefined {
  if (e <= s) return runs;
  const end = Math.max(e, ...(runs ?? []).map((r) => r.e));
  const all = stylesIn(runs, Math.min(s, ...(runs ?? []).map((r) => r.s)), end, [s, e]).map((p) => {
    if (p.e <= s || p.s >= e) return p;
    const st = { ...p.st } as Record<string, unknown>;
    if (on) st[key] = key === 'c' || key === 'h' || key === 'l' ? value : true; else delete st[key];
    return { ...p, st: st as RunStyle };
  });
  // (Styles told apart by what's set in them, whatever the order.)
  const styleKey = (st: RunStyle) => JSON.stringify(Object.entries(st).filter(([, v]) => v !== undefined).sort());
  const out: TextRun[] = [];
  for (const p of all) {
    if (!Object.keys(p.st).length) continue;
    const last = out[out.length - 1];
    if (last && last.e === p.s && styleKey({ ...last, s: undefined, e: undefined } as RunStyle) === styleKey(p.st)) last.e = p.e;
    else out.push({ s: p.s, e: p.e, ...p.st });
  }
  return out.length ? out : undefined;
}

/** Where a paragraph's heading level is kept: the character after it (its line break, or past the end
 *  of the text for the last), so it stays with it whatever's typed in it. */
const anchorOf = (text: string, at: number) => { const n = text.indexOf('\n', at); return n < 0 ? text.length : n; };

/** What a paragraph is, kept on the character after it (anchorOf): its heading level (`h`: 1…3) or its
 *  list (`l`: 'bullet', 'number'). */
type ParaKey = 'h' | 'l';
/** That of the paragraph a character's in (undefined for none). */
export function paraAt<K extends ParaKey>(text: string, runs: TextRun[] | undefined, at: number, key: K): TextRun[K] | undefined {
  const a = anchorOf(text, at);
  return runs?.find((r) => r[key] && r.s <= a && r.e > a)?.[key];
}
/** The paragraphs s…e is in made so (undefined: not so). */
export function setPara(text: string, runs: TextRun[] | undefined, s: number, e: number, key: ParaKey, value: string | number | undefined): TextRun[] | undefined {
  let out = runs;
  for (let at = text.lastIndexOf('\n', s - 1) + 1; ; ) {
    const a = anchorOf(text, at);
    out = setRun(out, a, a + 1, key, false);
    if (value) out = setRun(out, a, a + 1, key, true, value);
    if (a >= e || a >= text.length) break;
    at = a + 1;
  }
  return out;
}

/** The heading level (1…3, 0 for none) of the paragraph a character's in. */
export const headingAt = (text: string, runs: TextRun[] | undefined, at: number): number => paraAt(text, runs, at, 'h') ?? 0;
/** The paragraphs s…e is in made headings of `level` (0: plain text again). */
export const setHeading = (text: string, runs: TextRun[] | undefined, s: number, e: number, level: number) => setPara(text, runs, s, e, 'h', level || undefined);
