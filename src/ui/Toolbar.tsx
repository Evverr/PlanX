import { useRef, type ReactNode } from 'react';
import type { Editor, Pens, Tool } from '../editor/editor';
import { readPictures } from '../canvas/pictures';
import { DrawPanel, isDrawTool } from './DrawPanel';
import { PanelIcon, type PanelIconName } from './PanelIcon';
import { useSortable } from './sortable';

/** Tool panel from the Figma mockup (Mol / Bar vertical). */
const TOOLS: Partial<Record<string, [Tool, PanelIconName, string]>> = {
  select: ['select', 'cursor', 'Выбор (V)'],
  hand: ['hand', 'hand', 'Рука (H)'],
  sticky: ['sticky', 'sticker', 'Стикер (N)'],
  text: ['text', 'text', 'Текст (T)'],
  rect: ['rect', 'landscape', 'Прямоугольник (R)'],
  oval: ['ellipse', 'ellipse', 'Эллипс (O)'],
  task: ['task', 'circle-check', 'Задача'],
  link: ['link', 'maximize', 'Стрелка (C)'],
  frame: ['frame', 'columns', 'Фрейм (F)'],
};

/** Buttons from the mockup that have no feature behind them yet. */
const LATER: Partial<Record<string, [PanelIconName, string]>> = {
  paint: ['paint', 'Копировать формат'],
};

/** Everything on the rail, top to bottom, until someone rearranges it. */
const DEFAULT_ORDER = ['select', 'hand', 'sep', 'sticky', 'text', 'rect', 'oval', 'task', 'link', 'frame', 'draw', 'image', 'smile', 'paint'];

export function Toolbar({ editor, tool, pens, docked, iconsOpen, onToggleIcons }: {
  editor: Editor; tool: Tool; pens: Pens; docked: boolean; iconsOpen: boolean; onToggleIcons: () => void;
}) {
  // The drawing button brings back whichever of pen, highlighter and eraser was used last.
  const lastDraw = useRef<Tool>('pen');
  const drawing = isDrawTool(tool);
  if (drawing) lastDraw.current = tool;

  const filePicker = useRef<HTMLInputElement>(null);

  // Hold a button to lift it, then drag it up or down the rail; the others make way.
  // The circle-check button was the ellipse's; it now makes tasks, so a saved order keeps it in place.
  const sort = useSortable('planx-tools-order', DEFAULT_ORDER, 'y', { ellipse: 'task' });

  const button = (key: string, on: boolean, label: string, icon: PanelIconName, onClick?: () => void, extra: object = {}): ReactNode => (
    <button key={key} {...sort.item(key)} className={`fb ${on ? 'on' : ''} ${sort.lifted(key) ? 'lifted' : ''}`}
      title={label} aria-label={label.replace(/ \(.*\)$/, '')} onClick={onClick} {...extra}>
      <PanelIcon name={icon} />
    </button>
  );
  const item = (key: string): ReactNode => {
    const t = TOOLS[key], later = LATER[key];
    if (key === 'sep') return <div key={key} {...sort.item(key)} className={`tsep ${sort.lifted(key) ? 'lifted' : ''}`} />;
    if (t) return button(key, tool === t[0], t[2], t[1], () => editor.setTool(t[0]), { 'aria-pressed': tool === t[0] });
    if (key === 'draw') return button(key, drawing, 'Рисование (P)', 'marker', () => editor.setTool(drawing ? 'select' : lastDraw.current), { 'aria-pressed': drawing });
    if (key === 'image') return button(key, false, 'Картинка', 'image', () => filePicker.current?.click());
    if (key === 'smile') return button(key, iconsOpen, 'Смайлы, стикеры и иконки (I)', 'smile', onToggleIcons, { 'aria-expanded': iconsOpen });
    if (later) return button(key, false, `${later[1]} (скоро)`, later[0]);
    return null;
  };

  return (
    <>
    <nav ref={sort.ref} className={`tools sortable ${docked ? 'docked' : ''} ${sort.sorting ? 'sorting' : ''}`} aria-label="Инструменты"
      {...sort.container}>
      {sort.visible().map(item)}
    </nav>
    {drawing && <DrawPanel editor={editor} tool={tool} pens={pens} />}
    <input ref={filePicker} type="file" accept="image/*" multiple hidden
      onChange={(e) => { void readPictures(e.target.files ?? []).then((pics) => editor.addPictures(pics)); e.target.value = ''; }} />
    </>
  );
}
