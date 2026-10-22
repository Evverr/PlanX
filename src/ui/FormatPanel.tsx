/** Text formatting panel over the selected text or sticker, built from the controls of the
 *  Figma mockup (Mol / Bar). Layout only: the controls do nothing yet. */
import { useLayoutEffect, useRef } from 'react';

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

/** Hung 20px over the top dot of the selected text or sticker (under the bottom dot when there's
 *  no room above). Only the size shows the item's own value. */
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
