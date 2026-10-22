/** Text formatting panel from the Figma mockup (Mol / Bar). Layout only: the controls do nothing yet.
 *  The panel can be dragged by any spot that isn't a control, and folds down to its arrow button. */
import { useLayoutEffect, useRef, useState, type PointerEvent } from 'react';

import type { Editor } from '../editor/editor';
import { DEFAULTS, type Item } from '../model/types';
import { DOT_GAP, DOT_R } from '../canvas/renderer';
import { PanelIcon as Icon, type PanelIconName as IconName } from './PanelIcon';

function Btn({ icon, label, on, off, swatch, menu }: {
  icon: IconName; label: string; on?: boolean; off?: boolean; swatch?: string; menu?: boolean;
}) {
  return (
    <button className={`fb ${on ? 'on' : ''} ${swatch ? 'sw-btn' : ''}`} title={label} aria-label={label} disabled={off}>
      <Icon name={icon} />
      {swatch && <i className="swatch" style={{ background: swatch }} />}
      {menu && <Icon name="drop" className="caret" />}
    </button>
  );
}

function Pick({ value, label }: { value: string; label: string }) {
  return (
    <button className="fpick" title={label} aria-label={`${label}: ${value}`}>
      {value}<Icon name="drop" className="caret" />
    </button>
  );
}

/** Gap between the selected item's top dot and the text panel, and the panel's margin to the screen edge. */
const GAP = 20, MARGIN = 12;

/** The text controls of the panel below, hung 20px over the top dot of the selected text or sticker
 *  (under the bottom dot when there's no room above). Layout only as well, apart from showing the size. */
export function TextPanel({ editor, item }: { editor: Editor; item: Item }) {
  const el = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const box = el.current!;
    const w = box.offsetWidth, h = box.offsetHeight;
    const top = editor.toScreen({ x: item.x + item.w / 2, y: item.y });
    const bottom = editor.toScreen({ x: 0, y: item.y + item.h }).y;
    const reach = DOT_GAP + DOT_R + GAP;
    const y = top.y - reach - h >= MARGIN ? top.y - reach - h : bottom + reach;
    // Stay clear of the tool rail when level with it.
    const rail = document.querySelector('.tools')?.getBoundingClientRect();
    const minX = rail && rail.top < y + h && rail.bottom > y ? rail.right + MARGIN : MARGIN;
    box.style.left = `${Math.max(minX, Math.min(top.x - w / 2, innerWidth - w - MARGIN))}px`;
    box.style.top = `${y}px`;
  });
  const fs = item.fs ?? DEFAULTS[item.type].fs;
  return (
    // Keep focus in the text being edited when a control is pressed.
    <div ref={el} className="tfmt" role="toolbar" aria-label="Форматирование текста" onPointerDown={(e) => e.preventDefault()}>
      <Pick value="Carlito" label="Шрифт" />
      <div className="fsep" />
      <Pick value="Обычный" label="Стиль" />
      <div className="fsep" />
      <Pick value={String(fs)} label="Размер" />
      <div className="fsep" />
      <Btn icon="bold" label="Жирный" on={(item.fw ?? 400) >= 600} />
      <Btn icon="italic" label="Курсив" />
      <Btn icon="underline" label="Подчёркнутый" />
      <Btn icon="strike" label="Зачёркнутый" />
      <div className="fsep line" />
      <Btn icon="color" label="Цвет текста" swatch="#FFA600" />
      <Btn icon="marker" label="Выделение цветом" swatch="var(--fmt-marker)" />
      <div className="fsep line" />
      <Btn icon="align" label="Выравнивание" menu />
      <div className="fsep line" />
      <Btn icon="list" label="Список" menu />
    </div>
  );
}

export function FormatPanel() {
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const drag = useRef<{ x: number; y: number } | null>(null);
  const el = useRef<HTMLDivElement>(null);
  const foldShift = useRef(0);

  const down = (e: PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 || (e.target as HTMLElement).closest('button')) return;
    drag.current = { x: e.clientX - pos.x, y: e.clientY - pos.y };
    e.currentTarget.setPointerCapture(e.pointerId);
    setDragging(true);
  };
  const move = (e: PointerEvent<HTMLDivElement>) => {
    if (!drag.current) return;
    // Keep the panel's centre on screen so it can't be lost.
    const maxX = innerWidth / 2, maxY = innerHeight / 2;
    setPos({
      x: Math.max(-maxX, Math.min(maxX, e.clientX - drag.current.x)),
      y: Math.max(-maxY, Math.min(maxY, e.clientY - drag.current.y)),
    });
  };
  const up = () => { drag.current = null; setDragging(false); };

  // The panel is centred on pos, so when it folds into a square around the arrow, move the centre
  // onto the arrow (and back on unfold) to keep the arrow where it was.
  const toggle = () => {
    if (!collapsed) {
      const panel = el.current!.getBoundingClientRect();
      const arrow = el.current!.querySelector('.toggle')!.getBoundingClientRect();
      foldShift.current = arrow.x + arrow.width / 2 - (panel.x + panel.width / 2);
    }
    setPos((p) => ({ ...p, x: p.x + (collapsed ? -foldShift.current : foldShift.current) }));
    setCollapsed(!collapsed);
  };

  return (
    <div ref={el} className={`fmt ${dragging ? 'dragging' : ''} ${collapsed ? 'collapsed' : ''}`} role="toolbar" aria-label="Форматирование текста"
      style={{ transform: `translate(calc(-50% + ${pos.x}px), calc(-50% + ${pos.y}px))` }}
      onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}>
      {!collapsed && <>
        <Btn icon="undo" label="Отменить" />
        <Btn icon="redo" label="Вернуть" off />
        <Btn icon="search" label="Поиск" />
        <Btn icon="comment" label="Комментарий" />
        <div className="fsep" />
        <Pick value="100%" label="Масштаб" />
        <div className="fsep line" />
        <Pick value="Carlito" label="Шрифт" />
        <div className="fsep" />
        <Pick value="Обычный" label="Стиль" />
        <div className="fsep" />
        <Pick value="18" label="Размер" />
        <div className="fsep" />
        <Btn icon="bold" label="Жирный" on />
        <Btn icon="italic" label="Курсив" />
        <Btn icon="underline" label="Подчёркнутый" />
        <Btn icon="strike" label="Зачёркнутый" />
        <div className="fsep line" />
        <Btn icon="color" label="Цвет текста" swatch="#FFA600" />
        <Btn icon="marker" label="Выделение цветом" swatch="var(--fmt-marker)" />
        <div className="fsep line" />
        <Btn icon="align" label="Выравнивание" menu />
        <div className="fsep line" />
        <Btn icon="list" label="Список" menu />
        <div className="fsep line" />
        <Btn icon="columns" label="Колонки" />
        <Btn icon="image" label="Изображение" />
        <Btn icon="link" label="Ссылка" />
        <div className="fsep line" />
        <Btn icon="clear" label="Очистить форматирование" />
        <Btn icon="paint" label="Копировать формат" />
        <Btn icon="sup" label="Надстрочный" />
        <Btn icon="sub" label="Подстрочный" />
        <div className="fmt-gap" />
      </>}
      <button className="fb toggle" title={collapsed ? 'Развернуть панель' : 'Свернуть панель'}
        aria-label={collapsed ? 'Развернуть панель' : 'Свернуть панель'} aria-expanded={!collapsed} onClick={toggle}>
        <Icon name="up" />
      </button>
    </div>
  );
}
