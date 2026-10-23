import type { Editor, Tool } from '../editor/editor';
import { PanelIcon, type PanelIconName } from './PanelIcon';
import { useSortable } from './sortable';

export const SHAPES: Array<[Tool, PanelIconName, string]> = [
  ['rect', 'landscape', 'Прямоугольник (R)'],
  ['ellipse', 'ellipse', 'Эллипс (O)'],
  ['triangle', 'triangle', 'Треугольник'],
  ['rhombus', 'rhombus', 'Ромб'],
  ['pentagon', 'pentagon', 'Пятиугольник'],
  ['star', 'star', 'Звезда'],
];

/** Figures next to the tool rail, opened by holding its shapes button; pick one, then drag out its box on the board. */
export function ShapePanel({ editor, tool, onPick }: { editor: Editor; tool: Tool; onPick: () => void }) {
  const sort = useSortable('planx-order-shapes', SHAPES.map(([t]) => t), 'y');
  return (
    <div ref={sort.ref as React.RefObject<HTMLDivElement>} className={`draw-panel shape-panel sortable ${sort.sorting ? 'sorting' : ''}`} role="toolbar" aria-label="Фигуры"
      {...sort.container}>
      {sort.render(Object.fromEntries(SHAPES.map(([t, icon, label]) => [t, (
        <button className={`fb ${tool === t ? 'on' : ''}`} title={label} aria-label={label.replace(/ \(.*\)$/, '')} aria-pressed={tool === t}
          onClick={() => { editor.setTool(t); onPick(); }}>
          <PanelIcon name={icon} />
        </button>
      )])))}
    </div>
  );
}
