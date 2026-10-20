import type { Editor } from '../editor/editor';
import type { Item } from '../model/types';
import { COLORABLE, FILLS, HAS_FONT, ICON_COLORS } from '../model/types';
import { Stroke, type StrokeName } from './glyphs';

const same = (vals: Array<string | undefined>) => (vals.length && vals.every((v) => v === vals[0]) ? vals[0] : null);

export function SelectionPanel({ editor, items, linkCount }: { editor: Editor; items: Item[]; linkCount: number }) {
  if (!items.length && !linkCount) return null;
  const colorable = items.filter((i) => COLORABLE.includes(i.type));
  const icons = items.filter((i) => i.type === 'icon');
  const sized = items.filter((i) => HAS_FONT.includes(i.type));
  const fill = same(colorable.map((i) => i.color));
  const iconColor = same(icons.map((i) => i.color));
  const allowNone = colorable.length > 0 && colorable.every((i) => i.type !== 'sticky');
  const btn = (icon: StrokeName, title: string, fn: () => void) => (
    <button className="ib" title={title} aria-label={title} onClick={fn}><Stroke name={icon} /></button>
  );
  return (
    <div className="bar panel" role="toolbar" aria-label="Выделенное">
      {colorable.length > 0 && (
        <>
          {Object.entries(FILLS).filter(([k]) => k !== 'none' || allowNone).map(([k, v]) => (
            <button key={k} className={`sw ${k === 'none' ? 'none' : ''} ${fill === k ? 'on' : ''}`} style={{ background: v }}
              title={k === 'none' ? 'Без заливки' : 'Цвет'} aria-label={k === 'none' ? 'Без заливки' : `Цвет ${k}`}
              onClick={() => editor.setColor(k)} />
          ))}
          <div className="sep" />
        </>
      )}
      {icons.length > 0 && (
        <>
          {Object.entries(ICON_COLORS).map(([k, v]) => (
            <button key={k} className={`sw ${iconColor === k ? 'on' : ''}`} style={{ background: v || 'var(--ink)' }}
              title="Цвет иконки" aria-label={`Цвет иконки ${k}`} onClick={() => editor.setIconColor(k)} />
          ))}
          <div className="sep" />
        </>
      )}
      {sized.length > 0 && (
        <>
          {btn('smaller', 'Меньше шрифт', () => editor.changeFontSize(-1))}
          {btn('bigger', 'Больше шрифт', () => editor.changeFontSize(1))}
          <div className="sep" />
        </>
      )}
      {items.length > 0 && (
        <>
          {btn('front', 'На передний план', () => editor.bringToFront())}
          {btn('back', 'На задний план', () => editor.sendToBack())}
          {btn('dup', 'Дублировать (Ctrl+D)', () => editor.duplicate())}
        </>
      )}
      {btn('del', 'Удалить (Del)', () => editor.deleteSelection())}
    </div>
  );
}
