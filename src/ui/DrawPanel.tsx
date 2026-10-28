import { useState } from 'react';
import { DRAW_TOOLS, INK_SIZES, type Editor, type Pens, type PenTool, type Tool } from '../editor/editor';
import { INK_COLORS } from '../model/types';
import { PanelIcon, type PanelIconName } from './PanelIcon';
import { useSortable } from './sortable';
import { ColorPicker } from './ColorPicker';

const PENS: Array<[Tool, PanelIconName, string]> = [
  ['pen', 'pen', 'Ручка (P)'],
  ['marker', 'highlighter', 'Маркер (M)'],
  ['eraser', 'eraser', 'Ластик (E)'],
];

const swatch = (color: string) => (color.startsWith('#') ? color : INK_COLORS[color] || 'var(--ink)');
/** Preset dots grow with the line width, within the 30px button. */
const dot = (tool: PenTool, size: number) => Math.round(4 + (size / INK_SIZES[tool][INK_SIZES[tool].length - 1]) * 18);

/** Drawing tools next to the tool rail, as in Miro: pen, highlighter, eraser, then the pen's three presets.
 *  Clicking the preset in use opens its colours and widths. */
export function DrawPanel({ editor, tool, pens }: { editor: Editor; tool: Tool; pens: Pens }) {
  const [editing, setEditing] = useState(false);
  const [picking, setPicking] = useState(false);
  // Pen, highlighter and eraser can be rearranged by holding them; the presets stay put.
  const sort = useSortable('planx-order-draw', PENS.map(([t]) => t), 'y');
  const pen = tool === 'pen' || tool === 'marker' ? tool : null;
  const set = pen ? pens[pen] : null;
  return (
    <div ref={sort.ref as React.RefObject<HTMLDivElement>} className={`draw-panel sortable ${sort.sorting ? 'sorting' : ''}`} role="toolbar" aria-label="Рисование"
      {...sort.container}>
      {sort.render(Object.fromEntries(PENS.map(([t, icon, label]) => [t, (
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
              <i style={{ background: swatch(p.color), width: dot(pen, p.size), height: dot(pen, p.size), opacity: pen === 'marker' ? 0.6 : 1 }} />
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
              <input type="range" min={0} max={100} aria-label="Прозрачность, %" value={Math.round((set.presets[set.active].op ?? 1) * 100)}
                style={{ '--p': `${Math.round((set.presets[set.active].op ?? 1) * 100)}%` } as React.CSSProperties}
                onChange={(e) => editor.setPenStyle(pen, set.active, { op: Number(e.target.value) >= 100 ? undefined : Number(e.target.value) / 100 })} />
              <div className="ink-sizes">
                {INK_SIZES[pen].map((s) => (
                  <button key={s} className={`ink-size ${set.presets[set.active].size === s ? 'on' : ''}`} aria-label={`Толщина ${s}`}
                    onClick={() => editor.setPenStyle(pen, set.active, { size: s })}>
                    <i style={{ width: dot(pen, s), height: dot(pen, s) }} />
                  </button>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export const isDrawTool = (t: Tool) => DRAW_TOOLS.includes(t);
