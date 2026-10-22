import { useLayoutEffect, useRef, useState, type PointerEvent, type ReactNode } from 'react';
import type { Editor, Pens, Tool } from '../editor/editor';
import { DrawPanel, isDrawTool } from './DrawPanel';
import { PanelIcon, type PanelIconName } from './PanelIcon';

/** Tool panel from the Figma mockup (Mol / Bar vertical). */
const TOOLS: Partial<Record<string, [Tool, PanelIconName, string]>> = {
  select: ['select', 'cursor', 'Выбор (V)'],
  hand: ['hand', 'hand', 'Рука (H)'],
  sticky: ['sticky', 'sticker', 'Стикер (N)'],
  text: ['text', 'text', 'Текст (T)'],
  rect: ['rect', 'landscape', 'Прямоугольник (R)'],
  ellipse: ['ellipse', 'circle-check', 'Эллипс (O)'],
  link: ['link', 'maximize', 'Стрелка (C)'],
  frame: ['frame', 'columns', 'Фрейм (F)'],
};

/** Buttons from the mockup that have no feature behind them yet. */
const LATER: Partial<Record<string, [PanelIconName, string]>> = {
  image: ['image', 'Изображение'],
  weblink: ['link', 'Ссылка'],
  paint: ['paint', 'Копировать формат'],
};

/** Everything on the rail, top to bottom, until someone rearranges it. */
const DEFAULT_ORDER = ['select', 'hand', 'sep', 'sticky', 'text', 'rect', 'ellipse', 'link', 'frame', 'draw', 'image', 'weblink', 'smile', 'paint'];
const ORDER_KEY = 'planx-tools-order';

/** The saved order, minus anything no longer on the rail, plus anything new at the end. */
function readOrder(): string[] {
  try {
    const saved = JSON.parse(localStorage.getItem(ORDER_KEY) ?? 'null');
    if (Array.isArray(saved)) return [...saved.filter((k) => DEFAULT_ORDER.includes(k)), ...DEFAULT_ORDER.filter((k) => !saved.includes(k))];
  } catch { /* storage can be unavailable */ }
  return DEFAULT_ORDER;
}

/** How long to hold a button before it lifts and can be moved, and how far the pointer may wander meanwhile. */
const HOLD_MS = 350, HOLD_SLOP = 6;

export function Toolbar({ editor, tool, pens, docked, iconsOpen, onToggleIcons }: {
  editor: Editor; tool: Tool; pens: Pens; docked: boolean; iconsOpen: boolean; onToggleIcons: () => void;
}) {
  // The drawing button brings back whichever of pen, highlighter and eraser was used last.
  const lastDraw = useRef<Tool>('pen');
  const drawing = isDrawTool(tool);
  if (drawing) lastDraw.current = tool;

  // Hold a button to lift it, then drag it up or down the rail; the others make way.
  const [order, setOrder] = useState(readOrder);
  const [drag, setDrag] = useState<{ key: string; grab: number; y: number } | null>(null);
  const press = useRef<{ x: number; y: number; timer: number } | null>(null);
  const nav = useRef<HTMLElement>(null);
  const els = useRef(new Map<string, HTMLElement>());
  const tops = useRef(new Map<string, number>());
  const swallowClick = useRef(false);

  const naturalTop = (key: string) => nav.current!.getBoundingClientRect().top + els.current.get(key)!.offsetTop;

  // The lifted button follows the pointer, wherever its slot is now.
  useLayoutEffect(() => {
    if (!drag) return;
    const el = els.current.get(drag.key)!;
    el.style.transform = `translateY(${drag.y - drag.grab - naturalTop(drag.key)}px) scale(1.12)`;
  });
  // Buttons that changed places slide into their new ones.
  useLayoutEffect(() => {
    for (const [key, el] of els.current) {
      const before = tops.current.get(key), now = el.offsetTop;
      tops.current.set(key, now);
      if (before !== undefined && before !== now && key !== drag?.key) {
        el.animate([{ transform: `translateY(${before - now}px)` }, { transform: 'none' }], { duration: 150, easing: 'ease-out' });
      }
    }
  }, [order]); // eslint-disable-line react-hooks/exhaustive-deps

  const down = (e: PointerEvent<HTMLElement>) => {
    const el = (e.target as Element).closest<HTMLElement>('[data-key]');
    if (!el || e.button !== 0) return;
    const key = el.dataset.key!, id = e.pointerId, target = e.currentTarget;
    press.current = {
      x: e.clientX, y: e.clientY,
      timer: window.setTimeout(() => {
        const y = press.current?.y ?? 0;
        press.current = null;
        target.setPointerCapture(id);
        setDrag({ key, grab: y - el.getBoundingClientRect().top, y });
      }, HOLD_MS),
    };
  };
  const move = (e: PointerEvent<HTMLElement>) => {
    const p = press.current;
    if (p && Math.hypot(e.clientX - p.x, e.clientY - p.y) > HOLD_SLOP) { clearTimeout(p.timer); press.current = null; }
    if (!drag) return;
    // Swap with a neighbour once the lifted button's middle passes the neighbour's.
    const i = order.indexOf(drag.key), h = els.current.get(drag.key)!.offsetHeight;
    const mid = e.clientY - drag.grab + h / 2;
    const middle = (k: string) => naturalTop(k) + els.current.get(k)!.offsetHeight / 2;
    let to = i;
    if (i + 1 < order.length && mid > middle(order[i + 1])) to = i + 1;
    else if (i > 0 && mid < middle(order[i - 1])) to = i - 1;
    if (to !== i) {
      const next = [...order];
      [next[i], next[to]] = [next[to], next[i]];
      setOrder(next);
    }
    setDrag({ ...drag, y: e.clientY });
  };
  const up = () => {
    if (press.current) { clearTimeout(press.current.timer); press.current = null; }
    if (!drag) return;
    // Settle into the slot from wherever it was let go, and don't count the release as a click.
    const el = els.current.get(drag.key)!;
    const from = el.style.transform;
    el.style.transform = '';
    el.animate([{ transform: from }, { transform: 'none' }], { duration: 150, easing: 'ease-out' });
    try { localStorage.setItem(ORDER_KEY, JSON.stringify(order)); } catch { /* just won't be remembered */ }
    setDrag(null);
    swallowClick.current = true;
    setTimeout(() => { swallowClick.current = false; }, 0);
  };

  const ref = (key: string) => (el: HTMLElement | null) => { if (el) els.current.set(key, el); else els.current.delete(key); };
  const button = (key: string, on: boolean, label: string, icon: PanelIconName, onClick?: () => void, extra: object = {}): ReactNode => (
    <button key={key} ref={ref(key)} data-key={key} className={`fb ${on ? 'on' : ''} ${drag?.key === key ? 'lifted' : ''}`}
      title={label} aria-label={label.replace(/ \(.*\)$/, '')} onClick={onClick} {...extra}>
      <PanelIcon name={icon} />
    </button>
  );
  const item = (key: string): ReactNode => {
    const t = TOOLS[key], later = LATER[key];
    if (key === 'sep') return <div key={key} ref={ref(key)} data-key={key} className={`tsep ${drag?.key === key ? 'lifted' : ''}`} />;
    if (t) return button(key, tool === t[0], t[2], t[1], () => editor.setTool(t[0]), { 'aria-pressed': tool === t[0] });
    if (key === 'draw') return button(key, drawing, 'Рисование (P)', 'marker', () => editor.setTool(drawing ? 'select' : lastDraw.current), { 'aria-pressed': drawing });
    if (key === 'smile') return button(key, iconsOpen, 'Смайлы и иконки (I)', 'smile', onToggleIcons, { 'aria-expanded': iconsOpen });
    if (later) return button(key, false, `${later[1]} (скоро)`, later[0]);
    return null;
  };

  return (
    <>
    <nav ref={nav} className={`tools ${docked ? 'docked' : ''} ${drag ? 'sorting' : ''}`} aria-label="Инструменты"
      onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}
      onClickCapture={(e) => { if (swallowClick.current) { e.stopPropagation(); e.preventDefault(); } }}
      onContextMenu={(e) => e.preventDefault()}>
      {order.map(item)}
    </nav>
    {drawing && <DrawPanel editor={editor} tool={tool} pens={pens} />}
    </>
  );
}
