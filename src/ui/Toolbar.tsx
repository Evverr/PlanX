import { useEffect, useLayoutEffect, useReducer, useRef, useState, type ReactNode } from 'react';
import { SHAPE_TOOLS, type Editor, type Pens, type Tool } from '../editor/editor';
import { readPictures } from '../canvas/pictures';
import { DrawPanel, isDrawTool } from './DrawPanel';
import { ShapePanel, SHAPES } from './ShapePanel';
import { PanelIcon, type PanelIconName } from './PanelIcon';
import { isSeparator, useSortable } from './sortable';
import { ToolPreview } from './ToolPreview';

/** Tool panel from the Figma mockup (Mol / Bar vertical). */
const TOOLS: Partial<Record<string, [Tool, PanelIconName, string]>> = {
  select: ['select', 'cursor', 'Выбор (V)'],
  hand: ['hand', 'hand', 'Рука (H)'],
  sticky: ['sticky', 'sticker', 'Стикер (N)'],
  text: ['text', 'text', 'Текст (T)'],
  task: ['task', 'circle-check', 'Задача'],
  link: ['link', 'maximize', 'Стрелка (C)'],
  table: ['table', 'columns', 'Таблица'],
  mind: ['mind', 'branch', 'Майнд-карта'],
};

/** Buttons from the mockup that have no feature behind them yet. */
const LATER: Partial<Record<string, [PanelIconName, string]>> = {
  paint: ['paint', 'Копировать формат'],
};

/** Everything on the rail, top to bottom, until someone rearranges it. */
const DEFAULT_ORDER = ['select', 'hand', 'sep', 'sticky', 'text', 'oval', 'task', 'link', 'table', 'mind', 'frames', 'draw', 'image', 'audio', 'smile', 'paint'];

/** Rail buttons that make something on the board when dragged off the rail, and their icons. */
const ICONS: Partial<Record<string, PanelIconName>> = { draw: 'marker', image: 'image', audio: 'microphone', smile: 'smile', frames: 'frame', oval: 'landscape', paint: 'paint' };

/** Room kept clear above the tool rail (the top bar) and as much below it. */
const RAIL_CLEAR = 72;

const SHAPE_KEY = 'planx-last-shape';
function savedShape(): Tool {
  try {
    const t = localStorage.getItem(SHAPE_KEY) as Tool | null;
    if (t && SHAPE_TOOLS.includes(t)) return t;
  } catch { /* storage can be unavailable */ }
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
    try { localStorage.setItem(SHAPE_KEY, tool); } catch { /* storage can be unavailable */ }
  }
  const shapeIcon = SHAPES.find(([t]) => t === lastShape.current)?.[1] ?? 'landscape';

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
  const sort = useSortable('planx-tools-order', DEFAULT_ORDER, 'y', { ellipse: 'task', frame: 'table' }, dropOut);

  // On a screen too short for the whole rail, the buttons that don't fit go under a "more" button
  // at its end, which opens them in a row beside it.
  const all = sort.visible();
  const [fit, setFit] = useState(Infinity);
  const [moreOpen, setMoreOpen] = useState(false);
  const moreRef = useRef<HTMLButtonElement>(null), menuRef = useRef<HTMLDivElement>(null);
  const [, redraw] = useReducer((n: number) => n + 1, 0);
  useEffect(() => {
    window.addEventListener('resize', redraw);
    return () => window.removeEventListener('resize', redraw);
  }, []);
  useLayoutEffect(() => {
    const el = sort.ref.current, btn = el?.querySelector<HTMLElement>('.fb');
    if (!el || !btn) return;
    const cs = getComputedStyle(el), gap = parseFloat(cs.rowGap) || 0;
    const pad = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom);
    const tall = (ks: string[]) => pad + ks.reduce((t, k) => t + (isSeparator(k) ? 7 : btn.offsetHeight), 0) + gap * (ks.length - 1);
    // Centred on the screen, clear of the top bar above and as far from the bottom edge.
    const room = innerHeight - RAIL_CLEAR * 2;
    let n = all.length;
    if (tall(all) > room) {
      n = all.length - 1;
      while (n > 1 && tall([...sort.visible(undefined, n), 'more']) > room) n--;
    }
    const next = n >= all.length ? Infinity : n;
    if (next !== fit) setFit(next);
  });
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

  /** A rail button; in the "more" row (`inMenu`) it isn't rearrangeable and closes the row when used. */
  const railButton = (key: string, on: boolean, label: string, icon: PanelIconName, onClick?: () => void, extra: object = {}, inMenu = false): ReactNode => (
    <button key={key} {...(inMenu ? {} : sort.item(key))} className={`fb ${on ? 'on' : ''} ${!inMenu && sort.lifted(key) ? 'lifted' : ''}`}
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
      {...sort.container}>
      {main.map((k) => item(k))}
      {hidden.length > 0 && (
        <button ref={moreRef} className={`fb ${moreOpen ? 'on' : ''}`} title="Ещё" aria-label="Ещё" aria-expanded={moreOpen} data-nosort
          onClick={() => setMoreOpen(!moreOpen)}>
          <PanelIcon name="more" />
        </button>
      )}
    </nav>
    {moreOpen && hidden.length > 0 && (
      <div ref={menuRef} className="tools-more" role="toolbar" aria-label="Ещё инструменты" aria-orientation="vertical"
        style={{ gridTemplateRows: `repeat(${Math.max(1, Math.min(hidden.length, Math.floor((innerHeight - RAIL_CLEAR * 2 - 42 + 18) / 48)))}, 30px)` }}>
        {hidden.map((k) => item(k, true))}
      </div>
    )}
    {drawing && <DrawPanel editor={editor} tool={tool} pens={pens} />}
    {shaping && <ShapePanel editor={editor} tool={tool} />}
    <input ref={filePicker} type="file" accept="image/*" multiple hidden
      onChange={(e) => { const at = pictureAt.current; void readPictures(e.target.files ?? []).then((pics) => editor.addPictures(pics, at)); e.target.value = ''; }} />
    {sort.ghost}
    </>
  );
}
