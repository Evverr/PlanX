/** Text formatting panel over the selected text or sticker, built from the controls of the
 *  Figma mockup (Mol / Bar). Each setting applies to the item's whole text. */
import { useEffect, useLayoutEffect, useReducer, useState, type ReactNode } from 'react';

import type { Editor } from '../editor/editor';
import { alignOf, baseWeight, DEFAULTS, MARK_COLORS, TEXT_COLORS, type Item, type ListKind, type TextAlign } from '../model/types';
import { DOT_GAP, DOT_R } from '../canvas/renderer';
import { boxOf, type Rect } from '../canvas/geometry';
import { FONTS } from '../canvas/text';
import { ColorRow } from '../labs/ContextMenu';
import { PanelIcon as Icon, type PanelIconName as IconName } from './PanelIcon';
import { useSortable } from './sortable';
import { EDGE, fitPopovers } from '../layout';
import { useLabs } from '../labs/labs';
import { ItemMenuButton } from '../labs/ContextMenu';
import { linkPartPatch, linkPatch } from '../labs/textLink';
import { headingAt, remapLinks, runsHave, setHeading, setRun, type RunStyle } from '../model/textLinks';
import { richActive, richHeading, richList, richState, richStyle } from '../labs/RichEditor';

function Btn({ icon, label, on, off, swatch, menu, onClick }: {
  icon: IconName; label: string; on?: boolean; off?: boolean; swatch?: string; menu?: boolean; onClick?: () => void;
}) {
  return (
    <button className={`fb ${on ? 'on' : ''} ${swatch ? 'sw-btn' : ''}`} title={label} aria-label={label} aria-pressed={on} disabled={off} onClick={onClick}>
      <Icon name={icon} />
      {swatch && <i className="swatch" style={{ background: swatch }} />}
      {menu && <Icon name="drop" className="caret" />}
    </button>
  );
}

function Pick({ value, label, onClick }: { value: string; label: string; onClick?: () => void }) {
  return (
    <button className="fpick" title={label} aria-label={`${label}: ${value}`} onClick={onClick}>
      {value}<Icon name="drop" className="caret" />
    </button>
  );
}

/** A control with its menu dropped under it while open. */
function Drop({ open, menu, grid, params, children }: { open: boolean; menu: ReactNode; grid?: boolean;
  /** Holding a row of colours as in «Параметры» (src/labs/ContextMenu.tsx). */
  params?: boolean; children: ReactNode }) {
  return (
    <div className="tf-drop">
      {children}
      {open && <div className={`tf-menu ${grid ? 'grid' : ''} ${params ? 'params-menu' : ''}`} role="menu" data-nosort>{params ? <div className="params-list">{menu}</div> : menu}</div>}
    </div>
  );
}

/** Part of the text being typed: where it starts and ends in it, and all of it as typed so far. */
interface Part { s: number; e: number; text: string }

/** What's picked in the text being typed in, if anything. */
function pickedPart(editor: Editor, item: Item): Part | null {
  const el = document.querySelector<HTMLTextAreaElement>('textarea.text-edit');
  if (!el || editor.editingId !== item.id) return null;
  // (A task's description, nothing picked in it: all of it, a task having no link of its own.)
  if (el.selectionStart === el.selectionEnd) return item.type === 'task' && el.value ? { s: 0, e: el.value.length, text: el.value } : null;
  return { s: el.selectionStart, e: el.selectionEnd, text: el.value };
}


/** The link's menu: its address to type (Enter sets it), and to open it or take it off; for a part of
 *  the text, that part's. */
function LinkMenu({ item, part, onSet }: { item: Item; part: Part | null; onSet: (typed: string) => void }) {
  const own = part ? item.links?.find((l) => l.s <= part.s && l.e >= part.e)?.url : item.url;
  const [typed, setTyped] = useState(own ?? '');
  return (
    <div className="tf-link">
      <input autoFocus type="url" placeholder="Вставьте ссылку" aria-label="Адрес ссылки" value={typed}
        onChange={(e) => setTyped(e.target.value)}
        onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Enter') onSet(typed); }} />
      <div className="tf-link-row">
        <button className="tf-item" onClick={() => onSet(typed)}>Готово</button>
        {own && <button className="tf-item" onClick={() => window.open(own, '_blank', 'noopener')}>Открыть</button>}
        {own && <button className="tf-item" onClick={() => onSet('')}>Убрать</button>}
      </div>
    </div>
  );
}

const SIZES = [10, 12, 14, 16, 18, 20, 24, 28, 32, 36, 48, 64, 72, 96];
/** Text styles set size and weight together; "Обычный" is the type's own size and weight. */
const HEADINGS: Array<[string, number]> = [['Заголовок 1', 40], ['Заголовок 2', 30], ['Заголовок 3', 22]];
const ALIGN_ICONS: Record<TextAlign, IconName> = { left: 'align-left', center: 'align-center', right: 'align-right' };
const ALIGN_LABELS: Record<TextAlign, string> = { left: 'По левому краю', center: 'По центру', right: 'По правому краю' };
/** In a sticker or a shape, the text at its top, in its middle (unset) or at its bottom. */
const VALIGNS: Array<[Item['va'], IconName, string]> = [['top', 'align-items-top', 'Прижать кверху'], [undefined, 'align-items-middle', 'Посередине'], ['bottom', 'align-items-bottom', 'Прижать книзу']];
const LISTS: Array<[ListKind, IconName, string]> = [['bullet', 'bulleted-list', 'Маркированный список'], ['number', 'numbered-list', 'Нумерованный список']];

const hex = (c: string | undefined, table: Record<string, string>) => (c ? (c.startsWith('#') ? c : table[c]) : undefined);

const ORDER = ['font', 'gap', 'style', 'gap2', 'size', 'gap3', 'bold', 'italic', 'underline', 'strike', 'sep', 'color', 'mark', 'sep2', 'align', 'sep3', 'list', 'link'];

type Menu = 'font' | 'style' | 'size' | 'color' | 'mark' | 'align' | 'list' | 'link';

/** Gap between the selected item's top dot and the text panel, and the panel's margin to the screen edge. */
const GAP = 20;

/** The room the menu's button takes at the right end. */
const MENU_BUTTON = 44;

/** How wide the text panel may be: the screen less its margins, and the tool rail beside it. */
function textRoom(): number {
  const rail = document.querySelector('.tools')?.getBoundingClientRect();
  return innerWidth - EDGE - (rail ? rail.right + EDGE : EDGE);
}

/** Hung 20px over the top dot of the selected text or sticker (under the bottom dot when there's no room above). */
/** Puts a panel over this box on the board, if it fits under the top bar (when level with it), otherwise
 *  under it, clear of the tool rail (or, with `under` given, there whatever); gives back whether it
 *  should be under. */
export function placeOver(editor: Editor, box: HTMLElement, b: Rect, dots = DOT_GAP, under?: boolean): boolean {
  const w = box.offsetWidth, h = box.offsetHeight;
  const top = editor.toScreen({ x: b.x + b.w / 2, y: b.y });
  const bottom = editor.toScreen({ x: 0, y: b.y + b.h }).y;
  const reach = dots + DOT_R + GAP;
  const bar = document.querySelector('.topbar')?.getBoundingClientRect();
  const underBar = bar && top.x - w / 2 < bar.right && top.x + w / 2 > bar.left;
  const fits = top.y - reach - h >= (underBar ? bar.bottom : 0) + EDGE, over = under === undefined ? fits : !under;
  const y = over ? top.y - reach - h : bottom + reach;
  // Stay clear of the tool rail when level with it.
  const rail = document.querySelector('.tools')?.getBoundingClientRect();
  const minX = rail && rail.top < y + h && rail.bottom > y ? rail.right + EDGE : EDGE;
  box.style.left = `${Math.max(minX, Math.min(top.x - w / 2, innerWidth - w - EDGE))}px`;
  // Under something taller than the screen: at the screen's bottom.
  box.style.top = `${Math.min(y, innerHeight - h - EDGE)}px`;
  return !fits;
}

export function TextPanel({ editor, item, leaving, after, dock, onBack }: { editor: Editor; item: Item; leaving?: boolean;
  /** Coming in where the panel over what's picked is going ("Панель над элементом", src/labs): once it's gone. */
  after?: boolean;
  /** Standing where the selection panel at the bottom stood ("Кнопка T", src/labs): its middle and bottom. */
  dock?: { cx: number; bottom: number };
  /** Opened from another panel ("Кнопка T"): an arrow at the start goes back to it. */
  onBack?: () => void }) {
  const [wait] = useState(!!after);
  const sort = useSortable('planx-order-text', ORDER, 'x');
  const labs = useLabs();
  const el = sort.ref;
  const [menu, setMenu] = useState<Menu | null>(null);
  useLayoutEffect(() => {
    const box = el.current!;
    if (dock) {
      box.style.left = `${Math.max(EDGE, Math.min(dock.cx - box.offsetWidth / 2, innerWidth - box.offsetWidth - EDGE))}px`;
      box.style.top = `${dock.bottom - box.offsetHeight}px`;
      return;
    }
    // A turned item's box square to the screen; as far over it as the selection panel stands.
    placeOver(editor, box, boxOf(item));
  });
  // Its menus turn to its other side when there's no room for them under it (see fitPopover).
  useEffect(() => (el.current ? fitPopovers(el.current, '.tf-menu') : undefined), []); // eslint-disable-line react-hooks/exhaustive-deps
  // Its bottom stays that far over the item whatever size it turns (the panels' size, fonts coming in).
  const [, redraw] = useReducer((n: number) => n + 1, 0);
  useEffect(() => {
    const ro = new ResizeObserver(() => redraw());
    ro.observe(el.current!);
    return () => ro.disconnect();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  // A menu closes on a click anywhere else, and when another item gets selected.
  useEffect(() => {
    const close = (e: PointerEvent) => { if (!el.current?.contains(e.target as Node)) setMenu(null); };
    window.addEventListener('pointerdown', close);
    return () => window.removeEventListener('pointerdown', close);
  }, []);
  useEffect(() => setMenu(null), [item.id]);

  const toggle = (m: Menu) => setMenu(menu === m ? null : m);
  // The part of the text picked as the link's menu opened, while typing in it.
  const [part, setPart] = useState<Part | null>(null);
  /** Applies a change and closes the menu it came from. */
  const set = (patch: Partial<Item>, keepOpen = false) => { editor.setTextStyle(patch); if (!keepOpen) setMenu(null); };

  // (A task's for its description, as the card has it by default: Inter 14, on the left; see descLook.)
  const task = item.type === 'task', baseFont = task ? 'inter' : 'onest';
  const fs = task ? item.dfs ?? 14 : item.fs ?? DEFAULTS[item.type].fs ?? 16;
  const bold = (item.fw ?? (task ? 400 : baseWeight(item.type))) >= 600;
  const heading = HEADINGS.find(([, size]) => size === fs && bold);
  const align = task ? item.ta ?? 'left' : alignOf(item);
  const textColor = hex(item.tc, TEXT_COLORS);
  // «Документ» (src/labs): with part of its text picked as it's typed in, bold, italic, underline, strike
  // and colour go on that part alone (see TextRun in model/textLinks.ts), the text as typed kept with them.
  // (Shown again as what's picked in it changes, for its buttons to show what's on it.)
  const [, reselect] = useReducer((n: number) => n + 1, 0);
  useEffect(() => {
    if (item.type !== 'page') return;
    document.addEventListener('selectionchange', reselect);
    return () => document.removeEventListener('selectionchange', reselect);
  }, [item.type]);
  // (Typed in as it looks, RichEditor.tsx: on what's picked in that field, as the browser has it.)
  const rich = item.type === 'page' && editor.editingId === item.id && richActive() ? richState() : null;
  const picked = !rich && item.type === 'page' ? pickedPart(editor, item) : null;
  const runsOf = (p: Part) => remapLinks(item.text ?? '', p.text, item.rs);
  const partHas = (key: keyof RunStyle, value?: string) => (rich ? key !== 'c' && key !== 'h' && key !== 'l' && rich[key]
    : !!picked && runsHave(runsOf(picked), picked.s, picked.e, key, value));
  /** Where the caret is in a document being typed in (or what's picked there). */
  const caretIn = (): Part | null => {
    const el = document.querySelector<HTMLTextAreaElement>('textarea.text-edit');
    return item.type === 'page' && el && editor.editingId === item.id ? { s: el.selectionStart, e: el.selectionEnd, text: el.value } : null;
  };
  const caret = caretIn(), level = rich ? rich.h : caret ? headingAt(caret.text, runsOf(caret), caret.s) : null;
  /** Makes the paragraphs the caret's in (or what's picked) headings of `n` (0: plain); false with no
   *  document being typed in (the whole text's style then). */
  const headPart = (n: number): boolean => {
    if (rich && richHeading(n)) { setMenu(null); return true; }
    const now = caretIn();
    if (!now) return false;
    editor.board.update(item.id, { text: now.text, rs: setHeading(now.text, runsOf(now), now.s, now.e, n) });
    setMenu(null);
    return true;
  };
  /** Sets (or takes off) a style on the part picked (as it's picked now); false with none picked (the
   *  whole text's then). */
  const stylePart = (key: keyof RunStyle, value?: string): boolean => {
    if (rich && key !== 'h' && key !== 'l' && richStyle(key, value)) { setMenu(null); return true; }
    const now = item.type === 'page' ? pickedPart(editor, item) : null;
    if (!now) return false;
    const runs = runsOf(now), on = key === 'c' ? value !== undefined : !runsHave(runs, now.s, now.e, key);
    editor.board.update(item.id, { text: now.text, rs: setRun(runs, now.s, now.e, key, on, value) });
    setMenu(null);
    return true;
  };
  const mark = hex(item.mk, MARK_COLORS);

  return (
    // Keep focus in the text being edited when a control is pressed. Controls can be rearranged by holding them;
    // components can't take the ref, so each sits in a wrapper.
    <div ref={sort.ref as React.RefObject<HTMLDivElement>} className={`tfmt sortable ${onBack ? 'has-back' : ''} ${sort.sorting ? 'sorting' : ''} ${leaving ? 'leaving' : ''} ${wait ? 'after-gone' : ''}`} role="toolbar" aria-label="Форматирование текста"
      {...sort.container} onPointerDown={(e) => { if (!(e.target as Element).closest('input')) e.preventDefault(); sort.container.onPointerDown(e); }}>
      {/* (As the actions' button at the other end: as far in, its hover as big.) */}
      {onBack && <button className="fb back" title="Назад" aria-label="Назад" data-nosort onClick={onBack}><Icon name="chevron-left" /></button>}
      {sort.renderFit({
        font: <span className="sort-wrap"><Drop open={menu === 'font'} menu={Object.entries(FONTS).map(([k, f]) => (
          <button key={k} className={`tf-item ${(item.ff ?? baseFont) === k ? 'on' : ''}`} style={{ fontFamily: f.css }}
            onClick={() => set({ ff: k === baseFont ? undefined : k })}>{f.label}</button>
        ))}>
          <Pick value={FONTS[item.ff ?? baseFont]?.label ?? 'Onest'} label="Шрифт" onClick={() => toggle('font')} />
        </Drop></span>,
        gap: <div className="fsep" />,
        style: <span className="sort-wrap"><Drop open={menu === 'style'} menu={<>
          {/* (In a document being typed in, the caret's paragraph's: see headPart.) */}
          <button className={`tf-item ${(level ?? (heading ? 1 : 0)) ? '' : 'on'}`} onClick={() => headPart(0) || set({ fs: task ? undefined : DEFAULTS[item.type].fs, fw: undefined })}>Обычный</button>
          {HEADINGS.map(([label, size], i) => (
            <button key={label} className={`tf-item ${(level !== null ? level === i + 1 : heading?.[0] === label) ? 'on' : ''}`} style={{ fontSize: Math.round(size * 0.55), fontWeight: 700 }}
              onClick={() => headPart(i + 1) || set({ fs: size, fw: 700 })}>{label}</button>
          ))}
        </>}>
          <Pick value={level !== null ? (level ? HEADINGS[level - 1][0] : 'Обычный') : heading?.[0] ?? 'Обычный'} label="Стиль" onClick={() => toggle('style')} />
        </Drop></span>,
        gap2: <div className="fsep" />,
        size: <span className="sort-wrap"><Drop open={menu === 'size'} menu={SIZES.map((s) => (
          <button key={s} className={`tf-item num ${s === fs ? 'on' : ''}`} onClick={() => set({ fs: s })}>{s}</button>
        ))}>
          {/* Several picked of different sizes (fs 0): none to show. */}
          <Pick value={fs ? String(fs) : '—'} label="Размер" onClick={() => toggle('size')} />
        </Drop></span>,
        gap3: <div className="fsep" />,
        bold: <span className="sort-wrap"><Btn icon="bold" label="Жирный" on={picked || rich ? partHas('b') : bold} onClick={() => stylePart('b') || set({ fw: bold ? 400 : 700 })} /></span>,
        italic: <span className="sort-wrap"><Btn icon="italic" label="Курсив" on={picked || rich ? partHas('i') : item.fi} onClick={() => stylePart('i') || set({ fi: item.fi ? undefined : true })} /></span>,
        underline: <span className="sort-wrap"><Btn icon="underline" label="Подчёркнутый" on={picked || rich ? partHas('u') : item.fu} onClick={() => stylePart('u') || set({ fu: item.fu ? undefined : true })} /></span>,
        strike: <span className="sort-wrap"><Btn icon="strike" label="Зачёркнутый" on={picked || rich ? partHas('x') : item.fx} onClick={() => stylePart('x') || set({ fx: item.fx ? undefined : true })} /></span>,
        sep: <div className="fsep line" />,
        // The text's colour and its highlight: the same row of colours and opacity as in «Параметры».
        color: <span className="sort-wrap"><Drop open={menu === 'color'} params menu={
          <ColorRow editor={editor} label="Цвет текста" colors={Object.fromEntries(Object.entries(TEXT_COLORS).map(([k, v]) => [k, v || 'var(--ink)']))}
            current={item.tc ?? 'ink'} opacity={item.to ?? 1} onColor={(c) => stylePart('c', c === 'ink' ? undefined : c) || set({ tc: c === 'ink' ? undefined : c }, true)} onOpacity={(v) => editor.setOpacity('text', v ?? 1)} />}>
          <Btn icon="color" label="Цвет текста" swatch={textColor ?? 'var(--fmt-ink)'} on={menu === 'color'} onClick={() => toggle('color')} />
        </Drop></span>,
        mark: <span className="sort-wrap"><Drop open={menu === 'mark'} params menu={
          <ColorRow editor={editor} label="Выделение цветом" colors={MARK_COLORS} none current={item.mk ?? 'none'} opacity={item.mo ?? 0.45}
            onColor={(c) => set({ mk: c === 'none' ? undefined : c }, true)} onOpacity={(v) => editor.setOpacity('mark', v ?? 1)} />}>
          <Btn icon="marker" label="Выделение цветом" swatch={mark ?? 'transparent'} on={menu === 'mark'} onClick={() => toggle('mark')} />
        </Drop></span>,
        sep2: <div className="fsep line" />,
        align: <span className="sort-wrap"><Drop open={menu === 'align'} menu={<div className="tf-row">
          {(['left', 'center', 'right'] as TextAlign[]).map((a) => (
            <Btn key={a} icon={ALIGN_ICONS[a]} label={ALIGN_LABELS[a]} on={align === a} onClick={() => set({ ta: a })} />
          ))}
          {/* (Up and down, in what has room round its text: a sticker, a shape.) */}
          {['sticky', 'rect', 'ellipse', 'polygon'].includes(item.type) && !item.code && <>
            <div className="fsep line" />
            {VALIGNS.map(([v, icon, label]) => (
              <Btn key={label} icon={icon} label={label} on={item.va === v} onClick={() => set({ va: v })} />
            ))}
          </>}
        </div>}>
          <Btn icon={ALIGN_ICONS[align]} label="Выравнивание" menu on={menu === 'align'} onClick={() => toggle('align')} />
        </Drop></span>,
        sep3: <div className="fsep line" />,
        list: <span className="sort-wrap"><Drop open={menu === 'list'} menu={<div className="tf-row">
          {LISTS.map(([kind, icon, label]) => (
            // (In a document typed in as it looks, the caret's paragraphs': see richList.)
            <Btn key={kind} icon={icon} label={label} on={rich ? rich.l === kind : item.ls === kind}
              onClick={() => { if (rich && richList(kind)) { setMenu(null); return; } set({ ls: item.ls === kind ? undefined : kind }); }} />
          ))}
        </div>}>
          <Btn icon={(rich ? rich.l : item.ls) === 'number' ? 'numbered-list' : 'list'} label="Список" menu on={!!(rich ? rich.l : item.ls) || menu === 'list'} onClick={() => toggle('list')} />
        </Drop></span>,
        // "Ссылка в тексте" (src/labs): an address for the item, typed in its menu.
        // A part of the text picked while typing in it: just that part; else the whole item.
        link: labs.textLink ? <span className="sort-wrap"><Drop open={menu === 'link'} menu={<LinkMenu item={item} part={part} onSet={(typed) => {
          editor.beginChange();
          if (part) editor.board.update(item.id, linkPartPatch(item, part.text, part.s, part.e, typed));
          else for (const it of editor.selectedItems()) editor.board.update(it.id, linkPatch(it, typed));
          editor.endChange();
          setMenu(null);
        }} />}>
          <Btn icon="link" label="Ссылка" on={!!item.url || menu === 'link'} onClick={() => { setPart(pickedPart(editor, item)); toggle('link'); }} />
        </Drop></span> : undefined,
      }, textRoom() - (labs.contextMenu ? MENU_BUTTON : 0), 'above')}
      {/* The right click's menu, always at the right end ("Меню по правому клику", src/labs). */}
      {labs.contextMenu && <ItemMenuButton className="fb" />}
    </div>
  );
}
