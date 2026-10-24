import { useEffect, useLayoutEffect, useReducer, useRef, useState, type ReactNode } from 'react';
import type { Editor } from '../editor/editor';
import type { Item } from '../model/types';
import { COLORABLE, FILLS, ICON_COLORS, STROKABLE, STROKE_COLORS } from '../model/types';
import { MIND_PALETTE, mindDepth } from '../model/mind';
import { colsOf, rowsOf } from '../model/table';
import { PanelIcon, type PanelIconName } from './PanelIcon';
import { useSortable } from './sortable';
import { ColorPicker } from './ColorPicker';
import { crowds, EDGE, shownRects } from '../layout';

const same = (vals: Array<string | undefined>): string | null => (vals.length && vals.every((v) => v === vals[0]) ? vals[0] ?? null : null);

/** Rearrangeable buttons; the bin comes last until moved. */
const ORDER = ['colors', 'rows', 'cols', 'front', 'back', 'duplicate', 'trash'];

/**
 * A palette button and the popover of colour controls it opens above it, centred on the button and
 * moved in just enough to stay 8px clear of the screen's edges and of the tool rail when level with
 * it. Every colour control of the panel sits in it.
 */
function Palette({ label, children }: { label: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null), popRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const pop = popRef.current;
    if (!pop) return;
    pop.style.marginLeft = '0px';
    const r = pop.getBoundingClientRect(), rail = document.querySelector('.tools')?.getBoundingClientRect();
    const min = rail && rail.bottom > r.top && rail.top < r.bottom ? rail.right + 8 : 8;
    pop.style.marginLeft = `${Math.max(0, min - r.left) - Math.max(0, r.right - (innerWidth - 8))}px`;
  });
  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    window.addEventListener('pointerdown', close, true);
    return () => window.removeEventListener('pointerdown', close, true);
  }, [open]);
  return (
    <div ref={ref} className="op-wrap">
      <button className={`ib ${open ? 'on' : ''}`} title={label} aria-label={label} aria-expanded={open} onClick={() => setOpen(!open)}>
        <PanelIcon name="palette" />
      </button>
      {open && <div ref={popRef} className="op-pop palette-pop" data-nosort>{children}</div>}
    </div>
  );
}

type Paint = 'fill' | 'stroke';

/** Which colours the circles set, fill or outline (a table's lines); Shift-click picks both. */
function usePaint(): [Paint[], (which: Paint, shift: boolean) => void] {
  const [paint, setPaint] = useState<Paint[]>(['fill']);
  return [paint, (which, shift) => {
    if (!shift) setPaint([which]);
    else if (!paint.includes(which)) setPaint([...paint, which]);
    else if (paint.length > 1) setPaint(paint.filter((p) => p !== which));
  }];
}

/** The fill/outline switch, each showing its colour now, and a line after it. */
function PaintSwitch({ paint, pick, fill, stroke, fillLabel, strokeLabel }: {
  paint: Paint[]; pick: (which: Paint, shift: boolean) => void; fill: string | null; stroke: string | null; fillLabel: string; strokeLabel: string;
}) {
  const fillLook = !fill ? 'var(--line)' : fill.startsWith('#') ? fill : fill === 'none' ? 'transparent' : FILLS[fill] ?? FILLS.blue;
  const strokeLook = !stroke ? 'var(--line)' : stroke.startsWith('#') ? stroke : stroke === 'none' ? 'transparent'
    : stroke === 'ink' ? 'var(--ink)' : STROKE_COLORS[stroke] || 'var(--shape-stroke)';
  return (
    <>
      <div className="sw-group paint-target">
        <button className={`ib ${paint.includes('fill') ? 'on' : ''}`} title={`${fillLabel} (с Shift — вместе)`} aria-label={fillLabel}
          aria-pressed={paint.includes('fill')} onClick={(e) => pick('fill', e.shiftKey)}>
          <span className={`paint-fill ${fill === 'none' ? 'none' : ''}`} style={{ background: fillLook }} />
        </button>
        <button className={`ib ${paint.includes('stroke') ? 'on' : ''}`} title={`${strokeLabel} (с Shift — вместе)`} aria-label={strokeLabel}
          aria-pressed={paint.includes('stroke')} onClick={(e) => pick('stroke', e.shiftKey)}>
          <span className={`paint-stroke ${stroke === 'none' ? 'none' : ''}`} style={{ borderColor: strokeLook }} />
        </button>
      </div>
      <div className="sep" />
    </>
  );
}

/** Colour circles (the picked one marked) and any colour from the browser's own picker. */
function Swatches({ swatches, current, onPick, label, noneLabel, editor }: {
  swatches: Array<[string, string]>; current: string | null; onPick: (c: string) => void; label: string; noneLabel: string; editor: Editor;
}) {
  const custom = current?.startsWith('#') && !swatches.some(([k]) => k === current) ? current : null;
  // Any colour: the picker opens over its circle; a press anywhere else closes it.
  const [picking, setPicking] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!picking) return;
    const close = (e: PointerEvent) => { if (!wrap.current?.contains(e.target as Node)) setPicking(false); };
    window.addEventListener('pointerdown', close, true);
    return () => window.removeEventListener('pointerdown', close, true);
  }, [picking]);
  return (
    <>
      {swatches.map(([k, v]) => (
        <button key={k} className={`sw ${k === 'none' ? 'none' : ''} ${current === k ? 'on' : ''}`} style={{ background: v }}
          title={k === 'none' ? noneLabel : label} aria-label={k === 'none' ? noneLabel : `${label} ${k}`} onClick={() => onPick(k)} />
      ))}
      <div ref={wrap} className="cp-wrap">
        <button className={`sw custom ${custom || picking ? 'on' : ''}`} style={custom ? { background: custom } : undefined} title="Свой цвет" aria-label="Свой цвет"
          aria-expanded={picking} onClick={() => setPicking(!picking)} />
        {picking && <ColorPicker value={custom ?? FILLS.yellow} onChange={onPick} onStart={() => editor.beginChange()} onEnd={() => editor.endChange()} />}
      </div>
    </>
  );
}

/** The opacity slider with its percent, after a line; dragging it is one change. */
function OpacitySlider({ editor, value, onChange }: { editor: Editor; value: number; onChange: (v: number) => void }) {
  const pct = Math.round(value * 100);
  return (
    <>
      <div className="sep" />
      <input type="range" min={0} max={100} value={pct} aria-label="Прозрачность, %" style={{ '--p': `${pct}%` } as React.CSSProperties}
        onPointerDown={() => { editor.beginChange(); window.addEventListener('pointerup', () => editor.endChange(), { once: true }); }}
        onChange={(e) => onChange(Number(e.target.value) / 100)} />
      <span>{pct}%</span>
    </>
  );
}

/** The colours of the selected stickers, shapes, tasks and mind map nodes, and of icons. */
function ItemColors({ editor, items }: { editor: Editor; items: Item[] }) {
  const [paint, pick] = usePaint();
  const colorable = items.filter((i) => COLORABLE.includes(i.type)), icons = items.filter((i) => i.type === 'icon');
  const strokable = items.filter((i) => STROKABLE.includes(i.type));
  // Mind map nodes but central topics (all the selected) get a fill and an edge of their own.
  const deepMind = colorable.length > 0 && colorable.every((i) => i.type === 'mind' && mindDepth(i, (id) => editor.board.get(id)) >= 1);
  if (deepMind) return <MindColors editor={editor} nodes={colorable} />;
  const fill = same(colorable.map((i) => i.color)), stroke = same(strokable.map((i) => i.sc ?? 'gray'));
  // Outlines are set only while shapes or tasks are among the selected; with both picked, colour and
  // opacity go to both, the outline taking the fill's colour itself.
  const targets: Paint[] = strokable.length ? paint : ['fill'];
  const target = targets.includes('fill') ? 'fill' : 'stroke', both = targets.length > 1;
  const setColor = (c: string) => {
    editor.beginChange();
    if (targets.includes('fill')) editor.setColor(c);
    if (targets.includes('stroke')) editor.setStroke(both && c !== 'none' && FILLS[c] ? FILLS[c] : c);
    editor.endChange();
  };
  // Mind map nodes on their own get their strong colours instead of the pale fills.
  const mind = colorable.length > 0 && colorable.every((i) => i.type === 'mind');
  const allowNone = colorable.every((i) => i.type !== 'sticky');
  const swatches: Array<[string, string]> = mind ? MIND_PALETTE.map((c) => [c, c]) : target === 'fill'
    ? Object.entries(FILLS).filter(([k]) => k !== 'none' || allowNone)
    : [...Object.entries(STROKE_COLORS).map(([k, v]): [string, string] => [k, v || (k === 'ink' ? 'var(--ink)' : 'var(--shape-stroke)')]), ['none', '']];
  const opacity = Number(same(target === 'fill' ? colorable.map((i) => String(i.fo ?? 1)) : strokable.map((i) => String(i.so ?? 1))) ?? 1);
  const iconColor = same(icons.map((i) => i.color));
  return (
    <Palette label="Цвет">
      {colorable.length > 0 && <>
        {strokable.length > 0 && <PaintSwitch paint={targets} pick={pick} fill={fill} stroke={stroke} fillLabel="Заливка" strokeLabel="Обводка" />}
        <Swatches editor={editor} swatches={swatches} current={target === 'fill' ? fill : stroke} onPick={setColor}
          label={target === 'fill' ? 'Цвет' : 'Цвет обводки'} noneLabel={target === 'fill' ? 'Без заливки' : 'Без обводки'} />
        <OpacitySlider editor={editor} value={opacity} onChange={(v) => targets.forEach((t) => editor.setOpacity(t, v))} />
      </>}
      {colorable.length > 0 && icons.length > 0 && <div className="sep" />}
      {icons.length > 0 && Object.entries(ICON_COLORS).map(([k, v]) => (
        <button key={k} className={`sw ${iconColor === k ? 'on' : ''}`} style={{ background: v || 'var(--ink)' }}
          title="Цвет иконки" aria-label={`Цвет иконки ${k}`} onClick={() => editor.setIconColor(k)} />
      ))}
    </Palette>
  );
}

/** The colours of mind map nodes but central topics: their fill (pale, or the usual) and their edge
 *  and branch (the strong ones), with opacity for either; Shift picks both. */
function MindColors({ editor, nodes }: { editor: Editor; nodes: Item[] }) {
  const [paint, pick] = usePaint();
  const fill = same(nodes.map((i) => i.fc ?? 'none')), stroke = same(nodes.map((i) => i.color));
  const target = paint.includes('fill') ? 'fill' : 'stroke';
  const swatches: Array<[string, string]> = target === 'fill' ? Object.entries(FILLS) : MIND_PALETTE.map((c) => [c, c]);
  const setColor = (c: string) => {
    editor.beginChange();
    if (paint.includes('fill')) editor.setMindFill(c);
    // Together, the edge takes the fill's colour itself (as long as it's a colour).
    if (paint.includes('stroke') && c !== 'none') editor.setColor(c.startsWith('#') ? c : FILLS[c] ?? c);
    editor.endChange();
  };
  const opacity = Number(same(nodes.map((i) => String((target === 'fill' ? i.fo : i.so) ?? 1))) ?? 1);
  return (
    <Palette label="Цвет">
      <PaintSwitch paint={paint} pick={pick} fill={fill} stroke={stroke ?? MIND_PALETTE[0]} fillLabel="Заливка" strokeLabel="Обводка" />
      <Swatches editor={editor} swatches={swatches} current={target === 'fill' ? fill : stroke} onPick={setColor}
        label={target === 'fill' ? 'Цвет' : 'Цвет обводки'} noneLabel="Без заливки" />
      <OpacitySlider editor={editor} value={opacity} onChange={(v) => paint.forEach((t) => editor.setOpacity(t, v))} />
    </Palette>
  );
}

/**
 * The colours of a selected table: fill for its picked cells (every cell when none is picked) or
 * colours for its lines, with the switch at the start (Shift picks both), and their opacity.
 */
function TableColors({ editor, table, cells }: { editor: Editor; table: Item; cells: number[] }) {
  const [paint, pick] = usePaint();
  const n = colsOf(table).length * rowsOf(table).length, mine = cells.length ? cells : Array.from({ length: n }, (_, i) => i);
  const own = (i: number, k: string) => table.cellFmt?.[i]?.[k];
  const fill = same(mine.map((i) => { const v = own(i, 'bg'); return typeof v === 'string' ? v : 'none'; }));
  const stroke = table.sc ?? 'gray';
  const both = paint.length > 1, target = paint.includes('fill') ? 'fill' : 'stroke';
  const swatches: Array<[string, string]> = target === 'fill' ? Object.entries(FILLS)
    : [...Object.entries(STROKE_COLORS).map(([k, v]): [string, string] => [k, v || (k === 'ink' ? 'var(--ink)' : 'var(--line)')]), ['none', '']];
  const setColor = (c: string) => {
    editor.beginChange();
    if (paint.includes('fill')) editor.setCellFill(c);
    // Together, the lines take the fill's colour itself.
    if (paint.includes('stroke')) editor.setTableLines({ sc: both && c !== 'none' && FILLS[c] ? FILLS[c] : c });
    editor.endChange();
  };
  const opacity = target === 'fill' ? Number(same(mine.map((i) => String(own(i, 'bgo') ?? 1))) ?? 1) : table.so ?? 1;
  return (
    <Palette label={cells.length ? 'Цвет ячеек и линий' : 'Цвет таблицы и линий'}>
      <PaintSwitch paint={paint} pick={pick} fill={fill} stroke={stroke} fillLabel="Заливка ячеек" strokeLabel="Линии" />
      <Swatches editor={editor} swatches={swatches} current={target === 'fill' ? fill : stroke} onPick={setColor}
        label={target === 'fill' ? 'Цвет ячеек' : 'Цвет линий'} noneLabel={target === 'fill' ? 'Без заливки' : 'Без линий'} />
      <OpacitySlider editor={editor} value={opacity} onChange={(v) => {
        if (paint.includes('fill')) editor.setCellOpacity(v);
        if (paint.includes('stroke')) editor.setTableLines({ so: v });
      }} />
    </Palette>
  );
}


/** How wide the panel may be: the screen less its margins and the tool rail. */
function selectionRoom(): number {
  const rail = document.querySelector('.tools')?.getBoundingClientRect();
  return innerWidth - EDGE * 2 - (rail ? rail.width + EDGE : 0);
}

export function SelectionPanel({ editor, items, cells, linkCount, docked }: { editor: Editor; items: Item[]; cells: number[]; linkCount: number; docked: boolean }) {
  // Hooks come before the early return; buttons can be rearranged by holding them.
  const sort = useSortable('planx-order-selection', ORDER, 'x');
  // Centred at the bottom, clear of the tool rail (on whichever side); where another panel stands
  // there (wherever it's been moved), it goes up above it instead.
  const [place, setPlace] = useState<{ left: number; bottom: number | null }>({ left: 0, bottom: null });
  const [, redraw] = useReducer((n: number) => n + 1, 0);
  // It finds its place again when the window changes size, a panel opens or closes beside the rail,
  // another panel is moved, or one has slid to a new place.
  useEffect(() => {
    const slid = (e: TransitionEvent) => { if ((e.target as Element).matches?.('.bar:not(.panel), .tools')) redraw(); };
    window.addEventListener('resize', redraw);
    window.addEventListener('planx:side-panels', redraw);
    window.addEventListener('transitionend', slid);
    return () => {
      window.removeEventListener('resize', redraw);
      window.removeEventListener('planx:side-panels', redraw);
      window.removeEventListener('transitionend', slid);
    };
  }, []);
  useLayoutEffect(() => {
    const el = sort.ref.current;
    if (!el) return;
    // Its width, from what's in it.
    const kids = [...el.children] as HTMLElement[];
    const outer = (k: HTMLElement) => { const cs = getComputedStyle(k); return k.offsetWidth + parseFloat(cs.marginLeft) + parseFloat(cs.marginRight); };
    const cs = getComputedStyle(el), gap = parseFloat(cs.columnGap) || 0, pad = parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight);
    const w = kids.reduce((t, k) => t + outer(k), 0) + gap * (kids.length - 1) + pad, h = el.offsetHeight;
    // Across: centred, but clear of the tool rail and what opens beside it.
    let lo = EDGE, hi = innerWidth - EDGE - w;
    for (const r of shownRects('.tools, .tools-more, .draw-panel')) {
      if (r.left < innerWidth / 2) lo = Math.max(lo, r.right + EDGE); else hi = Math.min(hi, r.left - EDGE - w);
    }
    const centred = (innerWidth - w) / 2, left = Math.max(lo, Math.min(hi, centred));
    // Up: from the bottom, above every panel it would lie over.
    const base = docked ? 0 : EDGE, others = shownRects('.topbar, .bar.zoom');
    let bottom = base;
    for (let tries = 0; tries < 4; tries++) {
      const top = innerHeight - bottom - h;
      const hit = others.find((r) => crowds({ left, top, width: w, height: h }, r));
      if (!hit) break;
      bottom = innerHeight - hit.top + EDGE;
    }
    // How far off the middle it stands (moved by a shift, so it slides there and back).
    const next = { left: Math.round(left - centred), bottom: bottom === base ? null : Math.round(bottom) };
    if (next.left !== place.left || next.bottom !== place.bottom) setPlace(next);
  });
  if (!items.length && !linkCount) return null;
  const tables = items.filter((i) => i.type === 'table');
  const colored = items.some((i) => COLORABLE.includes(i.type) || i.type === 'icon');
  const btn = (icon: PanelIconName, title: string, fn: () => void) => (
    <button className="ib" title={title} aria-label={title} onClick={fn}><PanelIcon name={icon} /></button>
  );
  return (
    <div ref={sort.ref as React.RefObject<HTMLDivElement>} className={`bar panel sortable ${docked ? 'docked' : ''} ${place.bottom !== null ? 'raised' : ''} ${sort.sorting ? 'sorting' : ''}`}
      style={{ transform: `translateX(calc(-50% + ${place.left}px))`, ...(place.bottom !== null && { bottom: place.bottom }) }}
      role="toolbar" aria-label="Выделенное" {...sort.container}>
      {sort.renderFit({
        // All the colours are under the palette: a table's own when it's selected alone.
        // (Picking something else closes the palette: the key changes with the selection.)
        colors: tables.length === 1 && items.length === 1 ? <TableColors key={tables[0].id} editor={editor} table={tables[0]} cells={cells} />
          : colored ? <ItemColors key={items.map((i) => i.id).join()} editor={editor} items={items} /> : undefined,
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
        front: items.length > 0 ? btn('to-front', 'На передний план', () => editor.bringToFront()) : undefined,
        back: items.length > 0 ? btn('to-back', 'На задний план', () => editor.sendToBack()) : undefined,
        duplicate: items.length > 0 ? btn('duplicate', 'Дублировать (Ctrl+D)', () => editor.duplicate()) : undefined,
        trash: btn('trashcan', 'Удалить (Del)', () => editor.deleteSelection()),
      }, selectionRoom(), 'above')}
    </div>
  );
}
