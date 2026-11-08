import { useEffect, useLayoutEffect, useReducer, useRef, useState, type ReactNode } from 'react';
import type { Editor } from '../editor/editor';
import type { Item } from '../model/types';
import { fillable, FILLS, ICON_COLORS, MARKER_OPACITY, INK_COLORS, strokable as canStroke, STROKE_COLORS, TEXT_COLORS } from '../model/types';
import { fillOpacity, MIND_PALETTE, mindDepth } from '../model/mind';
import { colsOf, rowsOf } from '../model/table';
import { PanelIcon, type PanelIconName } from './PanelIcon';
import { useSortable } from './sortable';
import { ColorPicker } from './ColorPicker';
import { crowds, EDGE, fitPopovers, shownRects } from '../layout';
import { useLabs } from '../labs/labs';
import { AlignButton, LockButton, ReactButton, TidyButton } from '../labs/SelectionLabs';
import { CodeLang } from '../labs/CodeLang';
import { ItemMenuButton, LinkParams } from '../labs/ContextMenu';
import { boxOf, instanceBounds } from '../canvas/geometry';
import { placeOver } from './FormatPanel';
import { canCrop, croppingId, subscribeCrop, toggleCrop } from '../labs/imageCrop';


const same = (vals: Array<string | undefined>): string | null => (vals.length && vals.every((v) => v === vals[0]) ? vals[0] ?? null : null);

/** Rearrangeable buttons; the bin comes last until moved. */
/** "2 объекта", "5 объектов", "21 объект". */
const objects = (n: number) => `${n} ${n % 10 === 1 && n % 100 !== 11 ? 'объект' : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14) ? 'объекта' : 'объектов'}`;
const ORDER = ['fold', 'grouped', 'lang', 'sepLang', 'colors', 'text', 'notext', 'align', 'tidy', 'rows', 'cols', 'crop', 'lines', 'component', 'detach', 'front', 'back', 'duplicate', 'lock', 'react', 'trash'];

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

type Paint = 'fill' | 'stroke' | 'down' | 'text';

/** Which colours the circles set, fill or outline (a table's lines), or the text's; Shift-click picks
 *  fill and outline both (the text's goes on its own). */
function usePaint(): [Paint[], (which: Paint, shift: boolean) => void] {
  const [paint, setPaint] = useState<Paint[]>(['fill']);
  return [paint, (which, shift) => {
    if (!shift || which === 'text' || paint.includes('text')) setPaint([which]);
    else if (!paint.includes(which)) setPaint([...paint, which]);
    else if (paint.length > 1) setPaint(paint.filter((p) => p !== which));
  }];
}

/** The text colours to pick: by itself (white on a dark fill, else the usual; half and half), or one. */
const TEXT_SWATCHES: Array<[string, string]> = Object.entries(TEXT_COLORS).map(([k, v]) => [k, k === 'ink' ? 'linear-gradient(135deg, #1C1F26 50%, #FFFFFF 50%)' : v]);
const textLook = (tc: string | null) => (!tc || tc === 'ink' ? 'var(--ink)' : tc.startsWith('#') ? tc : TEXT_COLORS[tc] || 'var(--ink)');

/** The fill/outline/text switch, each showing its colour now (outline and text where there are), and a
 *  line after it. */
function PaintSwitch({ paint, pick, fill, stroke, fillLabel, strokeLabel, down, downLabel, text }: {
  paint: Paint[]; pick: (which: Paint, shift: boolean) => void; fill: string | null; stroke?: string | null; fillLabel: string; strokeLabel?: string;
  /** A table's: the lines down between its columns, a second outline circle. */
  down?: string | null; downLabel?: string; text?: string | null;
}) {
  const fillLook = !fill ? 'var(--line)' : fill.startsWith('#') ? fill : fill === 'none' ? 'transparent' : FILLS[fill] ?? FILLS.blue;
  const lineLook = (c: string | null | undefined) => !c ? 'var(--line)' : c.startsWith('#') ? c : c === 'none' ? 'transparent'
    : c === 'ink' ? 'var(--ink)' : STROKE_COLORS[c] || 'var(--shape-stroke)';
  const strokeLook = lineLook(stroke);
  return (
    <>
      <div className="sw-group paint-target">
        <button className={`ib ${paint.includes('fill') ? 'on' : ''}`} title={`${fillLabel} (с Shift — вместе)`} aria-label={fillLabel}
          aria-pressed={paint.includes('fill')} onClick={(e) => pick('fill', e.shiftKey)}>
          <span className={`paint-fill ${fill === 'none' ? 'none' : ''}`} style={{ background: fillLook }} />
        </button>
        {stroke !== undefined && (
          <button className={`ib ${paint.includes('stroke') ? 'on' : ''}`} title={`${strokeLabel} (с Shift — вместе)`} aria-label={strokeLabel}
            aria-pressed={paint.includes('stroke')} onClick={(e) => pick('stroke', e.shiftKey)}>
            <span className={`paint-stroke ${stroke === 'none' ? 'none' : ''}`} style={{ borderColor: strokeLook }} />
          </button>
        )}
        {down !== undefined && (
          <button className={`ib ${paint.includes('down') ? 'on' : ''}`} title={`${downLabel} (с Shift — вместе)`} aria-label={downLabel}
            aria-pressed={paint.includes('down')} onClick={(e) => pick('down', e.shiftKey)}>
            <span className={`paint-stroke ${down === 'none' ? 'none' : ''}`} style={{ borderColor: lineLook(down) }} />
          </button>
        )}
        {text !== undefined && (
          <button className={`ib ${paint.includes('text') ? 'on' : ''}`} title="Цвет текста" aria-label="Цвет текста"
            aria-pressed={paint.includes('text')} onClick={(e) => pick('text', e.shiftKey)}>
            <span className="paint-text" style={{ borderColor: textLook(text) }}>A</span>
          </button>
        )}
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
  const colorable = items.filter(fillable), icons = items.filter((i) => i.type === 'icon');
  const strokable = items.filter(canStroke);
  // Mind map nodes but central topics (all the selected) get a fill and an edge of their own.
  const deepMind = colorable.length > 0 && colorable.every((i) => i.type === 'mind' && mindDepth(i, (id) => editor.board.get(id)) >= 1);
  if (deepMind) return <MindColors editor={editor} nodes={colorable} />;
  const fill = same(colorable.map((i) => i.color)), stroke = same(strokable.map((i) => i.sc ?? 'gray'));
  // Outlines are set only while shapes or tasks are among the selected; with both picked, colour and
  // opacity go to both, the outline taking the fill's colour itself.
  const text = same(colorable.map((i) => i.tc ?? 'ink'));
  const shown = paint.filter((p) => p !== 'stroke' || strokable.length), targets: Paint[] = shown.length ? shown : ['fill'];
  const target = targets.includes('fill') ? 'fill' : targets.includes('stroke') ? 'stroke' : 'text', both = targets.length > 1;
  const setColor = (c: string) => {
    editor.beginChange();
    if (targets.includes('fill')) editor.setColor(c);
    if (targets.includes('stroke')) editor.setStroke(both && c !== 'none' && FILLS[c] ? FILLS[c] : c);
    // A text colour given turns the one by itself off; "by itself" back on.
    if (targets.includes('text')) editor.setTextStyle({ tc: c === 'ink' ? undefined : c });
    editor.endChange();
  };
  // Mind map nodes on their own get their strong colours instead of the pale fills.
  const mind = colorable.length > 0 && colorable.every((i) => i.type === 'mind');
  const allowNone = colorable.every((i) => i.type !== 'sticky');
  // Grey is for tasks done (see canvas/task.ts): not one to give them.
  const tasks = colorable.some((i) => i.type === 'task');
  const swatches: Array<[string, string]> = target === 'text' ? TEXT_SWATCHES : mind ? MIND_PALETTE.map((c) => [c, c]) : target === 'fill'
    ? Object.entries(FILLS).filter(([k]) => (k !== 'none' || allowNone) && (k !== 'gray' || !tasks))
    : [...Object.entries(STROKE_COLORS).map(([k, v]): [string, string] => [k, v || (k === 'ink' ? 'var(--ink)' : 'var(--shape-stroke)')]), ['none', '']];
  const opacity = Number(same(target === 'fill' ? colorable.map((i) => String(fillOpacity(i))) : target === 'text' ? colorable.map((i) => String(i.to ?? 1))
    : strokable.map((i) => String(i.sc === 'none' ? 0 : i.so ?? 1))) ?? 1);
  const iconColor = same(icons.map((i) => i.color ?? 'ink')), inks = items.filter((i) => i.type === 'ink'), inkColor = same(inks.map((i) => i.color ?? 'ink'));
  const seeThrough = (list: Item[]) => Number(same(list.map((i) => String(fillOpacity(i)))) ?? 1);
  return (
    <Palette label="Цвет">
      {colorable.length > 0 && <>
        <PaintSwitch paint={targets} pick={pick} fill={fill} stroke={strokable.length ? stroke : undefined} fillLabel="Заливка" strokeLabel="Обводка" text={text} />
        <Swatches editor={editor} swatches={swatches} current={target === 'fill' ? fill : target === 'stroke' ? stroke : text} onPick={setColor}
          label={target === 'fill' ? 'Цвет' : target === 'stroke' ? 'Цвет обводки' : 'Цвет текста'} noneLabel={target === 'fill' ? 'Без заливки' : 'Без обводки'} />
        <OpacitySlider editor={editor} value={opacity} onChange={(v) => targets.forEach((t) => t !== 'down' && editor.setOpacity(t, v))} />
      </>}
      {/* Icons and drawings: their colour, any too, and how see-through. */}
      {colorable.length > 0 && icons.length > 0 && <div className="sep" />}
      {icons.length > 0 && <>
        <Swatches editor={editor} swatches={Object.entries(ICON_COLORS).map(([k, v]) => [k, v || 'var(--ink)'])} current={iconColor}
          onPick={(c) => editor.setIconColor(c)} label="Цвет иконки" noneLabel="" />
        <OpacitySlider editor={editor} value={seeThrough(icons)} onChange={(v) => editor.setOpacity('icon', v)} />
      </>}
      {(colorable.length > 0 || icons.length > 0) && inks.length > 0 && <div className="sep" />}
      {inks.length > 0 && <>
        <Swatches editor={editor} swatches={Object.entries(INK_COLORS).map(([k, v]) => [k, v || 'var(--ink)'])} current={inkColor}
          onPick={(c) => editor.setInkColor(c)} label="Цвет рисунка" noneLabel="" />
        {/* How opaque the lines really are (a highlighter's see-through by default). */}
        <OpacitySlider editor={editor} value={Number(same(inks.map((i) => String(i.fo ?? (i.hl ? MARKER_OPACITY : 1)))) ?? 1)} onChange={(v) => editor.setOpacity('icon', v)} />
      </>}
    </Palette>
  );
}

/** The colours of mind map nodes but central topics: their fill (pale, or the usual) and their edge
 *  and branch (the strong ones), with opacity for either; Shift picks both. */
function MindColors({ editor, nodes }: { editor: Editor; nodes: Item[] }) {
  const [paint, pick] = usePaint();
  const fill = same(nodes.map((i) => i.fc ?? 'none')), stroke = same(nodes.map((i) => i.color)), text = same(nodes.map((i) => i.tc ?? 'ink'));
  const target = paint.includes('fill') ? 'fill' : paint.includes('stroke') ? 'stroke' : 'text';
  const swatches: Array<[string, string]> = target === 'text' ? TEXT_SWATCHES : target === 'fill' ? Object.entries(FILLS) : MIND_PALETTE.map((c) => [c, c]);
  const setColor = (c: string) => {
    editor.beginChange();
    if (paint.includes('fill')) editor.setMindFill(c);
    // Together, the edge takes the fill's colour itself (as long as it's a colour).
    if (paint.includes('stroke') && c !== 'none') editor.setColor(c.startsWith('#') ? c : FILLS[c] ?? c);
    if (paint.includes('text')) editor.setTextStyle({ tc: c === 'ink' ? undefined : c });
    editor.endChange();
  };
  const opacity = Number(same(nodes.map((i) => String((target === 'fill' ? fillOpacity(i) : target === 'text' ? i.to : i.so) ?? 1))) ?? 1);
  return (
    <Palette label="Цвет">
      <PaintSwitch paint={paint} pick={pick} fill={fill} stroke={stroke ?? MIND_PALETTE[0]} fillLabel="Заливка" strokeLabel="Обводка" text={text} />
      <Swatches editor={editor} swatches={swatches} current={target === 'fill' ? fill : target === 'stroke' ? stroke : text} onPick={setColor}
        label={target === 'fill' ? 'Цвет' : target === 'stroke' ? 'Цвет обводки' : 'Цвет текста'} noneLabel="Без заливки" />
      <OpacitySlider editor={editor} value={opacity} onChange={(v) => paint.forEach((t) => t !== 'down' && editor.setOpacity(t, v))} />
    </Palette>
  );
}

/**
 * The colours of a selected table: fill for its picked cells (every cell when none is picked) or
 * colours for its lines, with the switch at the start (Shift picks both), and their opacity.
 */
function TableColors({ editor, table, cells }: { editor: Editor; table: Item; cells: number[] }) {
  const [paint, pick] = usePaint();
  // Cells picked (others than before): back on their fill.
  const cellKey = cells.join();
  useEffect(() => { if (cellKey) pick('fill', false); }, [cellKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const n = colsOf(table).length * rowsOf(table).length, mine = cells.length ? cells : Array.from({ length: n }, (_, i) => i);
  const own = (i: number, k: string) => table.cellFmt?.[i]?.[k];
  const fill = same(mine.map((i) => { const v = own(i, 'bg'); return typeof v === 'string' ? v : 'none'; }));
  const stroke = table.sc ?? 'gray', down = table.vc ?? stroke;
  const target = paint.includes('fill') ? 'fill' : paint.includes('stroke') ? 'stroke' : 'down';
  const swatches: Array<[string, string]> = target === 'fill' ? Object.entries(FILLS)
    : [...Object.entries(STROKE_COLORS).map(([k, v]): [string, string] => [k, v || (k === 'ink' ? 'var(--ink)' : 'var(--line)')]), ['none', '']];
  const setColor = (c: string) => {
    editor.beginChange();
    if (paint.includes('fill')) editor.setCellFill(c);
    // Together, the lines take the fill's colour itself.
    const line = paint.includes('fill') && c !== 'none' && FILLS[c] ? FILLS[c] : c;
    if (paint.includes('stroke')) editor.setTableLines({ sc: line });
    if (paint.includes('down')) editor.setTableLines({ vc: line });
    editor.endChange();
  };
  const opacity = target === 'fill' ? Number(same(mine.map((i) => String(own(i, 'bgo') ?? 1))) ?? 1) : target === 'stroke' ? table.so ?? 1 : table.vo ?? table.so ?? 1;
  return (
    <Palette label={cells.length ? 'Цвет ячеек и линий' : 'Цвет таблицы и линий'}>
      <PaintSwitch paint={paint} pick={pick} fill={fill} stroke={stroke} fillLabel="Заливка ячеек" strokeLabel="Линии и край"
        down={down} downLabel="Вертикальные линии" />
      <Swatches editor={editor} swatches={swatches} current={target === 'fill' ? fill : target === 'stroke' ? stroke : down} onPick={setColor}
        label={target === 'fill' ? 'Цвет ячеек' : 'Цвет линий'} noneLabel={target === 'fill' ? 'Без заливки' : 'Без линий'} />
      <OpacitySlider editor={editor} value={opacity} onChange={(v) => {
        if (paint.includes('fill')) editor.setCellOpacity(v);
        if (paint.includes('stroke')) editor.setTableLines({ so: v });
        if (paint.includes('down')) editor.setTableLines({ vo: v });
      }} />
    </Palette>
  );
}


/** How long the panel over what's picked takes to fade out going to its other side, and back in there
 *  (as long as panels take to go). */
const FLIP = 80;

/** The room the menu's button takes at the right end. */
const MENU_BUTTON = 44;

/** How wide the panel may be: the screen less its margins and the tool rail. */
function selectionRoom(): number {
  const rail = document.querySelector('.tools')?.getBoundingClientRect();
  return innerWidth - EDGE * 2 - (rail ? rail.width + EDGE : 0);
}

export function SelectionPanel({ editor, items, cells, linkCount, docked, over, after, onText }: { editor: Editor; items: Item[]; cells: number[]; linkCount: number; docked: boolean;
  /** The second one, over what's picked as the text panel is over what's typed in ("Панель над элементом", src/labs). */
  over?: boolean;
  /** (That one) coming in where the text panel is going: once it's gone. */
  after?: boolean;
  /** "Кнопка T" (src/labs): turns the panel into the text panel. */
  onText?: () => void }) {
  // Hooks come before the early return; buttons can be rearranged by holding them.
  const sort = useSortable('planx-order-selection', ORDER, 'x');
  const labs = useLabs();
  // Centred at the bottom, clear of the tool rail (on whichever side); where another panel stands
  // there (wherever it's been moved), it goes up above it instead.
  const [place, setPlace] = useState<{ left: number; bottom: number | null }>({ left: 0, bottom: null });
  const [, redraw] = useReducer((n: number) => n + 1, 0);
  // Over what's picked but with no room there, it stands under it, and what opens from it opens down.
  const [down, setDown] = useState(false);
  // Whether it came in waiting for the text panel to go (as it showed up).
  const wait = useRef(false), had = useRef(false);
  // Over what's picked, it stays where it is while rows or columns are being added or taken away (the
  // table growing under it), till the pointer leaves it or the board's scrolled.
  const hold = useRef(false), flipping = useRef(false), want = useRef(false);
  // What opens from it (palette, alignment, reactions) turns to its other side when there's no room
  // for it where it opens (lying over the panel, past the window's edge).
  // (Once it's there: with nothing picked it isn't.)
  const body = sort.ref.current;
  useEffect(() => { const el = sort.ref.current; return el ? fitPopovers(el, '.op-pop') : undefined; }, [body]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => subscribeCrop(redraw), []);
  if (over && items.length && !had.current) wait.current = !!after;
  had.current = items.length > 0;
  // It finds its place again when the window changes size, a panel opens or closes beside the rail,
  // another panel is moved, or one has slid to a new place.
  useEffect(() => {
    const slid = (e: TransitionEvent) => { if ((e.target as Element).matches?.('.bar:not(.panel), .tools')) redraw(); };
    window.addEventListener('resize', redraw);
    window.addEventListener('planx:side-panels', redraw);
    window.addEventListener('transitionend', slid);
    const free = () => { if (hold.current) { hold.current = false; redraw(); } };
    window.addEventListener('wheel', free, { passive: true });
    return () => {
      window.removeEventListener('wheel', free);
      window.removeEventListener('resize', redraw);
      window.removeEventListener('planx:side-panels', redraw);
      window.removeEventListener('transitionend', slid);
    };
  }, []);
  useLayoutEffect(() => {
    const el = sort.ref.current;
    if (!el) return;
    if (over) {
      if (hold.current) return;
      const all = editor.board.list(), boxes = items.map((i) => (i.inst ? instanceBounds(i, all) : boxOf(i)));
      if (!boxes.length) return;
      const x = Math.min(...boxes.map((b) => b.x)), y = Math.min(...boxes.map((b) => b.y));
      const box = { x, y, w: Math.max(...boxes.map((b) => b.x + b.w)) - x, h: Math.max(...boxes.map((b) => b.y + b.h)) - y };
      // Going over to the other side (dragged up past the top, say): it fades out where it is, then
      // comes back in on that side, as quick as panels go.
      const under = placeOver(editor, el, box, undefined, flipping.current ? down : undefined);
      want.current = under;
      if (under !== down && !flipping.current) {
        flipping.current = true;
        placeOver(editor, el, box, undefined, down);
        el.style.transition = `opacity ${FLIP}ms ease`;
        el.style.opacity = '0';
        setTimeout(() => {
          flipping.current = false;
          el.style.opacity = '';
          setDown(want.current);
          setTimeout(() => { if (!flipping.current) el.style.transition = ''; }, FLIP + 20);
        }, FLIP);
        return;
      }
      if (!flipping.current && under !== down) setDown(under);
      return;
    }
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
  if (!items.length && (over || !linkCount)) return null;
  const tables = items.filter((i) => i.type === 'table'), links = editor.selectedLinks();
  // (Shapes, not blocks of code: «Без текста».)
  const group = items.length === 1 && items[0].type === 'frame' && !items[0].tl && !items[0].inst ? items[0] : null;
  const shapes = items.filter((i) => (i.type === 'rect' || i.type === 'ellipse' || i.type === 'polygon') && !i.code), noText = shapes.length > 0 && shapes.every((s) => s.nt);
  // An instance picked alone, or something in one (not of a built-in component: those aren't changed).
  const inOne = items.length === 1 ? (items[0].host ? editor.board.get(items[0].host) : items[0]) : undefined;
  const editInst = inOne?.inst && !inOne.inst.startsWith('@') ? inOne.id : null;
  // «Группы» (src/labs): one group picked, all of it (how many in it, and undoing it); or several picked
  // that aren't one, to be made one.
  const grp = items[0]?.grp, oneGroup = !!grp && items.every((i) => i.grp === grp) && editor.board.list().filter((i) => i.grp === grp).length === items.length;
  const colored = items.some((i) => (fillable(i) && !i.code) || i.type === 'icon' || i.type === 'ink');
  const btn = (icon: PanelIconName, title: string, fn: () => void) => (
    <button className={`ib ${icon === 'trashcan' ? 'danger' : ''}`} title={title} aria-label={title} onClick={fn}><PanelIcon name={icon} /></button>
  );
  return (
    <div ref={sort.ref as React.RefObject<HTMLDivElement>} className={`bar panel sortable ${over ? `panel-over ${down ? 'opens-down' : ''} ${wait.current ? 'after-gone' : ''}` : docked ? 'docked' : ''} ${!over && place.bottom !== null ? 'raised' : ''} ${sort.sorting ? 'sorting' : ''}`}
      style={over ? undefined : { transform: `translateX(calc(-50% + ${place.left}px))`, ...(place.bottom !== null && { bottom: place.bottom }) }}
      role="toolbar" aria-label="Выделенное" {...sort.container}
      onPointerLeave={(e) => {
        if (!hold.current) return;
        // Over the table again, gliding there.
        const el = e.currentTarget;
        hold.current = false;
        el.style.transition = 'left .2s ease, top .2s ease';
        setTimeout(() => { el.style.transition = ''; }, 220);
        redraw();
      }}>
      {sort.renderFit({
        // A block of code's language ("Код", src/labs).
        lang: labs.codeBlock && items.length === 1 && items[0].code ? <CodeLang key={items[0].id} editor={editor} item={items[0]} /> : undefined,
        sepLang: labs.codeBlock && items.length === 1 && items[0].code ? <div className="sep" /> : undefined,
        // All the colours are under the palette: a table's own when it's selected alone.
        // (Picking something else closes the palette: the key changes with the selection.)
        colors: tables.length === 1 && items.length === 1 ? <TableColors key={tables[0].id} editor={editor} table={tables[0]} cells={cells} />
          : colored ? <ItemColors key={items.map((i) => i.id).join()} editor={editor} items={items} />
          // Links alone: their colour, opacity, dashes and arrowheads, all of them at once.
          : links.length > 0 ? <Palette key={links.map((l) => l.id).join()} label="Цвет и стрелки линий"><LinkParams editor={editor} ids={links.map((l) => l.id)} /></Palette> : undefined,
        // Rows and columns of the selected tables: add or take away the last one.
        rows: tables.length > 0 ? (
          <div className="sw-group table-count">
            <span>Строки</span>
            {btn('minus-s', 'Убрать строку', () => { hold.current = !!over; editor.changeTable('row', -1); })}
            {btn('plus-s', 'Добавить строку', () => { hold.current = !!over; editor.changeTable('row', 1); })}
          </div>
        ) : undefined,
        cols: tables.length > 0 ? (
          <div className="sw-group table-count">
            <span>Столбцы</span>
            {btn('minus-s', 'Убрать столбец', () => { hold.current = !!over; editor.changeTable('col', -1); })}
            {btn('plus-s', 'Добавить столбец', () => { hold.current = !!over; editor.changeTable('col', 1); })}
          </div>
        ) : undefined,
        // "Кроп картинки" (src/labs).
        crop: labs.imageCrop && items.length === 1 && canCrop(items[0]) ? (
          <button className={`ib ${croppingId() === items[0].id ? 'on' : ''}`} title="Кроп" aria-label="Кроп" aria-pressed={croppingId() === items[0].id}
            onClick={() => toggleCrop(editor)}><PanelIcon name="crop" /></button>
        ) : undefined,
        // How the selected links run: straight, in right angles, smooth; each way any of them runs lit,
        // a press sending all of them that way.
        lines: links.length > 0 ? (
          <div className="sw-group">
            {([[undefined, 'line-curve', 'Плавная линия'], ['elbow', 'line-elbow', 'Линия с прямыми углами'], ['straight', 'line-straight', 'Прямая линия']] as const).map(([style, icon, title]) => (
              <button key={icon} className={`ib ${links.some((l) => l.style === style) ? 'on' : ''}`} title={title} aria-label={title}
                aria-pressed={links.some((l) => l.style === style)} onClick={() => editor.setLinkStyle(style)}><PanelIcon name={icon} /></button>
            ))}
          </div>
        ) : undefined,
        // What's picked made a component (one already isn't made one again); a component's instance (or
        // something in one) alone: its component brought out to be changed instead.
        component: editInst ? btn('component', 'Редактировать компонент', () => editor.editComponentAt(editInst))
          : items.length > 0 && !(items.length === 1 && items[0].comp) ? btn('component', 'Компонент из выделенного', () => editor.makeComponent()) : undefined,
        // An instance can be cut loose from its component.
        detach: items.some((i) => i.inst) ? btn('component-off', 'Отвязать от компонента (Ctrl+Alt+B)', () => editor.detachInstances()) : undefined,
        // A layer up or down past what it lies over (as Ctrl+↑, Ctrl+↓), not to the very top or bottom.
        front: items.length > 0 ? btn('to-front', 'На слой выше', () => editor.shiftZ(1)) : undefined,
        back: items.length > 0 ? btn('to-back', 'На слой ниже', () => editor.shiftZ(-1)) : undefined,
        duplicate: items.length > 0 ? btn('duplicate', 'Дублировать (Ctrl+D)', () => editor.duplicate()) : undefined,
        // Features on trial (src/labs), while they're switched on.
        // A group (a frame, not a timeline, nor a component's copy): an arrow folding it into a bar, or
        // unfolding it.
        fold: group ? <button className="ib" title={group.fold ? 'Развернуть фрейм' : 'Свернуть фрейм'} aria-label={group.fold ? 'Развернуть фрейм' : 'Свернуть фрейм'}
          onClick={() => editor.setFolded(group.id, !group.fold)}><PanelIcon name={group.fold ? 'arrow-right' : 'arrow-left'} /></button> : undefined,
        grouped: !labs.groups ? undefined : oneGroup ? (
          <div className="sw-group group-count">
            <span>{objects(items.length)}</span>
            {btn('expand-m', 'Разгруппировать (Ctrl+Shift+G)', () => editor.ungroup())}
          </div>
        ) : items.filter((i) => !i.host).length > 1 ? btn('collapse-m', 'Сгруппировать (Ctrl+G)', () => editor.group()) : undefined,
        // (Shapes with no typing in them, «Без текста»: no text to set.)
        text: onText ? <button className="ib" title="Текст и шрифт" aria-label="Текст и шрифт" disabled={noText} onClick={onText}><PanelIcon name="text" /></button> : undefined,
        // Shapes with no typing in them: what's written stays, a double click doesn't open them for typing.
        notext: shapes.length && shapes.length === items.length ? (
          <button className={`ib ${noText ? 'on' : ''}`} title={noText ? 'Разрешить текст' : 'Без текста'} aria-label="Без текста" aria-pressed={noText}
            onClick={() => editor.board.transact(() => shapes.forEach((s) => editor.board.update(s.id, { nt: noText ? undefined : true })))}><PanelIcon name="text-off" /></button>
        ) : undefined,
        // (Several picked: «Авторасположение» in the alignment's menu, below, while that's on.)
        tidy: labs.tidy && items.length > 1 && !labs.align ? <TidyButton editor={editor} />
          : labs.tidy && items.length === 1 && items[0]?.type === 'mind' && editor.board.list().some((i) => i.parent === items[0].id) ? <TidyButton editor={editor} mind={items[0].id} /> : undefined,
        align: labs.align && items.length > 1 ? <AlignButton editor={editor} tidy={labs.tidy} /> : undefined,
        lock: labs.lock && items.length > 0 ? <LockButton editor={editor} items={items} /> : undefined,
        react: labs.reactions && items.length > 0 ? <ReactButton editor={editor} items={items} /> : undefined,
        trash: btn('trashcan', 'Удалить (Del)', () => editor.deleteSelection()),
      }, selectionRoom() - (labs.contextMenu ? MENU_BUTTON : 0), over && down ? 'below' : 'above')}
      {/* The right click's menu, always at the right end ("Меню по правому клику", src/labs). */}
      {labs.contextMenu && <ItemMenuButton className="ib" />}
    </div>
  );
}
