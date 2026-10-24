import { useEffect, useReducer, useRef } from 'react';
import type { Editor } from '../editor/editor';
import type { Item } from '../model/types';
import { boundsOf, type Rect } from '../canvas/geometry';

const W = 240, H = 160, PAD = 10;

/** Scale and offset that fit a board rectangle into the map. */
interface Fit { s: number; ox: number; oy: number }

function fitInto(r: Rect): Fit {
  const s = Math.min((W - PAD * 2) / r.w, (H - PAD * 2) / r.h);
  return { s, ox: (W - r.w * s) / 2 - r.x * s, oy: (H - r.h * s) / 2 - r.y * s };
}

/** The whole board in miniature with a frame around what's on screen; click or drag on it to move there. */
export function Minimap({ editor, items, docked, onClose }: { editor: Editor; items: Item[]; docked: boolean; onClose: () => void }) {
  // The frame follows the window size too, and the editor doesn't announce resizes.
  const [, redraw] = useReducer((n: number) => n + 1, 0);
  useEffect(() => {
    window.addEventListener('resize', redraw);
    return () => window.removeEventListener('resize', redraw);
  }, []);

  // The wheel works over the map as over the board, zooming about the middle of the screen
  // (React's wheel listeners are passive and can't stop the page from scrolling).
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = root.current!;
    const wheel = (e: WheelEvent) => editor.wheel(e, { x: innerWidth / 2, y: innerHeight / 2 });
    el.addEventListener('wheel', wheel, { passive: false });
    return () => el.removeEventListener('wheel', wheel);
  }, [editor]);

  // A click anywhere else closes the map; its own button toggles it as before.
  useEffect(() => {
    const away = (e: PointerEvent) => {
      const t = e.target as Element;
      if (!root.current?.contains(t) && !t.closest?.('[data-minimap-toggle]')) onClose();
    };
    window.addEventListener('pointerdown', away);
    return () => window.removeEventListener('pointerdown', away);
  }, [onClose]);

  const view = editor.viewRect();
  const b = boundsOf(items) ?? view;
  const x1 = Math.min(b.x, view.x), y1 = Math.min(b.y, view.y);
  const all = { x: x1, y: y1, w: Math.max(b.x + b.w, view.x + view.w) - x1, h: Math.max(b.y + b.h, view.y + view.h) - y1 };
  // While dragging the map holds still, otherwise it would rescale under the pointer as the frame moves.
  const drag = useRef<Fit | null>(null);
  const { s, ox, oy } = drag.current ?? fitInto(all);

  const moveTo = (e: React.PointerEvent<SVGSVGElement>, f: Fit) => {
    const r = e.currentTarget.getBoundingClientRect();
    editor.centerOn({ x: (e.clientX - r.left - f.ox) / f.s, y: (e.clientY - r.top - f.oy) / f.s });
  };

  return (
    <div ref={root} className={`bar minimap ${docked ? 'docked' : ''}`}>
      <svg viewBox={`0 0 ${W} ${H}`} aria-label="Карта доски"
        onPointerDown={(e) => { drag.current = { s, ox, oy }; e.currentTarget.setPointerCapture(e.pointerId); moveTo(e, drag.current); }}
        onPointerMove={(e) => { if (drag.current) moveTo(e, drag.current); }}
        onPointerUp={() => { drag.current = null; redraw(); }}
        onPointerCancel={() => { drag.current = null; redraw(); }}>
        {items.map((it) => (
          <rect key={it.id} className={it.type === 'frame' ? 'mm-frame' : 'mm-item'}
            x={ox + it.x * s} y={oy + it.y * s} width={Math.max(it.w * s, 1.5)} height={Math.max(it.h * s, 1.5)} />
        ))}
        <rect className="mm-view" rx={4} x={ox + view.x * s} y={oy + view.y * s} width={view.w * s} height={view.h * s} />
      </svg>
    </div>
  );
}
