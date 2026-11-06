import type { Editor } from '../editor/editor';
import type { Item } from '../model/types';
import { font } from '../canvas/text';
import { drawIcon } from '../icons/icons';
import type { Point } from '../canvas/geometry';

/**
 * "Код": a block of code, put on the board by its button on the right rail. It's a rectangle with
 * `code` set to its language: drawn as a dark card of its own, as code editors are (in either theme),
 * its language on a band at its top, the lines numbered, the code in a monospace font, coloured as the
 * language has it, every line as typed (none broken), the block growing to fit it. Typed in, the text over it is see-through, so the code
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

/** The code's colours, as GitHub's dark ones. */
const INK: Record<Kind | 'ink', string> = { ink: '#E6E7EC', com: '#8B949E', str: '#A5D6FF', num: '#79C0FF', kw: '#FF7B72', fn: '#D2A8FF', type: '#FFA657', attr: '#79C0FF', tag: '#7EE787' };
/** The card: its band at the top, the rest, the language's name, the line numbers, what's shown with no code. */
const CARD = { band: '#191922', bg: '#1F1F2A', name: '#E6E7EC', nums: '#A0A3B5', hint: '#5F6278', edge: 'rgba(255,255,255,0.06)' };
export const CODE_HINT = 'Введите код...';

/** The code's size; the band; where the language's name and the line numbers start, and the code; how
 *  far the code keeps from the right side, the band and the bottom; how tall a line is; the corners. */
export const CODE_FS = 14, CODE_BAND = 44, CODE_NAME = 16, CODE_NUMS = 24, CODE_LEFT = 72, CODE_PAD = 16, CODE_BOTTOM = 16, CODE_LINE = 1.5, CODE_RAD = 16;
/** Where the code's first line starts, from the top. */
export const CODE_TOP = CODE_BAND + 12;
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
  const w = Math.max(it.w, Math.ceil(Math.max(...lines.map((l) => l.length)) * charWidth(fs) + CODE_LEFT + CODE_PAD + 2));
  const h = Math.ceil(CODE_TOP + lines.length * fs * CODE_LINE + CODE_BOTTOM);
  return w === it.w && h === it.h ? null : { w, h };
}

/** How far each block's code is scrolled (here only, not shared), when it doesn't fit its block. */
const scrolls = new Map<string, Point>();
/** How big its code is, and how much of it the block shows. */
function overflow(it: Item, text = it.text ?? '') {
  const fs = sizeOf(it), lines = linesOf(text), cw = charWidth(fs);
  const content = { w: Math.max(...lines.map((l) => l.length)) * cw, h: lines.length * fs * CODE_LINE };
  const view = { w: Math.max(1, it.w - CODE_LEFT - CODE_PAD), h: Math.max(1, it.h - CODE_TOP - CODE_BOTTOM) };
  return { content, view, x: Math.max(0, content.w - view.w), y: Math.max(0, content.h - view.h) };
}
const scrollOf = (it: Item): Point => {
  const s = scrolls.get(it.id), o = overflow(it);
  return { x: Math.min(o.x, s?.x ?? 0), y: Math.min(o.y, s?.y ?? 0) };
};

/** The wheel over a block whose code doesn't fit it scrolls the code (Shift: across); whether it did. */
export function scrollCode(it: Item, e: WheelEvent, z: number): boolean {
  if (e.ctrlKey || e.metaKey) return false;
  const o = overflow(it);
  if (!o.x && !o.y) return false;
  const s = scrollOf(it), dx = (e.shiftKey ? e.deltaY : e.deltaX) / z, dy = (e.shiftKey ? 0 : e.deltaY) / z;
  const next = { x: Math.max(0, Math.min(o.x, s.x + dx)), y: Math.max(0, Math.min(o.y, s.y + dy)) };
  // At its end, the board scrolls on.
  if (next.x === s.x && next.y === s.y) return false;
  scrolls.set(it.id, next);
  return true;
}

/** The copy button at the right end of its band: its middle, and how near it takes a press. */
const COPY = 20;
const copyAt = (it: Item): Point => ({ x: it.x + it.w - CODE_PAD - COPY / 2, y: it.y + CODE_BAND / 2 });
export const onCodeCopy = (it: Item, p: Point): boolean => !!it.code && Math.abs(p.x - copyAt(it).x) <= 14 && Math.abs(p.y - copyAt(it).y) <= 14;
/** When a block was copied, its tick shown that long instead. */
let copied: { id: string; at: number } | null = null;
const COPIED_MS = 1200;
export function copyCode(it: Item, redraw: () => void): void {
  void navigator.clipboard?.writeText(it.text ?? '');
  copied = { id: it.id, at: performance.now() };
  redraw();
  setTimeout(redraw, COPIED_MS + 20);
}

/** The text being typed in a block, drawn coloured under the see-through overlay. */
let live: { id: string; text: string } | null = null;
export const setLiveCode = (id: string | null, text = '') => { live = id ? { id, text } : null; };

/** The block: its card and band, its language's name, the code coloured and its lines numbered, cut off
 *  at its edges. */
export function drawCode(ctx: CanvasRenderingContext2D, it: Item, z: number, editing: boolean, hot: string | null = null): void {
  const r = Math.min(it.rad ?? CODE_RAD, it.w / 2, it.h / 2);
  ctx.beginPath();
  ctx.roundRect(it.x, it.y, it.w, it.h, r);
  ctx.fillStyle = CARD.bg;
  ctx.fill();
  ctx.save();
  ctx.clip();
  ctx.fillStyle = CARD.band;
  ctx.fillRect(it.x, it.y, it.w, CODE_BAND);
  const fs = sizeOf(it);
  if (fs * z >= 2.5) {
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.font = font(15, 500);
    ctx.fillStyle = CARD.name;
    ctx.fillText(langOf(it).label, it.x + CODE_NAME, it.y + CODE_BAND / 2);
    // Its copy button (a tick a moment once it's copied), brighter under the pointer.
    const c = copyAt(it), done = copied?.id === it.id && performance.now() - copied.at < COPIED_MS;
    ctx.globalAlpha = done || hot === `code:${it.id}` ? 1 : 0.6;
    drawIcon(ctx, done ? 'check-m' : 'copy', c.x - COPY / 2, c.y - COPY / 2, COPY, CARD.name);
    ctx.globalAlpha = 1;
    const f = font(fs, 400, 'mono');
    ensure(f);
    ctx.font = f;
    // On each line's baseline as the browser sets it in the overlay (see drawText in the renderer).
    ctx.textBaseline = 'alphabetic';
    const fm = ctx.measureText('Hg'), ascent = fm.fontBoundingBoxAscent, descent = fm.fontBoundingBoxDescent, cw = ctx.measureText('0').width;
    const lh = fs * CODE_LINE, text = editing && live?.id === it.id ? live.text : it.text ?? '';
    // Scrolled (not while typed in, when it grows to fit), within the body: the numbers only up and down.
    const sc = editing ? { x: 0, y: 0 } : scrollOf(it);
    ctx.beginPath();
    ctx.rect(it.x, it.y + CODE_BAND, it.w, it.h - CODE_BAND);
    ctx.clip();
    const base = (row: number) => it.y + CODE_TOP - sc.y + row * lh + (lh - ascent - descent) / 2 + ascent;
    const count = text.split('\n').length;
    ctx.fillStyle = CARD.nums;
    for (let i = 0; i < count; i++) ctx.fillText(String(i + 1), it.x + CODE_NUMS, base(i));
    ctx.save();
    ctx.beginPath();
    ctx.rect(it.x + CODE_LEFT - 4, it.y + CODE_BAND, it.w - CODE_LEFT + 4, it.h - CODE_BAND);
    ctx.clip();
    if (!text) {
      ctx.fillStyle = CARD.hint;
      ctx.fillText(CODE_HINT, it.x + CODE_LEFT, base(0));
    }
    let row = 0, col = 0;
    for (const [part, kind] of pieces(langOf(it), text.replace(/\t/g, '  '))) {
      ctx.fillStyle = INK[kind ?? 'ink'];
      part.split('\n').forEach((bit, i) => {
        if (i > 0) { row++; col = 0; }
        if (bit) ctx.fillText(bit, it.x + CODE_LEFT - sc.x + col * cw, base(row));
        col += bit.length;
      });
    }
    ctx.restore();
    // Where it's scrolled to, when it doesn't fit: a white pill at 20% along each way it overflows.
    const o = overflow(it, text);
    ctx.fillStyle = 'rgba(255,255,255,0.2)';
    const T = 4, gap = 4;
    if (!editing && o.y) {
      const track = it.h - CODE_BAND - gap * 2, len = Math.max(20, (track * o.view.h) / o.content.h);
      ctx.beginPath();
      ctx.roundRect(it.x + it.w - gap - T, it.y + CODE_BAND + gap + ((track - len) * sc.y) / o.y, T, len, T / 2);
      ctx.fill();
    }
    if (!editing && o.x) {
      const track = it.w - CODE_LEFT - gap * 2, len = Math.max(20, (track * o.view.w) / o.content.w);
      ctx.beginPath();
      ctx.roundRect(it.x + CODE_LEFT + ((track - len) * sc.x) / o.x, it.y + it.h - gap - T, len, T, T / 2);
      ctx.fill();
    }
  }
  ctx.restore();
  // A faint edge, for the dark theme's board.
  ctx.lineWidth = 1;
  ctx.strokeStyle = CARD.edge;
  ctx.stroke();
}

/** The rail's button: a block in the middle of the screen, typed in at once. */
export function addCode(ed: Editor): void {
  const c = ed.toWorld(innerWidth / 2, innerHeight / 2), w = 480, h = Math.ceil(CODE_TOP + CODE_FS * CODE_LINE + CODE_BOTTOM);
  const it = ed.newItem('rect', Math.round(c.x - w / 2), Math.round(c.y - h / 2), { w, h, code: CODE_LANG, text: '', fs: CODE_FS, ff: 'mono', ta: 'left', va: 'top', rad: CODE_RAD });
  ed.addItem(it);
  ed.setTool('select');
  ed.setSelection([it.id]);
  ed.startEditing(it.id, null, 'end');
}
