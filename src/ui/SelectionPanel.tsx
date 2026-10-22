import type { Editor } from '../editor/editor';
import type { Item } from '../model/types';
import { COLORABLE, FILLS, HAS_FONT, ICON_COLORS } from '../model/types';
import { PanelIcon, type PanelIconName } from './PanelIcon';
import { useSortable } from './sortable';

const same = (vals: Array<string | undefined>) => (vals.length && vals.every((v) => v === vals[0]) ? vals[0] : null);

const ORDER = ['fills', 'sep', 'icons', 'sep2', 'smaller', 'bigger', 'sep3', 'front', 'back', 'duplicate', 'trash'];

export function SelectionPanel({ editor, items, linkCount, docked }: { editor: Editor; items: Item[]; linkCount: number; docked: boolean }) {
  // Hooks come before the early return; buttons can be rearranged by holding them.
  const sort = useSortable('planx-order-selection', ORDER, 'x');
  if (!items.length && !linkCount) return null;
  const colorable = items.filter((i) => COLORABLE.includes(i.type));
  const icons = items.filter((i) => i.type === 'icon');
  const sized = items.filter((i) => HAS_FONT.includes(i.type));
  const fill = same(colorable.map((i) => i.color));
  const iconColor = same(icons.map((i) => i.color));
  const allowNone = colorable.length > 0 && colorable.every((i) => i.type !== 'sticky');
  const custom = fill?.startsWith('#') ? fill : null;
  const btn = (icon: PanelIconName, title: string, fn: () => void) => (
    <button className="ib" title={title} aria-label={title} onClick={fn}><PanelIcon name={icon} /></button>
  );
  return (
    <div ref={sort.ref as React.RefObject<HTMLDivElement>} className={`bar panel sortable ${docked ? 'docked' : ''} ${sort.sorting ? 'sorting' : ''}`}
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
        smaller: sized.length > 0 ? btn('font-smaller', 'Меньше шрифт', () => editor.changeFontSize(-1)) : undefined,
        bigger: sized.length > 0 ? btn('font-bigger', 'Больше шрифт', () => editor.changeFontSize(1)) : undefined,
        front: items.length > 0 ? btn('to-front', 'На передний план', () => editor.bringToFront()) : undefined,
        back: items.length > 0 ? btn('to-back', 'На задний план', () => editor.sendToBack()) : undefined,
        duplicate: items.length > 0 ? btn('duplicate', 'Дублировать (Ctrl+D)', () => editor.duplicate()) : undefined,
        trash: btn('trashcan', 'Удалить (Del)', () => editor.deleteSelection()),
        sep: <div className="sep" />,
        sep2: <div className="sep" />,
        sep3: <div className="sep" />,
      })}
    </div>
  );
}
