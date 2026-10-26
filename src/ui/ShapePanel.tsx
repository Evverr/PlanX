import { useEffect, useRef, useState } from 'react';
import type { Editor, Tool } from '../editor/editor';
import { setShapeStyle, shapePatch, useShapeStyle, type ShapeStyle } from '../editor/shapeStyle';
import { Glyph } from './glyphs';
import { Switch } from './BoardMenu';
import { PanelIcon, type PanelIconName } from './PanelIcon';
import { useSortable } from './sortable';
import { ToolPreview } from './ToolPreview';

export const SHAPES: Array<[Tool, PanelIconName, string]> = [
  ['rect', 'landscape', 'Прямоугольник (R)'],
  ['ellipse', 'ellipse', 'Эллипс (O)'],
  ['triangle', 'triangle', 'Треугольник'],
  ['rhombus', 'rhombus', 'Ромб'],
  ['pentagon', 'pentagon', 'Пятиугольник'],
  ['star', 'star', 'Звезда'],
  ['hexagon', 'hexagon', 'Шестиугольник'],
  ['parallelogram', 'parallelogram', 'Параллелограмм'],
  ['trapezoid', 'trapezoid', 'Трапеция'],
  ['arrow', 'arrow', 'Стрелка-фигура'],
  ['cross', 'shape-cross', 'Крест'],
];

/** Figures next to the tool rail, opened by holding its shapes button; pick one, then drag out its box
 *  on the board, or drag it off the panel onto the board. Under them a gear: how they come out (see
 *  ShapeMenu). */
export function ShapePanel({ editor, tool, zoom, onPick }: { editor: Editor; tool: Tool; zoom: number; onPick: () => void }) {
  const sort = useSortable('planx-order-shapes', SHAPES.map(([t]) => t), 'y', {}, {
    preview: (key) => <ToolPreview tool={key as Tool} zoom={zoom} />,
    drop: (key, at) => { editor.dropItem(key as Tool, at); onPick(); },
  });
  const [menu, setMenu] = useState(false);
  return (
    <div ref={sort.ref as React.RefObject<HTMLDivElement>} className={`draw-panel shape-panel sortable ${sort.sorting ? 'sorting' : ''}`} role="toolbar" aria-label="Фигуры"
      {...sort.container}>
      {sort.render(Object.fromEntries(SHAPES.map(([t, icon, label]) => [t, (
        <button className={`fb ${tool === t ? 'on' : ''}`} title={label} aria-label={label.replace(/ \(.*\)$/, '')} aria-pressed={tool === t}
          onClick={() => { editor.setTool(t); onPick(); }}>
          <PanelIcon name={icon} />
        </button>
      )])))}
      <button className={`fb ${menu ? 'on' : ''}`} title="Настройки фигур" aria-label="Настройки фигур" aria-expanded={menu} data-nosort
        onClick={() => setMenu(!menu)}>
        <PanelIcon name="settings" />
      </button>
      {menu && <ShapeMenu editor={editor} onClose={() => setMenu(false)} />}
      {sort.ghost}
    </div>
  );
}

/** The gear's menu, as the board's: how new shapes come out, and the selected ones too as it's changed. */
function ShapeMenu({ editor, onClose }: { editor: Editor; onClose: () => void }) {
  const s = useShapeStyle();
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const away = (e: PointerEvent) => { if (!ref.current?.contains(e.target as Node) && !(e.target as Element | null)?.closest?.('[aria-label="Настройки фигур"]')) onClose(); };
    window.addEventListener('pointerdown', away, true);
    return () => window.removeEventListener('pointerdown', away, true);
  }, [onClose]);
  const change = (patch: Partial<ShapeStyle>) => {
    setShapeStyle(patch);
    const shapes = editor.selectedItems().filter((i) => i.type === 'rect' || i.type === 'ellipse' || i.type === 'polygon');
    if (shapes.length) editor.board.transact(() => shapes.forEach((i) => editor.board.update(i.id, shapePatch(i.type, patch))));
  };
  const row = (icon: string, label: string, end: React.ReactNode, onClick?: () => void) => (
    <div className="menu-item">
      <div className="menu-row" role="menuitem" tabIndex={-1} onClick={onClick}>
        <Glyph id={icon} className="menu-icon" />
        <span>{label}</span>
        {end}
      </div>
    </div>
  );
  return (
    <div ref={ref} className="board-menu shape-menu" role="menu" data-nosort>
      {row('collapse-l', 'Скругление', (
        <span className="menu-input" onClick={(e) => e.stopPropagation()}>
          <input type="number" min={0} max={200} step={1} value={s.rad} aria-label="Скругление углов"
            onChange={(e) => change({ rad: Math.max(0, Math.min(200, Number(e.target.value) || 0)) })} />
          <i>px</i>
        </span>
      ))}
      {row('broom', 'Обводка', <Switch on={s.stroke} />, () => change({ stroke: !s.stroke }))}
      {row('server-settings', 'Без заливки', <Switch on={s.noFill} />, () => change({ noFill: !s.noFill }))}
      {row('change-order', 'Текст по центру', <Switch on={s.center} />, () => change({ center: !s.center }))}
      {row('link-settings', 'Квадратные', <Switch on={s.square} />, () => change({ square: !s.square }))}
    </div>
  );
}
