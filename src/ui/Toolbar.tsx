import { useEffect, useReducer, useRef, useState, type ReactNode } from 'react';
import { SHAPE_TOOLS, type Editor, type Pens, type Tool } from '../editor/editor';
import { readPictures } from '../canvas/pictures';
import { DrawPanel, isDrawTool } from './DrawPanel';
import { ShapePanel, SHAPES } from './ShapePanel';
import { panelScale, usePanelSize } from './panels/size';
import { useRail } from './panels/rail';
import { PanelIcon, type PanelIconName } from './PanelIcon';
import { isSeparator, useSortable } from './sortable';
import { ToolPreview } from './ToolPreview';
import { readText, writeText } from '../storage';

/** Tool panel from the Figma mockup (Mol / Bar vertical). */
const TOOLS: Partial<Record<string, [Tool, PanelIconName, string]>> = {
  select: ['select', 'cursor', 'Выбор (V)'],
  hand: ['hand', 'hand', 'Рука (H)'],
  sticky: ['sticky', 'sticker', 'Стикер (N)'],
  text: ['text', 'text', 'Текст (T)'],
  task: ['task', 'circle-check', 'Задача'],
  table: ['table', 'columns', 'Таблица'],
  mind: ['mind', 'branch', 'Майнд-карта'],
};

/** Buttons from the mockup that have no feature behind them yet. */
const LATER: Partial<Record<string, [PanelIconName, string]>> = {};

/** Everything on the rail, top to bottom, until someone rearranges it. */
const DEFAULT_ORDER = ['select', 'hand', 'sep', 'sticky', 'text', 'oval', 'task', 'component', 'table', 'mind', 'frames', 'draw', 'image', 'audio', 'smile'];

/** Rail buttons that make something on the board when dragged off the rail, and their icons. */
const ICONS: Partial<Record<string, PanelIconName>> = { draw: 'marker', image: 'image', audio: 'microphone', smile: 'smile', frames: 'frame', oval: 'landscape' };

/** The "more" column at full size: its padding top and bottom, its buttons and the gap between them
 *  (scaled as the panels are, the way the styles round them). */
const MORE_COL = { pad: 21, size: 30, gap: 18 };
export const moreCol = (k: number) => ({ pad: Math.round(MORE_COL.pad * k) * 2, size: Math.round((MORE_COL.size * k) / 2) * 2, gap: Math.round(MORE_COL.gap * k) });

/** Rail buttons with variants, opened by holding the button still. */
const VARIANTS = new Set(['oval', 'draw']);

const SHAPE_KEY = 'planx-last-shape';
function savedShape(): Tool {
  const t = readText(SHAPE_KEY) as Tool | null;
  if (t && SHAPE_TOOLS.includes(t)) return t;
  return 'rect';
}

export function Toolbar({ editor, tool, pens, zoom, docked, iconsOpen, onToggleIcons, recorderOpen, onToggleRecorder }: {
  editor: Editor; tool: Tool; pens: Pens; zoom: number; docked: boolean; iconsOpen: boolean; onToggleIcons: () => void;
  recorderOpen: boolean; onToggleRecorder: () => void;
}) {
  // The drawing button brings back whichever of pen, highlighter and eraser was used last.
  const lastDraw = useRef<Tool>('pen');
  const drawing = isDrawTool(tool);
  if (drawing) lastDraw.current = tool;
  // Likewise the shapes button brings back the figure used last, and shows it, the next time too.
  const lastShape = useRef<Tool>(savedShape());
  const shaping = SHAPE_TOOLS.includes(tool);
  if (shaping && lastShape.current !== tool) {
    lastShape.current = tool;
    writeText(SHAPE_KEY, tool);
  }
  const shapeIcon = SHAPES.find(([t]) => t === lastShape.current)?.[1] ?? 'landscape';
  // The variants beside the rail (the shapes, or the pens and their colours): opened by holding their
  // button, closed by a press anywhere else (and the shapes by picking one).
  const [variants, setVariants] = useState<string | null>(null);
  useEffect(() => {
    if (!variants) return;
    const close = (e: PointerEvent) => { if (!(e.target as Element | null)?.closest?.(`.draw-panel, [data-key="${variants}"]`)) setVariants(null); };
    window.addEventListener('pointerdown', close, true);
    return () => window.removeEventListener('pointerdown', close, true);
  }, [variants]);

  const filePicker = useRef<HTMLInputElement>(null);
  /** Where pictures from the file dialog go: a drop point when the picture button was dragged onto the board. */
  const pictureAt = useRef<{ x: number; y: number } | undefined>(undefined);

  // A button dragged off the rail turns into what it makes and lands on the board there; buttons
  // that make nothing to preview stay an icon (and the picture button opens its dialog for that spot).
  const toolOf = (key: string): Tool | null =>
    key === 'frames' ? 'frame' : key === 'oval' ? lastShape.current : ['sticky', 'text', 'task', 'table', 'mind'].includes(key) ? key as Tool : null;
  const dropOut = {
    preview: (key: string) => {
      const t = toolOf(key), icon = TOOLS[key]?.[1] ?? ICONS[key];
      return (t && <ToolPreview tool={t} zoom={zoom} />) || (icon ? <span className="tp-icon"><PanelIcon name={icon} /></span> : null);
    },
    // Held still, the shapes and drawing buttons open their variants beside the rail (a click just
    // takes the last one).
    hold: (key: string) => { if (!VARIANTS.has(key)) return false; setVariants(key); return true; },
    drop: (key: string, at: { x: number; y: number }) => {
      const t = toolOf(key);
      if (t === 'sticky') editor.addSticky('yellow', at);
      else if (t) editor.dropItem(t, at);
      else if (key === 'image') { pictureAt.current = at; filePicker.current?.click(); }
    },
  };

  // Hold a button to lift it, then drag it up or down the rail; the others make way.
  // The circle-check and columns buttons were the ellipse's and the frame's; they now make tasks and
  // tables, so saved orders keep them in place.
  const sort = useSortable('planx-tools-order', DEFAULT_ORDER, 'y', { ellipse: 'task', frame: 'table', link: 'component' }, dropOut);

  // On a screen too short for the whole rail, the buttons that don't fit go under a "more" button
  // at its end, which opens them in a row beside it.
  const all = sort.visible();
  const rail = useRail(sort, all);
  const fit = rail.fit;
  const [panelSize] = usePanelSize();
  const [moreOpen, setMoreOpen] = useState(false);
  const moreRef = useRef<HTMLButtonElement>(null), menuRef = useRef<HTMLDivElement | null>(null);
  const [, redraw] = useReducer((n: number) => n + 1, 0);
  useEffect(() => {
    window.addEventListener('resize', redraw);
    return () => window.removeEventListener('resize', redraw);
  }, []);
  const main = sort.visible(undefined, fit);
  const hidden = all.filter((k) => !main.includes(k) && !isSeparator(k));
  // A press anywhere but the row and its button closes it.
  useEffect(() => {
    if (!moreOpen) return;
    const close = (e: PointerEvent) => {
      const t = e.target as Node;
      if (!menuRef.current?.contains(t) && !moreRef.current?.contains(t)) setMoreOpen(false);
    };
    window.addEventListener('pointerdown', close, true);
    return () => window.removeEventListener('pointerdown', close, true);
  }, [moreOpen]);
  if (moreOpen && !hidden.length) setMoreOpen(false);
  // The "more" panel stands level with the rail's bottom edge, as tall as fits under the top bar;
  // further buttons go into more columns.
  const railBottom = sort.ref.current?.getBoundingClientRect().bottom ?? innerHeight / 2;
  const col = moreCol(panelSize === 'l' ? 1 : panelScale());
  const moreRows = Math.max(1, Math.min(hidden.length, Math.floor((railBottom - rail.clear - col.pad + col.gap) / (col.size + col.gap))));
  // The selection panel keeps clear of what opens beside the rail.
  useEffect(() => { window.dispatchEvent(new Event('planx:side-panels')); }, [moreOpen, variants]);
  // Held and then pulled away, the button is dragged, and its variants close.
  if (variants && sort.sorting) setVariants(null);

  const moreZone = sort.moreZone(hidden);
  /** A rail button; in the "more" row (`inMenu`) it closes the row when used. */
  const railButton = (key: string, on: boolean, label: string, icon: PanelIconName, onClick?: () => void, extra: object = {}, inMenu = false): ReactNode => (
    <button key={key} {...(inMenu ? sort.moreItem(key) : sort.item(key))} className={`fb ${on ? 'on' : ''} ${sort.lifted(key) ? 'lifted' : ''}`}
      title={label} aria-label={label.replace(/ \(.*\)$/, '')} {...extra}
      onClick={() => { onClick?.(); if (inMenu) setMoreOpen(false); }}>
      <PanelIcon name={icon} />
    </button>
  );
  const item = (key: string, inMenu = false): ReactNode => {
    const button = (k: string, on: boolean, label: string, icon: PanelIconName, onClick?: () => void, extra: object = {}) =>
      railButton(k, on, label, icon, onClick, extra, inMenu);
    const t = TOOLS[key], later = LATER[key];
    if (key === 'sep') return <div key={key} {...sort.item(key)} className={`tsep ${sort.lifted(key) ? 'lifted' : ''}`} />;
    if (t) return button(key, tool === t[0], t[2], t[1], () => editor.setTool(t[0]), { 'aria-pressed': tool === t[0] });
    // With two or more items selected, the frame button puts a frame around them instead.
    if (key === 'frames') return button(key, tool === 'frame', 'Фрейм (F; вокруг выделенного — Ctrl+G)', 'frame',
      () => { if (!editor.frameSelection()) editor.setTool('frame'); }, { 'aria-pressed': tool === 'frame' });
    // The arrow's button (arrows are drawn from an item's blue dots, or with C): makes a component of
    // what's selected.
    if (key === 'component') return button(key, false, 'Компонент из выделенного', 'maximize', () => editor.makeComponent());
    if (key === 'oval') return button(key, shaping, 'Фигуры', shapeIcon, () => editor.setTool(shaping ? 'select' : lastShape.current), { 'aria-pressed': shaping });
    if (key === 'draw') return button(key, drawing, 'Рисование (P)', 'marker', () => editor.setTool(drawing ? 'select' : lastDraw.current), { 'aria-pressed': drawing });
    if (key === 'image') return button(key, false, 'Картинка', 'image', () => { pictureAt.current = undefined; filePicker.current?.click(); });
    if (key === 'audio') return button(key, recorderOpen, 'Аудиозаметка', 'microphone', onToggleRecorder, { 'aria-expanded': recorderOpen });
    if (key === 'smile') return button(key, iconsOpen, 'Смайлы, стикеры и иконки (I)', 'smile', onToggleIcons, { 'aria-expanded': iconsOpen });
    if (later) return button(key, false, `${later[1]} (скоро)`, later[0]);
    return null;
  };

  return (
    <>
    <nav ref={sort.ref} className={`tools sortable ${docked ? 'docked' : ''} ${sort.sorting ? 'sorting' : ''}`} aria-label="Инструменты"
      {...sort.container}
      style={rail.style}
      onPointerDown={(e) => { if (!rail.grip.onPointerDown(e)) sort.container.onPointerDown(e); }}
      onPointerMove={(e) => { if (!sort.sorting) rail.grip.onPointerMove(e); sort.container.onPointerMove(e); }}
      onPointerLeave={rail.grip.onPointerLeave}>
      {main.map((k) => item(k))}
      {hidden.length > 0 && (
        <button ref={moreRef} className={`fb ${moreOpen ? 'on' : ''}`} title="Ещё" aria-label="Ещё" aria-expanded={moreOpen} data-nosort
          onClick={() => setMoreOpen(!moreOpen)}>
          <PanelIcon name="more" />
        </button>
      )}
    </nav>
    {moreOpen && hidden.length > 0 && (
      <div {...moreZone} ref={(el) => { menuRef.current = el; moreZone.ref(el); }} className={`tools-more sortable ${sort.sorting ? 'sorting' : ''}`}
        role="toolbar" aria-label="Ещё инструменты" aria-orientation="vertical"
        style={{ bottom: innerHeight - railBottom, gridTemplateRows: `repeat(${moreRows}, ${col.size}px)` }}>
        {hidden.map((k) => item(k, true))}
      </div>
    )}
    {variants === 'draw' && <DrawPanel editor={editor} tool={tool} pens={pens} />}
    {variants === 'oval' && <ShapePanel editor={editor} tool={tool} zoom={zoom} onPick={() => setVariants(null)} />}
    <input ref={filePicker} type="file" accept="image/*" multiple hidden
      onChange={(e) => { const at = pictureAt.current; void readPictures(e.target.files ?? []).then((pics) => editor.addPictures(pics, at)); e.target.value = ''; }} />
    {sort.ghost}
    </>
  );
}
