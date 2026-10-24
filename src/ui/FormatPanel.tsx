/** Text formatting panel over the selected text or sticker, built from the controls of the
 *  Figma mockup (Mol / Bar). Each setting applies to the item's whole text. */
import { useEffect, useLayoutEffect, useReducer, useState, type ReactNode } from 'react';

import type { Editor } from '../editor/editor';
import { alignOf, baseWeight, DEFAULTS, MARK_COLORS, TEXT_COLORS, type Item, type ListKind, type TextAlign } from '../model/types';
import { DOT_GAP, DOT_R } from '../canvas/renderer';
import { boxOf } from '../canvas/geometry';
import { FONTS } from '../canvas/text';
import { PanelIcon as Icon, type PanelIconName as IconName } from './PanelIcon';
import { useSortable } from './sortable';

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
function Drop({ open, menu, grid, children }: { open: boolean; menu: ReactNode; grid?: boolean; children: ReactNode }) {
  return (
    <div className="tf-drop">
      {children}
      {open && <div className={`tf-menu ${grid ? 'grid' : ''}`} role="menu" data-nosort>{menu}</div>}
    </div>
  );
}

const SIZES = [10, 12, 14, 16, 18, 20, 24, 28, 32, 36, 48, 64, 72, 96];
/** Text styles set size and weight together; "Обычный" is the type's own size and weight. */
const HEADINGS: Array<[string, number]> = [['Заголовок 1', 40], ['Заголовок 2', 30], ['Заголовок 3', 22]];
const ALIGN_ICONS: Record<TextAlign, IconName> = { left: 'align-left', center: 'align-center', right: 'align-right' };
const ALIGN_LABELS: Record<TextAlign, string> = { left: 'По левому краю', center: 'По центру', right: 'По правому краю' };
const LISTS: Array<[ListKind, IconName, string]> = [['bullet', 'bulleted-list', 'Маркированный список'], ['number', 'numbered-list', 'Нумерованный список']];

const hex = (c: string | undefined, table: Record<string, string>) => (c ? (c.startsWith('#') ? c : table[c]) : undefined);

const ORDER = ['font', 'gap', 'style', 'gap2', 'size', 'gap3', 'bold', 'italic', 'underline', 'strike', 'sep', 'color', 'mark', 'sep2', 'align', 'sep3', 'list'];

type Menu = 'font' | 'style' | 'size' | 'color' | 'mark' | 'align' | 'list';

/** Gap between the selected item's top dot and the text panel, and the panel's margin to the screen edge. */
const GAP = 20, MARGIN = 12;

/** How wide the text panel may be: the screen less its margins, and the tool rail beside it. */
function textRoom(): number {
  const rail = document.querySelector('.tools')?.getBoundingClientRect();
  return innerWidth - MARGIN - (rail ? rail.right + MARGIN : MARGIN);
}

/** Hung 20px over the top dot of the selected text or sticker (under the bottom dot when there's no room above). */
export function TextPanel({ editor, item }: { editor: Editor; item: Item }) {
  const sort = useSortable('planx-order-text', ORDER, 'x');
  const el = sort.ref;
  const [menu, setMenu] = useState<Menu | null>(null);
  useLayoutEffect(() => {
    const box = el.current!;
    const w = box.offsetWidth, h = box.offsetHeight;
    // A turned item's box square to the screen.
    const b = boxOf(item);
    const top = editor.toScreen({ x: b.x + b.w / 2, y: b.y });
    const bottom = editor.toScreen({ x: 0, y: b.y + b.h }).y;
    const reach = DOT_GAP + DOT_R + GAP;
    // Above the item if it fits under the top bar (when level with it), otherwise below.
    const bar = document.querySelector('.topbar')?.getBoundingClientRect();
    const underBar = bar && top.x - w / 2 < bar.right && top.x + w / 2 > bar.left;
    const y = top.y - reach - h >= (underBar ? bar.bottom : 0) + MARGIN ? top.y - reach - h : bottom + reach;
    // Stay clear of the tool rail when level with it.
    const rail = document.querySelector('.tools')?.getBoundingClientRect();
    const minX = rail && rail.top < y + h && rail.bottom > y ? rail.right + MARGIN : MARGIN;
    box.style.left = `${Math.max(minX, Math.min(top.x - w / 2, innerWidth - w - MARGIN))}px`;
    box.style.top = `${y}px`;
  });
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
  /** Applies a change and closes the menu it came from. */
  const set = (patch: Partial<Item>, keepOpen = false) => { editor.setTextStyle(patch); if (!keepOpen) setMenu(null); };

  const fs = item.fs ?? DEFAULTS[item.type].fs ?? 16;
  const bold = (item.fw ?? baseWeight(item.type)) >= 600;
  const heading = HEADINGS.find(([, size]) => size === fs && bold);
  const align = alignOf(item);
  const textColor = hex(item.tc, TEXT_COLORS);
  const mark = hex(item.mk, MARK_COLORS);

  return (
    // Keep focus in the text being edited when a control is pressed. Controls can be rearranged by holding them;
    // components can't take the ref, so each sits in a wrapper.
    <div ref={sort.ref as React.RefObject<HTMLDivElement>} className={`tfmt sortable ${sort.sorting ? 'sorting' : ''}`} role="toolbar" aria-label="Форматирование текста"
      {...sort.container} onPointerDown={(e) => { e.preventDefault(); sort.container.onPointerDown(e); }}>
      {sort.renderFit({
        font: <span className="sort-wrap"><Drop open={menu === 'font'} menu={Object.entries(FONTS).map(([k, f]) => (
          <button key={k} className={`tf-item ${(item.ff ?? 'onest') === k ? 'on' : ''}`} style={{ fontFamily: f.css }}
            onClick={() => set({ ff: k === 'onest' ? undefined : k })}>{f.label}</button>
        ))}>
          <Pick value={FONTS[item.ff ?? 'onest']?.label ?? 'Onest'} label="Шрифт" onClick={() => toggle('font')} />
        </Drop></span>,
        gap: <div className="fsep" />,
        style: <span className="sort-wrap"><Drop open={menu === 'style'} menu={<>
          <button className={`tf-item ${heading ? '' : 'on'}`} onClick={() => set({ fs: DEFAULTS[item.type].fs, fw: undefined })}>Обычный</button>
          {HEADINGS.map(([label, size]) => (
            <button key={label} className={`tf-item ${heading?.[0] === label ? 'on' : ''}`} style={{ fontSize: Math.round(size * 0.55), fontWeight: 700 }}
              onClick={() => set({ fs: size, fw: 700 })}>{label}</button>
          ))}
        </>}>
          <Pick value={heading?.[0] ?? 'Обычный'} label="Стиль" onClick={() => toggle('style')} />
        </Drop></span>,
        gap2: <div className="fsep" />,
        size: <span className="sort-wrap"><Drop open={menu === 'size'} menu={SIZES.map((s) => (
          <button key={s} className={`tf-item num ${s === fs ? 'on' : ''}`} onClick={() => set({ fs: s })}>{s}</button>
        ))}>
          <Pick value={String(fs)} label="Размер" onClick={() => toggle('size')} />
        </Drop></span>,
        gap3: <div className="fsep" />,
        bold: <span className="sort-wrap"><Btn icon="bold" label="Жирный" on={bold} onClick={() => set({ fw: bold ? 400 : 700 })} /></span>,
        italic: <span className="sort-wrap"><Btn icon="italic" label="Курсив" on={item.fi} onClick={() => set({ fi: item.fi ? undefined : true })} /></span>,
        underline: <span className="sort-wrap"><Btn icon="underline" label="Подчёркнутый" on={item.fu} onClick={() => set({ fu: item.fu ? undefined : true })} /></span>,
        strike: <span className="sort-wrap"><Btn icon="strike" label="Зачёркнутый" on={item.fx} onClick={() => set({ fx: item.fx ? undefined : true })} /></span>,
        sep: <div className="fsep line" />,
        color: <span className="sort-wrap"><Drop open={menu === 'color'} grid menu={Object.entries(TEXT_COLORS).map(([k, v]) => (
          <button key={k} className={`sw ${(item.tc ?? 'ink') === k ? 'on' : ''}`} style={{ background: v || 'var(--ink)' }}
            title={k === 'ink' ? 'Обычный' : undefined} aria-label={`Цвет текста ${k}`} onClick={() => set({ tc: k === 'ink' ? undefined : k })} />
        ))}>
          <Btn icon="color" label="Цвет текста" swatch={textColor ?? 'var(--fmt-ink)'} on={menu === 'color'} onClick={() => toggle('color')} />
        </Drop></span>,
        mark: <span className="sort-wrap"><Drop open={menu === 'mark'} grid menu={<>
          <button className={`sw none ${item.mk ? '' : 'on'}`} aria-label="Без выделения" title="Без выделения" onClick={() => set({ mk: undefined })} />
          {Object.entries(MARK_COLORS).map(([k, v]) => (
            <button key={k} className={`sw ${item.mk === k ? 'on' : ''}`} style={{ background: v }} aria-label={`Выделение ${k}`} onClick={() => set({ mk: k })} />
          ))}
        </>}>
          <Btn icon="marker" label="Выделение цветом" swatch={mark ?? 'transparent'} on={menu === 'mark'} onClick={() => toggle('mark')} />
        </Drop></span>,
        sep2: <div className="fsep line" />,
        align: <span className="sort-wrap"><Drop open={menu === 'align'} menu={<div className="tf-row">
          {(['left', 'center', 'right'] as TextAlign[]).map((a) => (
            <Btn key={a} icon={ALIGN_ICONS[a]} label={ALIGN_LABELS[a]} on={align === a} onClick={() => set({ ta: a })} />
          ))}
        </div>}>
          <Btn icon={ALIGN_ICONS[align]} label="Выравнивание" menu on={menu === 'align'} onClick={() => toggle('align')} />
        </Drop></span>,
        sep3: <div className="fsep line" />,
        list: <span className="sort-wrap"><Drop open={menu === 'list'} menu={<div className="tf-row">
          {LISTS.map(([kind, icon, label]) => (
            <Btn key={kind} icon={icon} label={label} on={item.ls === kind} onClick={() => set({ ls: item.ls === kind ? undefined : kind })} />
          ))}
        </div>}>
          <Btn icon={item.ls === 'number' ? 'numbered-list' : 'list'} label="Список" menu on={!!item.ls || menu === 'list'} onClick={() => toggle('list')} />
        </Drop></span>,
      }, textRoom(), 'above')}
    </div>
  );
}
