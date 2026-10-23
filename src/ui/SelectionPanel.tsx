import { useEffect, useLayoutEffect, useReducer, useRef, useState } from 'react';
import type { Editor } from '../editor/editor';
import type { Item } from '../model/types';
import { COLORABLE, FILLS, ICON_COLORS, STROKABLE, STROKE_COLORS } from '../model/types';
import { MIND_PALETTE } from '../model/mind';
import { PanelIcon, type PanelIconName } from './PanelIcon';
import { useSortable } from './sortable';

const same = (vals: Array<string | undefined>) => (vals.length && vals.every((v) => v === vals[0]) ? vals[0] : null);

/** Rearrangeable buttons; the bin isn't among them, it always comes last. */
const ORDER = ['paint', 'fills', 'sep', 'icons', 'sep2', 'rows', 'sep5', 'cols', 'sep4', 'front', 'back', 'duplicate'];

/** A chequered circle that opens a slider for how see-through the colour is, in percent. Dragging
 *  the slider is one change (onStart … onEnd). */
function Opacity({ value, label, onStart, onChange, onEnd }: {
  value: number; label: string; onStart: () => void; onChange: (v: number) => void; onEnd: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  // A press anywhere else closes it.
  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    window.addEventListener('pointerdown', close, true);
    return () => window.removeEventListener('pointerdown', close, true);
  }, [open]);
  const pct = Math.round(value * 100);
  return (
    <div ref={ref} className="op-wrap">
      <button className={`sw checker ${open ? 'on' : ''}`} title={label} aria-label={label} aria-expanded={open} onClick={() => setOpen(!open)} />
      {open && (
        <div className="op-pop" data-nosort>
          <input type="range" min={0} max={100} value={pct} aria-label={`${label}, %`} style={{ '--p': `${pct}%` } as React.CSSProperties}
            onPointerDown={() => { onStart(); window.addEventListener('pointerup', onEnd, { once: true }); }}
            onChange={(e) => onChange(Number(e.target.value) / 100)} />
          <span>{pct}%</span>
        </div>
      )}
    </div>
  );
}

/** Room between the panel and the zoom panel or the tool rail beside it. */
const GAP = 16;

export function SelectionPanel({ editor, items, linkCount, docked }: { editor: Editor; items: Item[]; linkCount: number; docked: boolean }) {
  // Hooks come before the early return; buttons can be rearranged by holding them.
  const sort = useSortable('planx-order-selection', ORDER, 'x');
  // When it would run into the zoom panel beside it, the panel first moves left as far as it can
  // (up to the screen edge, or the tool rail when level with it), and only then up above the bottom
  // bars, still clear of the rail.
  const [place, setPlace] = useState<{ left: number | null; raised: boolean }>({ left: null, raised: false });
  const [, redraw] = useReducer((n: number) => n + 1, 0);
  // Whether the colour circles set the fill or the outline of shapes.
  const [paint, setPaint] = useState<'fill' | 'stroke'>('fill');
  // It finds its place again when the window changes size or a panel opens or closes beside the rail.
  useEffect(() => {
    window.addEventListener('resize', redraw);
    window.addEventListener('planx:side-panels', redraw);
    return () => {
      window.removeEventListener('resize', redraw);
      window.removeEventListener('planx:side-panels', redraw);
    };
  }, []);
  useLayoutEffect(() => {
    const zoom = document.querySelector('.zoom')?.getBoundingClientRect(), el = sort.ref.current;
    if (!zoom || !el) return;
    // The width it has on one row, whatever it has now (moved over, it may wrap onto two).
    const kids = [...el.children] as HTMLElement[];
    const outer = (k: HTMLElement) => { const cs = getComputedStyle(k); return k.offsetWidth + parseFloat(cs.marginLeft) + parseFloat(cs.marginRight); };
    const w = kids.reduce((t, k) => t + outer(k), 0) + 4 * (kids.length - 1) + 32, h = el.offsetHeight;
    // How far left it may go with its top at `top`: to the screen edge, or clear of the tool rail and
    // whatever panel is open beside it, where level with them.
    const side = ['.tools', '.tools-more', '.draw-panel'].map((q) => document.querySelector(q)?.getBoundingClientRect()).filter((r): r is DOMRect => !!r);
    const min = (top: number) => Math.max(16, ...side.filter((r) => r.bottom > top).map((r) => r.right + GAP));
    const centred = (innerWidth - w) / 2;
    let next = { left: null as number | null, raised: false };
    if (centred + w + GAP > zoom.left) {
      const left = zoom.left - GAP - w;
      if (left >= min(zoom.bottom - h)) next = { left: Math.round(left), raised: false };
      else {
        const top = zoom.top - 8 - h;
        next = { left: centred < min(top) ? Math.round(min(top)) : null, raised: true };
      }
    } else if (centred < min(zoom.bottom - h)) next = { left: Math.round(min(zoom.bottom - h)), raised: false };
    if (next.left !== place.left || next.raised !== place.raised) setPlace(next);
  });
  if (!items.length && !linkCount) return null;
  const colorable = items.filter((i) => COLORABLE.includes(i.type));
  const icons = items.filter((i) => i.type === 'icon');
  const tables = items.filter((i) => i.type === 'table');
  const fill = same(colorable.map((i) => i.color));
  const iconColor = same(icons.map((i) => i.color));
  const allowNone = colorable.length > 0 && colorable.every((i) => i.type !== 'sticky');
  const strokable = items.filter((i) => STROKABLE.includes(i.type));
  const stroke = same(strokable.map((i) => i.sc ?? 'gray'));
  // Outlines are set only while shapes or tasks are among the selected.
  const target = strokable.length ? paint : 'fill';
  const current = target === 'fill' ? fill : stroke;
  const opacity = Number(same(target === 'fill' ? colorable.map((i) => String(i.fo ?? 1)) : strokable.map((i) => String(i.so ?? 1))) ?? 1);
  const setColor = (c: string) => (target === 'fill' ? editor.setColor(c) : editor.setStroke(c));
  // Mind map nodes on their own get their strong colours instead of the pale fills.
  const mind = colorable.length > 0 && colorable.every((i) => i.type === 'mind');
  const swatches: Array<[string, string]> = mind ? MIND_PALETTE.map((c) => [c, c]) : target === 'fill'
    ? Object.entries(FILLS).filter(([k]) => k !== 'none' || allowNone)
    : [...Object.entries(STROKE_COLORS).map(([k, v]): [string, string] => [k, v || (k === 'ink' ? 'var(--ink)' : 'var(--shape-stroke)')]), ['none', '']];
  // A picked colour of its own, not one of the circles.
  const custom = current?.startsWith('#') && !swatches.some(([k]) => k === current) ? current : null;
  // How a fill or an outline colour shows on the switch.
  const fillLook = !fill ? 'var(--line)' : fill.startsWith('#') ? fill : fill === 'none' ? 'transparent' : FILLS[fill] ?? FILLS.blue;
  const strokeLook = !stroke ? 'var(--line)' : stroke.startsWith('#') ? stroke : stroke === 'none' ? 'transparent'
    : stroke === 'ink' ? 'var(--ink)' : STROKE_COLORS[stroke] || 'var(--shape-stroke)';
  const btn = (icon: PanelIconName, title: string, fn: () => void) => (
    <button className="ib" title={title} aria-label={title} onClick={fn}><PanelIcon name={icon} /></button>
  );
  return (
    <div ref={sort.ref as React.RefObject<HTMLDivElement>} className={`bar panel sortable ${docked ? 'docked' : ''} ${place.raised ? 'raised' : ''} ${sort.sorting ? 'sorting' : ''}`}
      style={place.left !== null ? { left: place.left, transform: 'none', maxWidth: innerWidth - place.left - 16 } : undefined}
      role="toolbar" aria-label="Выделенное" {...sort.container}>
      {sort.render({
        // Fill and outline: which one the circles beside set, each showing its colour now.
        paint: strokable.length > 0 ? (
          <div className="sw-group paint-target">
            <button className={`ib ${target === 'fill' ? 'on' : ''}`} title="Заливка" aria-label="Заливка" aria-pressed={target === 'fill'} onClick={() => setPaint('fill')}>
              <span className={`paint-fill ${fill === 'none' ? 'none' : ''}`} style={{ background: fillLook }} />
            </button>
            <button className={`ib ${target === 'stroke' ? 'on' : ''}`} title="Обводка" aria-label="Обводка" aria-pressed={target === 'stroke'} onClick={() => setPaint('stroke')}>
              <span className={`paint-stroke ${stroke === 'none' ? 'none' : ''}`} style={{ borderColor: strokeLook }} />
            </button>
          </div>
        ) : undefined,
        fills: colorable.length > 0 ? (
          <div className="sw-group">
            {swatches.map(([k, v]) => (
              <button key={k} className={`sw ${k === 'none' ? 'none' : ''} ${current === k ? 'on' : ''}`} style={{ background: v }}
                title={k === 'none' ? (target === 'fill' ? 'Без заливки' : 'Без обводки') : target === 'fill' ? 'Цвет' : 'Цвет обводки'}
                aria-label={k === 'none' ? (target === 'fill' ? 'Без заливки' : 'Без обводки') : `${target === 'fill' ? 'Цвет' : 'Цвет обводки'} ${k}`}
                onClick={() => setColor(k)} />
            ))}
            {/* Any colour: the browser's own picker (hue strip plus saturation/brightness square). */}
            <label className={`sw custom ${custom ? 'on' : ''}`} style={custom ? { background: custom } : undefined} title="Свой цвет">
              <input type="color" aria-label="Свой цвет" value={custom ?? (target === 'fill' ? FILLS.yellow : STROKE_COLORS.blue).toLowerCase()} onChange={(e) => setColor(e.target.value)} />
            </label>
            <Opacity value={opacity} label={target === 'fill' ? 'Прозрачность заливки' : 'Прозрачность обводки'}
              onStart={() => editor.beginChange()} onChange={(v) => editor.setOpacity(target, v)} onEnd={() => editor.endChange()} />
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
        // Rows and columns of the selected tables: add or take away the last one.
        rows: tables.length > 0 ? (
          <div className="sw-group table-count">
            <span>Строки</span>
            {btn('minus-s', 'Убрать строку', () => editor.changeTable('row', -1))}
            {btn('plus-s', 'Добавить строку', () => editor.changeTable('row', 1))}
          </div>
        ) : undefined,
        cols: tables.length > 0 ? (
          <div className="sw-group table-count">
            <span>Столбцы</span>
            {btn('minus-s', 'Убрать столбец', () => editor.changeTable('col', -1))}
            {btn('plus-s', 'Добавить столбец', () => editor.changeTable('col', 1))}
          </div>
        ) : undefined,
        sep5: <div className="sep" />,
        sep4: <div className="sep" />,
        front: items.length > 0 ? btn('to-front', 'На передний план', () => editor.bringToFront()) : undefined,
        back: items.length > 0 ? btn('to-back', 'На задний план', () => editor.sendToBack()) : undefined,
        duplicate: items.length > 0 ? btn('duplicate', 'Дублировать (Ctrl+D)', () => editor.duplicate()) : undefined,
        sep: <div className="sep" />,
        sep2: <div className="sep" />,
      })}
      {btn('trashcan', 'Удалить (Del)', () => editor.deleteSelection())}
    </div>
  );
}
