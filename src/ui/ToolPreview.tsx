import type { Tool } from '../editor/editor';
import { polyPoints } from '../canvas/geometry';
import { DEFAULTS, FILLS, type Item, type PolyShape } from '../model/types';
import { colsOf, newTable, rowsOf } from '../model/table';

/** Longest side of a preview on screen: what it makes at the current zoom, but never bigger than this. */
const MAX_PX = 180;
const POLYS = ['triangle', 'rhombus', 'pentagon', 'star'];

/** What a rail tool would put on the board, drawn small: shown under the pointer while the tool is
 *  dragged off the rail. Null for tools that make nothing to preview. */
export function ToolPreview({ tool, zoom }: { tool: Tool; zoom: number }) {
  const type = POLYS.includes(tool) ? 'polygon' : tool;
  const d = DEFAULTS[type as Item['type']] as Partial<Item> | undefined;
  if (!d || !['sticky', 'text', 'task', 'table', 'frame', 'rect', 'ellipse', 'polygon', 'mind'].includes(type)) return null;
  const k = Math.min(zoom, MAX_PX / Math.max(d.w!, d.h!)), w = d.w! * k, h = d.h! * k;
  switch (type) {
    case 'sticky':
      return <i className="tp-sticky" style={{ width: w, height: h, background: FILLS.yellow }} />;
    case 'text':
      return <span className="tp-text" style={{ fontSize: Math.max(11, 20 * k) }}>Текст</span>;
    case 'task':
      return (
        <span className="tp-task" style={{ width: w, height: h, fontSize: Math.max(10, 16 * k), background: FILLS[d.color ?? 'blue'] }}>
          <i style={{ width: 20, height: 20 }} />Задача
        </span>
      );
    case 'mind':
      // The central topic as it's drawn: the blue, corners of 14, a third taller than its text with 15
      // above and below, 32 to each side.
      return <span className="tp-mind" style={{ fontSize: Math.max(11, 18 * k), lineHeight: 1.4, padding: `${((18 * 1.4 + 30) * 4 / 3 - 18 * 1.4) * k / 2}px ${32 * k}px`, borderRadius: 14 * k }}>Центральная тема</span>;
    case 'frame':
      return <span className="tp-frame" style={{ width: w, height: h }}><b style={{ fontSize: Math.max(10, 15 * k) }}>Фрейм</b></span>;
    case 'table': {
      const t = { ...newTable(), x: 0, y: 0 } as Item;
      let x = 0, y = 0;
      return (
        <svg className="tp-svg" width={w} height={h} viewBox={`0 0 ${t.w} ${t.h}`}>
          <rect x="0.5" y="0.5" width={t.w - 1} height={t.h - 1} />
          {colsOf(t).slice(0, -1).map((c, i) => { x += c; return <line key={`c${i}`} x1={x} y1="0" x2={x} y2={t.h} />; })}
          {rowsOf(t).slice(0, -1).map((r, i) => { y += r; return <line key={`r${i}`} x1="0" y1={y} x2={t.w} y2={y} />; })}
        </svg>
      );
    }
    default: {
      // Figures: their outline in their usual colour.
      const fill = FILLS[d.color ?? 'blue'];
      return (
        <svg className="tp-svg shape" width={w} height={h} viewBox={`-2 -2 ${d.w! + 4} ${d.h! + 4}`} style={{ fill }}>
          {type === 'rect' && <rect width={d.w} height={d.h} rx="8" />}
          {type === 'ellipse' && <ellipse cx={d.w! / 2} cy={d.h! / 2} rx={d.w! / 2} ry={d.h! / 2} />}
          {type === 'polygon' && <polygon points={polyPoints({ x: 0, y: 0, w: d.w!, h: d.h!, shape: tool as PolyShape } as Item).map((p) => `${p.x},${p.y}`).join(' ')} />}
        </svg>
      );
    }
  }
}
