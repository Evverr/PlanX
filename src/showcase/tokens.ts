/** The theme's colours (src/styles/theme.css), what each is for. */
export const TOKENS: Array<[string, string]> = [
  ['--bg', 'фон доски'], ['--surface', 'фон попапов'], ['--ink', 'основной текст'], ['--muted', 'второстепенный текст'],
  ['--line', 'линии и рамки полей'], ['--accent', 'акцент (фокус)'], ['--danger', 'опасное действие'], ['--link', 'связи на доске'],
  ['--fmt-bg', 'фон панелей'], ['--fmt-ink', 'иконки на панелях'], ['--fmt-line', 'разделители панелей'], ['--fmt-hover', 'наведение'],
  ['--fmt-on', 'нажатая кнопка'], ['--fmt-on-ink', 'иконка нажатой кнопки'], ['--fmt-off-ink', 'недоступная кнопка'], ['--icon-faint', 'бледная иконка'],
  ['--menu-ink', 'текст меню и попапов'], ['--btn-ink', 'текст кнопок'], ['--btn-line', 'рамка кнопок'], ['--op-track', 'дорожка ползунка'],
];

/** One look that's set differently on different panels: each value, and the cards it's on. */
export interface Drift { what: string; values: Array<[string, string[]]> }

/** The outer box of each panel, menu or popup (nested ones too: the board menu's further level). */
const SURFACES = '.pop, .board-menu, .bar, .tfmt, .tools, .draw-panel, .modal, .op-pop, .labs-pill, .tip, .minimap, .labs-rail';

const LOOKS: Array<[string, (cs: CSSStyleDeclaration) => string]> = [
  ['Скругление углов', (cs) => cs.borderRadius],
  ['Тень', (cs) => cs.boxShadow],
  ['Фон', (cs) => cs.backgroundColor],
  ['Шрифт', (cs) => `${cs.fontFamily.split(',')[0].replace(/"/g, '')} ${cs.fontSize}/${cs.lineHeight}`],
  ['Отступы внутри', (cs) => cs.padding],
];

/** Buttons and rows, looked at on their own. */
const PARTS: Array<[string, string, (cs: CSSStyleDeclaration, el: HTMLElement) => string]> = [
  ['Высота строки меню', '.menu-row', (_, el) => `${el.offsetHeight}px`],
  ['Шрифт строки меню', '.menu-row', (cs) => `${cs.fontFamily.split(',')[0].replace(/"/g, '')} ${cs.fontSize} ${cs.fontWeight}`],
  ['Кнопка-иконка', '.ib', (_, el) => `${el.offsetWidth}×${el.offsetHeight}`],
  ['Поле ввода: рамка и угол', 'input:not([type=range]):not([type=checkbox]):not([type=color])', (cs) => `${cs.borderTopWidth} ${cs.borderTopStyle}, ${cs.borderRadius}`],
  ['Поле ввода: шрифт', 'input:not([type=range]):not([type=checkbox]):not([type=color])', (cs) => `${cs.fontFamily.split(',')[0].replace(/"/g, '')} ${cs.fontSize}`],
  ['Заголовок в попапе', '.pop h3, .modal h2, .labs-pop h3', (cs) => `${cs.fontFamily.split(',')[0].replace(/"/g, '')} ${cs.fontSize} ${cs.fontWeight}`],
];

const KIND = (el: Element) => [...el.classList].filter((c) => !['sortable', 'docked', 'raised', 'sub', 'plain', 'leftward', 'on'].includes(c)).slice(0, 2).join('.');

/** What's set differently between the panels on the page: per look, each value with where it's seen. */
export function findDrift(): Drift[] {
  const cards = [...document.querySelectorAll<HTMLElement>('.sc-card')].filter((c) => c.querySelector('.sc-stage'));
  const tally = (what: string, list: Array<[HTMLElement, string]>) => {
    const by = new Map<string, Set<string>>();
    for (const [el, title] of list) {
      if (!el.offsetWidth) continue;
      const v = (LOOKS.find(([w]) => w === what)?.[1] ?? PARTS.find(([w]) => w === what)![2])(getComputedStyle(el), el);
      if (!v || v === 'none' && what !== 'Тень') continue;
      if (!by.has(v)) by.set(v, new Set());
      by.get(v)!.add(title);
    }
    return { what, values: [...by].map(([v, s]) => [v, [...s]] as [string, string[]]).sort((a, b) => b[1].length - a[1].length) };
  };
  const surfaces: Array<[HTMLElement, string]> = [];
  for (const c of cards) {
    const title = c.querySelector('h3')?.textContent ?? '';
    // (The stage's own sample bars in «Основы» are only samples.)
    if (c.closest('#basics')) continue;
    c.querySelectorAll<HTMLElement>(SURFACES).forEach((el) => { if (!el.parentElement?.closest(SURFACES)) surfaces.push([el, `${title} (.${KIND(el)})`]); });
  }
  const out = LOOKS.map(([what]) => tally(what, surfaces));
  for (const [what, sel] of PARTS) {
    const list: Array<[HTMLElement, string]> = [];
    for (const c of cards) c.querySelectorAll<HTMLElement>(sel).forEach((el) => list.push([el, c.querySelector('h3')?.textContent ?? '']));
    out.push(tally(what, list));
  }
  return out.filter((d) => d.values.length > 1);
}
