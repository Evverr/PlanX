import { useEffect, useLayoutEffect, useReducer, useState } from 'react';
import type { Editor } from '../editor/editor';
import type { Item } from '../model/types';
import { COLORABLE, FILLS, ICON_COLORS } from '../model/types';
import { PanelIcon, type PanelIconName } from './PanelIcon';
import { useSortable } from './sortable';

const same = (vals: Array<string | undefined>) => (vals.length && vals.every((v) => v === vals[0]) ? vals[0] : null);

/** Rearrangeable buttons; the bin isn't among them, it always comes last. */
const ORDER = ['fills', 'sep', 'icons', 'sep2', 'rows', 'sep5', 'cols', 'sep4', 'front', 'back', 'duplicate'];

export function SelectionPanel({ editor, items, linkCount, docked }: { editor: Editor; items: Item[]; linkCount: number; docked: boolean }) {
  // Hooks come before the early return; buttons can be rearranged by holding them.
  const sort = useSortable('planx-order-selection', ORDER, 'x');
  // When it would run into the zoom panel beside it, the panel moves up above the bottom bars.
  const [raised, setRaised] = useState(false);
  const [, redraw] = useReducer((n: number) => n + 1, 0);
  useEffect(() => {
    window.addEventListener('resize', redraw);
    return () => window.removeEventListener('resize', redraw);
  }, []);
  useLayoutEffect(() => {
    const zoom = document.querySelector('.zoom')?.getBoundingClientRect(), own = sort.ref.current?.getBoundingClientRect();
    if (!zoom || !own) return;
    const clash = own.right + 8 > zoom.left && own.left < zoom.right + 8;
    if (clash !== raised) setRaised(clash);
  });
  if (!items.length && !linkCount) return null;
  const colorable = items.filter((i) => COLORABLE.includes(i.type));
  const icons = items.filter((i) => i.type === 'icon');
  const tables = items.filter((i) => i.type === 'table');
  const fill = same(colorable.map((i) => i.color));
  const iconColor = same(icons.map((i) => i.color));
  const allowNone = colorable.length > 0 && colorable.every((i) => i.type !== 'sticky');
  const custom = fill?.startsWith('#') ? fill : null;
  const btn = (icon: PanelIconName, title: string, fn: () => void) => (
    <button className="ib" title={title} aria-label={title} onClick={fn}><PanelIcon name={icon} /></button>
  );
  return (
    <div ref={sort.ref as React.RefObject<HTMLDivElement>} className={`bar panel sortable ${docked ? 'docked' : ''} ${raised ? 'raised' : ''} ${sort.sorting ? 'sorting' : ''}`}
      role="toolbar" aria-label="Выделенное" {...sort.container}>
      {sort.render({
        fills: colorable.length > 0 ? (
          <div className="sw-group">
            {Object.entries(FILLS).filter(([k]) => k !== 'none' || allowNone).map(([k, v]) => (
              <button key={k} className={`sw ${k === 'none' ? 'none' : ''} ${fill === k ? 'on' : ''}`} style={{ background: v }}
                title={k === 'none' ? 'Без заливки' : 'Цвет'} aria-label={k === 'none' ? 'Без заливки' : `Цвет ${k}`}
                onClick={() => editor.setColor(k)} />
            ))}
            {/* Any colour: the browser's own picker (hue strip plus saturation/brightness square). */}
            <label className={`sw custom ${custom ? 'on' : ''}`} style={custom ? { background: custom } : undefined} title="Свой цвет">
              <input type="color" aria-label="Свой цвет" value={custom ?? FILLS.yellow.toLowerCase()} onChange={(e) => editor.setColor(e.target.value)} />
            </label>
          </div>
        ) : undefined,
        icons: icons.length > 0 ? (
          <div className="sw-group">
            {Object.entries(ICON_COLORS).map(([k, v]) => (
              <button key={k} className={`sw ${iconColor === k ? 'on' : ''}`} style={{ background: v || 'var(--ink)' }}
                title="Цвет иконки" aria-label={`Цвет иконки ${k}`} onClick={() => editor.setIconColor(k)} />
            ))}
          </div>
        ) : undefined,
        // Rows and columns of the selected tables: add or take away the last one.
        rows: tables.length > 0 ? (
          <div className="sw-group table-count">
            <span>Строки</span>
            {btn('minus-s', 'Убрать строку', () => editor.changeTable('row', -1))}
            {btn('plus-s', 'Добавить строку', () => editor.changeTable('row', 1))}
          </div>
        ) : undefined,
        cols: tables.length > 0 ? (
          <div className="sw-group table-count">
            <span>Столбцы</span>
            {btn('minus-s', 'Убрать столбец', () => editor.changeTable('col', -1))}
            {btn('plus-s', 'Добавить столбец', () => editor.changeTable('col', 1))}
          </div>
        ) : undefined,
        sep5: <div className="sep" />,
        sep4: <div className="sep" />,
        front: items.length > 0 ? btn('to-front', 'На передний план', () => editor.bringToFront()) : undefined,
        back: items.length > 0 ? btn('to-back', 'На задний план', () => editor.sendToBack()) : undefined,
        duplicate: items.length > 0 ? btn('duplicate', 'Дублировать (Ctrl+D)', () => editor.duplicate()) : undefined,
        sep: <div className="sep" />,
        sep2: <div className="sep" />,
      })}
      {btn('trashcan', 'Удалить (Del)', () => editor.deleteSelection())}
    </div>
  );
}
