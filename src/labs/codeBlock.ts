import type { Editor } from '../editor/editor';
import type { Item } from '../model/types';
import { font } from '../canvas/text';

/**
 * "Код": a block of code, put on the board by its button on the right rail. It's a rectangle with
 * `code` set to its language: drawn as a card of its own (not in a rectangle's colours), its language
 * over the code, the code in a monospace font, coloured as the language has it, every line as typed
 * (none broken), the block growing to fit it. Typed in, the text over it is see-through, so the code
 * stays coloured while it's typed. The language is picked on its panel (CodeLang.tsx).
 */

/** What a piece of code is, for its colour. */
type Kind = 'com' | 'str' | 'num' | 'kw' | 'fn' | 'type' | 'attr' | 'tag';
interface Lang { label: string; rules: Array<[Kind, string]>; flags?: string }

const words = (list: string) => `\\b(?:${list.trim().split(/\s+/).join('|')})\\b`;
const STR2 = String.raw`"(?:\\.|[^"\\\n])*"?`, STR1 = String.raw`'(?:\\.|[^'\\\n])*'?`, TPL = String.raw`\`(?:\\[\s\S]|[^\`\\])*\`?`;
const NUM = String.raw`\b(?:0[xXbBoO][\da-fA-F_]+|\d[\d_]*(?:\.\d+)?(?:[eE][+-]?\d+)?)\b`;
const BLOCK = String.raw`/\*[\s\S]*?(?:\*/|$)`, LINE = String.raw`//[^\n]*`, HASH = String.raw`#[^\n]*`;
const FN = String.raw`\b[A-Za-z_$][\w$]*(?=\s*\()`, TYPE = String.raw`\b[A-Z][\w$]*\b`;

/** A language written as C is: comments, strings, numbers, its words, calls, capitalised names. */
const cLike = (label: string, kw: string, extra: Array<[Kind, string]> = []): Lang => ({
  label,
  rules: [['com', BLOCK], ['com', LINE], ...extra, ['str', STR2], ['str', STR1], ['num', NUM], ['kw', words(kw)], ['fn', FN], ['type', TYPE]],
});

const JS = `const let var function return if else for while do switch case break continue default new delete typeof instanceof in of
  class extends super this import export from as async await yield try catch finally throw true false null undefined void static get set`;

/** The languages, in the order they're offered. */
export const LANGS: Record<string, Lang> = {
  js: cLike('JavaScript', JS, [['str', TPL]]),
  ts: cLike('TypeScript', `${JS} type interface enum implements private public protected readonly abstract declare namespace keyof
    unknown any never number string boolean`, [['str', TPL]]),
  py: {
    label: 'Python',
    rules: [['com', HASH], ['str', String.raw`(?:"""[\s\S]*?(?:"""|$)|'''[\s\S]*?(?:'''|$))`], ['str', STR2], ['str', STR1], ['fn', String.raw`@[\w.]+`],
      ['num', NUM], ['kw', words(`def class return if elif else for while in not and or is import from as with try except finally raise
        lambda yield pass break continue global nonlocal async await True False None self`)], ['fn', FN], ['type', TYPE]],
  },
  java: cLike('Java', `public private protected class interface enum extends implements static final abstract void return if else for while
    do switch case break continue default new this super try catch finally throw throws import package true false null var record`, [['fn', String.raw`@\w+`]]),
  cs: cLike('C#', `public private protected internal class interface enum struct static readonly void return if else for foreach while do
    switch case break continue default new this base try catch finally throw using namespace var true false null async await in out ref`),
  cpp: cLike('C++', `int long short char float double bool void auto const constexpr static struct class enum union public private protected
    return if else for while do switch case break continue default new delete this template typename namespace using true false nullptr`,
  [['kw', String.raw`#\w+`]]),
  go: cLike('Go', `package import func return if else for range switch case break continue default go defer select chan map struct
    interface type var const true false nil`, [['str', String.raw`\`[^\`]*\`?`]]),
  swift: cLike('Swift', `func let var return if else guard for in while repeat switch case break continue default class struct enum
    protocol extension import self super init deinit true false nil try catch throw throws async await some any`),
  kotlin: cLike('Kotlin', `fun val var return if else for in while do when break continue class interface object data enum sealed
    open override private public internal import package this super true false null is as try catch finally throw`),
  php: cLike('PHP', `function return if else elseif foreach for while do switch case break continue default new class interface
    extends implements public private protected static echo use namespace true false null array fn match`, [['com', HASH], ['attr', String.raw`\$\w+`]]),
  sql: {
    label: 'SQL', flags: 'i',
    rules: [['com', String.raw`--[^\n]*`], ['com', BLOCK], ['str', STR1], ['str', STR2], ['num', NUM],
      ['kw', words(`select from where and or not insert into values update set delete create table drop alter add index join left right
        inner outer full on as group by order having limit offset distinct union all null is in like between case when then else end
        primary key foreign references default count sum avg min max asc desc`)], ['fn', FN]],
  },
  html: {
    label: 'HTML',
    rules: [['com', String.raw`<!--[\s\S]*?(?:-->|$)`], ['tag', String.raw`(?<=<\/?)[\w-]+`], ['attr', String.raw`[\w:-]+(?==)`], ['str', STR2], ['str', STR1]],
  },
  css: {
    label: 'CSS',
    rules: [['com', BLOCK], ['str', STR2], ['str', STR1], ['kw', String.raw`@[\w-]+`], ['attr', String.raw`[\w-]+(?=\s*:[^\n{]*;)`],
      ['num', String.raw`#[\da-fA-F]{3,8}\b|-?\b\d*\.?\d+(?:px|r?em|%|v[hw]|s|ms|deg|fr)?\b`], ['tag', String.raw`[.#][\w-]+`]],
  },
  json: {
    label: 'JSON',
    rules: [['attr', String.raw`"(?:\\.|[^"\\\n])*"(?=\s*:)`], ['str', STR2], ['num', String.raw`-?${NUM}`], ['kw', words('true false null')]],
  },
  yaml: {
    label: 'YAML',
    rules: [['com', HASH], ['attr', String.raw`(?<=^|\n)[\t -]*[\w.-]+(?=\s*:)`], ['str', STR2], ['str', STR1], ['num', NUM], ['kw', words('true false null yes no')]],
  },
  bash: {
    label: 'Bash',
    rules: [['com', String.raw`(?<=^|\s)#[^\n]*`], ['str', STR2], ['str', STR1], ['attr', String.raw`\$\{?[\w@#?*!-]+\}?`], ['num', NUM],
      ['kw', words('if then else elif fi for while do done case esac in function return export local echo exit source')]],
  },
  plain: { label: 'Текст', rules: [] },
};
export const CODE_LANG = 'js';
export const langOf = (it: Item): Lang => LANGS[it.code ?? ''] ?? LANGS.plain;

/** Its pieces, each with what it is (none for the rest), as they come in the text. */
type Piece = [string, Kind | null];
const pieceCache = new Map<string, Piece[]>();
const patterns = new Map<Lang, RegExp | null>();

function pieces(lang: Lang, text: string): Piece[] {
  const key = `${lang.label}\u0000${text}`, had = pieceCache.get(key);
  if (had) return had;
  let re = patterns.get(lang);
  if (re === undefined) {
    re = lang.rules.length ? new RegExp(lang.rules.map(([, r]) => `(${r})`).join('|'), `g${lang.flags ?? ''}`) : null;
    patterns.set(lang, re);
  }
  const out: Piece[] = [];
  let at = 0;
  if (re) {
    re.lastIndex = 0;
    for (let m = re.exec(text); m; m = re.exec(text)) {
      if (!m[0]) { re.lastIndex++; continue; }
      if (m.index > at) out.push([text.slice(at, m.index), null]);
      const k = m.findIndex((g, i) => i > 0 && g !== undefined);
      out.push([m[0], lang.rules[k - 1][0]]);
      at = m.index + m[0].length;
    }
  }
  if (at < text.length) out.push([text.slice(at), null]);
  if (pieceCache.size > 300) pieceCache.clear();
  pieceCache.set(key, out);
  return out;
}

/** Colours as GitHub's, light and dark. */
const LIGHT: Record<Kind | 'ink', string> = { ink: '#24292F', com: '#6E7781', str: '#0A3069', num: '#0550AE', kw: '#CF222E', fn: '#8250DF', type: '#953800', attr: '#0550AE', tag: '#116329' };
const DARK: Record<Kind | 'ink', string> = { ink: '#E6EDF3', com: '#8B949E', str: '#A5D6FF', num: '#79C0FF', kw: '#FF7B72', fn: '#D2A8FF', type: '#FFA657', attr: '#79C0FF', tag: '#7EE787' };
const CARD = { light: { bg: '#FFFFFF', edge: '#E1E4EA' }, dark: { bg: '#17191E', edge: '#30333A' } };

/** The code's size, how far it is from the sides, the language's line over it, and how tall a line is. */
export const CODE_FS = 14, CODE_PAD = 16, CODE_TOP = 40, CODE_LINE = 1.5;
const sizeOf = (it: Item) => it.fs ?? CODE_FS;
/** Tabs as two spaces, as the overlay shows them. */
const linesOf = (text: string) => text.replace(/\t/g, '  ').split('\n');

let measure: CanvasRenderingContext2D | null = null;
const charWidth = (fs: number) => {
  measure ??= document.createElement('canvas').getContext('2d')!;
  measure.font = font(fs, 400, 'mono');
  return measure.measureText('0').width;
};
const asked = new Set<string>();
const ensure = (f: string) => {
  if (asked.has(f) || !document.fonts) return;
  asked.add(f);
  if (!document.fonts.check(f)) void document.fonts.load(f);
};

/** Its size for the text: as tall as its lines, wide enough for the longest (it doesn't get narrower). */
export function codeFit(it: Item, text: string): { w: number; h: number } | null {
  const fs = sizeOf(it), lines = linesOf(text);
  const w = Math.max(it.w, Math.ceil(Math.max(...lines.map((l) => l.length)) * charWidth(fs) + CODE_PAD * 2 + 2));
  const h = Math.ceil(CODE_TOP + lines.length * fs * CODE_LINE + CODE_PAD);
  return w === it.w && h === it.h ? null : { w, h };
}

/** The text being typed in a block, drawn coloured under the see-through overlay. */
let live: { id: string; text: string } | null = null;
export const setLiveCode = (id: string | null, text = '') => { live = id ? { id, text } : null; };

/** The block: its card, its language's name, the code coloured, cut off at its edges. */
export function drawCode(ctx: CanvasRenderingContext2D, it: Item, dark: boolean, muted: string, z: number, editing: boolean): void {
  const card = dark ? CARD.dark : CARD.light, ink = dark ? DARK : LIGHT, r = Math.min(it.rad ?? 8, it.w / 2, it.h / 2);
  ctx.beginPath();
  ctx.roundRect(it.x, it.y, it.w, it.h, r);
  ctx.fillStyle = card.bg;
  ctx.fill();
  ctx.lineWidth = 1;
  ctx.strokeStyle = card.edge;
  ctx.stroke();
  const fs = sizeOf(it);
  if (fs * z < 2.5) return;
  ctx.save();
  ctx.clip();
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.font = font(12, 500);
  ctx.fillStyle = muted;
  ctx.fillText(langOf(it).label, it.x + CODE_PAD, it.y + CODE_TOP / 2);
  const f = font(fs, 400, 'mono');
  ensure(f);
  ctx.font = f;
  // On each line's baseline as the browser sets it in the overlay (see drawText in the renderer).
  ctx.textBaseline = 'alphabetic';
  const fm = ctx.measureText('Hg'), ascent = fm.fontBoundingBoxAscent, descent = fm.fontBoundingBoxDescent, cw = ctx.measureText('0').width;
  const lh = fs * CODE_LINE, text = editing && live?.id === it.id ? live.text : it.text ?? '';
  let row = 0, col = 0;
  for (const [part, kind] of pieces(langOf(it), text.replace(/\t/g, '  '))) {
    ctx.fillStyle = ink[kind ?? 'ink'];
    const bits = part.split('\n');
    bits.forEach((bit, i) => {
      if (i > 0) { row++; col = 0; }
      if (bit) ctx.fillText(bit, it.x + CODE_PAD + col * cw, it.y + CODE_TOP + row * lh + (lh - ascent - descent) / 2 + ascent);
      col += bit.length;
    });
  }
  ctx.restore();
}

/** The rail's button: a block in the middle of the screen, typed in at once. */
export function addCode(ed: Editor): void {
  const c = ed.toWorld(innerWidth / 2, innerHeight / 2), w = 480, h = Math.ceil(CODE_TOP + CODE_FS * CODE_LINE + CODE_PAD);
  const it = ed.newItem('rect', Math.round(c.x - w / 2), Math.round(c.y - h / 2), { w, h, code: CODE_LANG, text: '', fs: CODE_FS, ff: 'mono', ta: 'left', va: 'top' });
  ed.addItem(it);
  ed.setTool('select');
  ed.setSelection([it.id]);
  ed.startEditing(it.id, null, 'end');
}
