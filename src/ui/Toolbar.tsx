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
const LATER: Partial<Record<string, [PanelIconName, string]>> = {};

/** Everything on the rail, top to bottom, until someone rearranges it. */
const DEFAULT_ORDER = ['select', 'hand', 'sep', 'sticky', 'text', 'oval', 'task', 'link', 'table', 'mind', 'frames', 'draw', 'image', 'audio', 'smile', 'paint'];

/** Rail buttons that make something on the board when dragged off the rail, and their icons. */
const ICONS: Partial<Record<string, PanelIconName>> = { draw: 'marker', image: 'image', audio: 'microphone', smile: 'smile', frames: 'frame', oval: 'landscape', paint: 'node-pool' };

/** Room kept clear above the tool rail (the top bar) and as much below it. */
const RAIL_CLEAR = 72;
/** Where the rail's chosen length is kept, and how close to its top or bottom edge the pointer (or
 *  a finger) has to be to drag that edge. */
const CAP_KEY = 'planx-tools-cap', EDGE = 8, EDGE_FINGER = 14;

/** Rail buttons with variants, opened by holding the button still. */
const VARIANTS = new Set(['oval', 'draw']);

const SHAPE_KEY = 'planx-last-shape';
function savedShape(): Tool {
  try {
    const t = localStorage.getItem(SHAPE_KEY) as Tool | null;
    if (t && SHAPE_TOOLS.includes(t)) return t;
  } catch { /* storage can be unavailable */ }
  return 'rect';
}

export function Toolbar({ editor, tool, pens, zoom, guides, docked, iconsOpen, onToggleIcons, recorderOpen, onToggleRecorder }: {
  editor: Editor; tool: Tool; pens: Pens; zoom: number; guides: boolean; docked: boolean; iconsOpen: boolean; onToggleIcons: () => void;
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
  const sort = useSortable('planx-tools-order', DEFAULT_ORDER, 'y', { ellipse: 'task', frame: 'table' }, dropOut);

  // On a screen too short for the whole rail, the buttons that don't fit go under a "more" button
  // at its end, which opens them in a row beside it.
  const all = sort.visible();
  const [fit, setFit] = useState(Infinity);
  // How many of its elements the rail keeps, as chosen by dragging its top or bottom edge (the rest
  // go under "more"); Infinity for all of them.
  const [cap, setCap] = useState(() => {
    try { const n = Number(localStorage.getItem(CAP_KEY)); return n > 0 ? n : Infinity; } catch { return Infinity; }
  });
  const [moreOpen, setMoreOpen] = useState(false);
  const moreRef = useRef<HTMLButtonElement>(null), menuRef = useRef<HTMLDivElement | null>(null);
  const [, redraw] = useReducer((n: number) => n + 1, 0);
  useEffect(() => {
    window.addEventListener('resize', redraw);
    return () => window.removeEventListener('resize', redraw);
  }, []);
  /** The rail's height with its first n elements (and the "more" button when that's not all of them). */
  const railHeight = (n: number): number | null => {
    const el = sort.ref.current, btn = el?.querySelector<HTMLElement>('.fb');
    if (!el || !btn) return null;
    const cs = getComputedStyle(el), gap = parseFloat(cs.rowGap) || 0;
    const pad = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom);
    const ks = n >= all.length ? all : [...sort.visible(undefined, n), 'more'];
    return pad + ks.reduce((t, k) => t + (isSeparator(k) ? 7 : btn.offsetHeight), 0) + gap * (ks.length - 1);
  };
  // Centred on the screen, clear of the top bar above and as far from the bottom edge.
  const room = () => innerHeight - RAIL_CLEAR * 2;
  useLayoutEffect(() => {
    if (railHeight(all.length) === null) return;
    let n = Math.min(all.length, cap);
    while (n > 1 && railHeight(n)! > room()) n--;
    const next = n >= all.length ? Infinity : n;
    if (next !== fit) setFit(next);
    // Measuring went through other lengths: the rail's list is the one on screen again.
    else sort.visible(undefined, fit);
  });
  /** The rail's top or bottom edge under the pointer, if it's on one. */
  const edgeAt = (e: React.PointerEvent): 'top' | 'bottom' | null => {
    const r = sort.ref.current?.getBoundingClientRect(), zone = e.pointerType === 'touch' ? EDGE_FINGER : EDGE;
    if (!r || e.clientX < r.left || e.clientX > r.right) return null;
    return e.clientY >= r.top && e.clientY - r.top <= zone ? 'top' : e.clientY <= r.bottom && r.bottom - e.clientY <= zone ? 'bottom' : null;
  };
  /**
   * Dragging the rail's top or bottom edge makes it longer or shorter a button at a time, down to a
   * single one: what no longer fits goes under "more". The rail stays centred, so it grows at both
   * ends, and the edge being dragged keeps up with the pointer.
   */
  const startResize = (e: React.PointerEvent, edge: 'top' | 'bottom') => {
    e.preventDefault();
    e.stopPropagation();
    const y0 = e.clientY, h0 = sort.ref.current!.getBoundingClientRect().height;
    const heights = all.map((_, i) => railHeight(i + 1)!);
    sort.visible(undefined, fit);
    document.body.style.cursor = 'ns-resize';
    const move = (ev: PointerEvent) => {
      const want = h0 + (edge === 'bottom' ? 1 : -1) * (ev.clientY - y0) * 2;
      let best = 0, most = 0;
      heights.forEach((h, i) => {
        if (h > room()) return;
        most = i;
        if (Math.abs(h - want) < Math.abs(heights[best] - want)) best = i;
      });
      // As long as the screen allows is all of it: on a taller screen it's longer again.
      setCap(best >= most ? Infinity : best + 1);
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      document.body.style.cursor = '';
      setCap((c) => {
        try { if (c === Infinity) localStorage.removeItem(CAP_KEY); else localStorage.setItem(CAP_KEY, String(c)); } catch { /* just won't be remembered */ }
        return c;
      });
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
  };
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
  // The "more" panel stands level with the rail's bottom edge, as tall as fits under the top bar
  // (42 is its padding, 48 a button and a gap); further buttons go into more columns.
  const railBottom = sort.ref.current?.getBoundingClientRect().bottom ?? innerHeight / 2;
  const moreRows = Math.max(1, Math.min(hidden.length, Math.floor((railBottom - RAIL_CLEAR - 42 + 18) / 48)));
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
    if (key === 'oval') return button(key, shaping, 'Фигуры', shapeIcon, () => editor.setTool(shaping ? 'select' : lastShape.current), { 'aria-pressed': shaping });
    if (key === 'draw') return button(key, drawing, 'Рисование (P)', 'marker', () => editor.setTool(drawing ? 'select' : lastDraw.current), { 'aria-pressed': drawing });
    if (key === 'image') return button(key, false, 'Картинка', 'image', () => { pictureAt.current = undefined; filePicker.current?.click(); });
    if (key === 'audio') return button(key, recorderOpen, 'Аудиозаметка', 'microphone', onToggleRecorder, { 'aria-expanded': recorderOpen });
    if (key === 'smile') return button(key, iconsOpen, 'Смайлы, стикеры и иконки (I)', 'smile', onToggleIcons, { 'aria-expanded': iconsOpen });
    // The roller turns lining up along guides on and off while dragging.
    if (key === 'paint') return button(key, guides, guides ? 'Направляющие включены' : 'Направляющие', 'node-pool', () => editor.toggleGuides(), { 'aria-pressed': guides });
    if (later) return button(key, false, `${later[1]} (скоро)`, later[0]);
    return null;
  };

  return (
    <>
    <nav ref={sort.ref} className={`tools sortable ${docked ? 'docked' : ''} ${sort.sorting ? 'sorting' : ''}`} aria-label="Инструменты"
      {...sort.container}
      onPointerDown={(e) => { const edge = edgeAt(e); if (edge && e.button === 0) startResize(e, edge); else sort.container.onPointerDown(e); }}
      onPointerMove={(e) => { e.currentTarget.style.cursor = !sort.sorting && edgeAt(e) ? 'ns-resize' : ''; sort.container.onPointerMove(e); }}>
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
        style={{ bottom: innerHeight - railBottom, gridTemplateRows: `repeat(${moreRows}, 30px)` }}>
        {hidden.map((k) => item(k, true))}
      </div>
    )}
    {variants === 'draw' && <DrawPanel editor={editor} tool={tool} pens={pens} />}
    {variants === 'oval' && <ShapePanel editor={editor} tool={tool} onPick={() => setVariants(null)} />}
    <input ref={filePicker} type="file" accept="image/*" multiple hidden
      onChange={(e) => { const at = pictureAt.current; void readPictures(e.target.files ?? []).then((pics) => editor.addPictures(pics, at)); e.target.value = ''; }} />
    {sort.ghost}
    </>
  );
}
