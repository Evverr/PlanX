import { useState } from 'react';
import { DRAW_TOOLS, INK_RANGE, type Editor, type Pens, type PenTool, type Tool } from '../editor/editor';
import { INK_COLORS, MARKER_OPACITY } from '../model/types';
import { useLabs } from '../labs/labs';
import { ERASER_SIZES, eraserStyle, setEraserStyle, subscribeEraser } from '../labs/eraseArea';
import { useSyncExternalStore } from 'react';
import { PanelIcon, type PanelIconName } from './PanelIcon';
import { useSortable } from './sortable';
import { ColorPicker } from './ColorPicker';

const PENS: Array<[Tool, PanelIconName, string]> = [
  ['pen', 'pen', 'Ручка (P)'],
  ['marker', 'highlighter', 'Маркер (M)'],
  ['eraser', 'eraser', 'Ластик (E)'],
  // "Перо" (src/labs), while it's switched on.
  ['nib', 'pen-nib', 'Перо: клики — вершины, клик по первой — фигура, двойной клик или Enter — линия'],
];

/** How opaque a pen's lines come out unless set otherwise. */
export const penOpacity = (tool: PenTool) => (tool === 'marker' ? MARKER_OPACITY : 1);

const swatch = (color: string) => (color.startsWith('#') ? color : INK_COLORS[color] || 'var(--ink)');
/** Preset dots grow with the line width, within the 30px button. */
const dot = (tool: PenTool, size: number) => Math.round(4 + (Math.min(size, INK_RANGE[tool][1]) / INK_RANGE[tool][1]) * 18);

/** A slider under its name, with how much it's at. */
function Slider({ label, value, min, max, unit, onChange }: { label: string; value: number; min: number; max: number; unit: string; onChange: (v: number) => void }) {
  const p = Math.round(((value - min) / (max - min)) * 100);
  return (
    <label className="ink-slider">
      <span>{label}<b>{value}{unit}</b></span>
      <input type="range" min={min} max={max} value={value} aria-label={label} style={{ '--p': `${p}%` } as React.CSSProperties}
        onChange={(e) => onChange(Number(e.target.value))} />
    </label>
  );
}

/** Drawing tools next to the tool rail, as in Miro: pen, highlighter, eraser, then the pen's three presets.
 *  Clicking the preset in use opens its colours and widths. */
export function DrawPanel({ editor, tool, pens }: { editor: Editor; tool: Tool; pens: Pens }) {
  const [editing, setEditing] = useState(false);
  const [picking, setPicking] = useState(false);
  // Pen, highlighter and eraser can be rearranged by holding them; the presets stay put.
  const labs = useLabs(), pens0 = PENS.filter(([t]) => t !== 'nib' || labs.nib);
  const sort = useSortable('planx-order-draw', pens0.map(([t]) => t), 'y');
  const pen = tool === 'pen' || tool === 'marker' ? tool : null;
  const set = pen ? pens[pen] : null;
  // "Ластик кружком" (src/labs): its size, or whole lines.
  const eraser = useSyncExternalStore(subscribeEraser, eraserStyle);
  const erasing = tool === 'eraser' && labs.softEraser;
  return (
    <div ref={sort.ref as React.RefObject<HTMLDivElement>} className={`draw-panel sortable ${sort.sorting ? 'sorting' : ''}`} role="toolbar" aria-label="Рисование"
      {...sort.container}>
      {sort.render(Object.fromEntries(pens0.map(([t, icon, label]) => [t, (
        <button className={`fb ${tool === t ? 'on' : ''}`} title={label} aria-label={label} aria-pressed={tool === t}
          onClick={() => { setEditing(false); editor.setTool(t); }}>
          <PanelIcon name={icon} />
        </button>
      )])))}
      {pen && set && (
        <>
          <div className="tsep" />
          {set.presets.map((p, i) => (
            <button key={i} className={`ink-preset ${set.active === i ? 'on' : ''}`} title="Цвет и толщина"
              aria-label={`Набор ${i + 1}`} aria-pressed={set.active === i}
              onClick={() => { if (set.active === i) setEditing(!editing); else { setEditing(false); editor.pickPen(pen, i); } }}>
              <i style={{ background: swatch(p.color), width: dot(pen, p.size), height: dot(pen, p.size), opacity: p.op ?? penOpacity(pen) }} />
            </button>
          ))}
          {editing && (
            <div className="ink-style" role="dialog" aria-label="Цвет и толщина" data-nosort>
              <div className="ink-colors">
                {Object.keys(INK_COLORS).map((c) => (
                  <button key={c} className={`sw ${set.presets[set.active].color === c ? 'on' : ''}`} style={{ background: swatch(c) }}
                    aria-label={`Цвет ${c}`} onClick={() => editor.setPenStyle(pen, set.active, { color: c })} />
                ))}
                {/* Any colour, and how see-through the lines come out. */}
                <div className="cp-wrap">
                  <button className={`sw custom ${set.presets[set.active].color.startsWith('#') || picking ? 'on' : ''}`} title="Свой цвет" aria-label="Свой цвет"
                    style={set.presets[set.active].color.startsWith('#') ? { background: set.presets[set.active].color } : undefined} onClick={() => setPicking(!picking)} />
                  {picking && <ColorPicker value={swatch(set.presets[set.active].color).startsWith('#') ? swatch(set.presets[set.active].color) : '#1C1F26'}
                    onChange={(c) => editor.setPenStyle(pen, set.active, { color: c })} />}
                </div>
              </div>
              {/* How opaque its lines really come out (a highlighter's see-through by default), and how thick; kept for each set. */}
              <Slider label="Прозрачность" unit="%" min={0} max={100} value={Math.round((set.presets[set.active].op ?? penOpacity(pen)) * 100)}
                onChange={(n) => { const v = n / 100; editor.setPenStyle(pen, set.active, { op: v === penOpacity(pen) ? undefined : v }); }} />
              <Slider label="Толщина" unit=" px" min={INK_RANGE[pen][0]} max={INK_RANGE[pen][1]} value={set.presets[set.active].size}
                onChange={(v) => editor.setPenStyle(pen, set.active, { size: v })} />
            </div>
          )}
        </>
      )}
      {erasing && (
        <>
          <div className="tsep" />
          <button className="ink-preset on" title="Размер ластика" aria-label="Размер ластика" onClick={() => setEditing(!editing)}>
            <i style={{ background: 'var(--ink)', width: Math.round(4 + (eraser.size / ERASER_SIZES[1]) * 18), height: Math.round(4 + (eraser.size / ERASER_SIZES[1]) * 18), opacity: eraser.whole ? 0.3 : 1 }} />
          </button>
          {editing && (
            <div className="ink-style" role="dialog" aria-label="Ластик" data-nosort>
              <Slider label="Размер" unit=" px" min={ERASER_SIZES[0]} max={ERASER_SIZES[1]} value={eraser.size} onChange={(v) => setEraserStyle({ size: v })} />
              <label className="ink-check"><input type="checkbox" checked={!!eraser.whole} onChange={(e) => setEraserStyle({ whole: e.target.checked || undefined })} />Стирать линию целиком</label>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export const isDrawTool = (t: Tool) => DRAW_TOOLS.includes(t);
