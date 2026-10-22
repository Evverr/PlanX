import { useRef } from 'react';
import type { Editor, Pens, Tool } from '../editor/editor';
import { DrawPanel, isDrawTool } from './DrawPanel';
import { PanelIcon, type PanelIconName } from './PanelIcon';

/** Tool panel from the Figma mockup (Mol / Bar vertical). */
const TOOLS: Array<[Tool, PanelIconName, string] | 'sep'> = [
  ['select', 'cursor', 'Выбор (V)'],
  ['hand', 'hand', 'Рука (H)'],
  'sep',
  ['sticky', 'sticker', 'Стикер (N)'],
  ['text', 'text', 'Текст (T)'],
  ['rect', 'landscape', 'Прямоугольник (R)'],
  ['ellipse', 'circle-check', 'Эллипс (O)'],
  ['link', 'maximize', 'Стрелка (C)'],
  ['frame', 'columns', 'Фрейм (F)'],
];

/** Buttons from the mockup that have no feature behind them yet. */
const LATER: Array<[PanelIconName, string]> = [['image', 'Изображение'], ['link', 'Ссылка']];

export function Toolbar({ editor, tool, pens, docked, iconsOpen, onToggleIcons }: {
  editor: Editor; tool: Tool; pens: Pens; docked: boolean; iconsOpen: boolean; onToggleIcons: () => void;
}) {
  // The drawing button brings back whichever of pen, highlighter and eraser was used last.
  const lastDraw = useRef<Tool>('pen');
  const drawing = isDrawTool(tool);
  if (drawing) lastDraw.current = tool;
  return (
    <>
    <nav className={`tools ${docked ? 'docked' : ''}`} aria-label="Инструменты">
      {TOOLS.map((t, i) =>
        t === 'sep' ? <div key={i} className="tsep" /> : (
          <button key={t[0]} className={`fb ${tool === t[0] ? 'on' : ''}`} title={t[2]} aria-label={t[2]}
            aria-pressed={tool === t[0]} onClick={() => editor.setTool(t[0])}>
            <PanelIcon name={t[1]} />
          </button>
        ))}
      <button className={`fb ${drawing ? 'on' : ''}`} title="Рисование (P)" aria-label="Рисование" aria-pressed={drawing}
        onClick={() => editor.setTool(drawing ? 'select' : lastDraw.current)}>
        <PanelIcon name="marker" />
      </button>
      {LATER.map(([icon, label]) => (
        <button key={icon} className="fb" title={`${label} (скоро)`} aria-label={label}><PanelIcon name={icon} /></button>
      ))}
      <button className={`fb ${iconsOpen ? 'on' : ''}`} title="Смайлы и иконки (I)" aria-label="Смайлы и иконки" aria-expanded={iconsOpen} onClick={onToggleIcons}>
        <PanelIcon name="smile" />
      </button>
      <button className="fb" title="Копировать формат (скоро)" aria-label="Копировать формат"><PanelIcon name="paint" /></button>
    </nav>
    {drawing && <DrawPanel editor={editor} tool={tool} pens={pens} />}
    </>
  );
}
