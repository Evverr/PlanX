import { useLayoutEffect, useRef } from 'react';
import type { Editor, Tool } from '../editor/editor';
import { Glyph } from '../ui/glyphs';

/** The objects there are ("Объекты"): their tool, icon and name. */
export const OBJECTS: Array<[Tool, string, string]> = [['timeline', 'timeline', 'Таймлайн']];

/**
 * "Объекты": the menu its rail button opens, beside it, as the board menu looks. Picking one takes
 * its tool, to put it on the board with a click. Under a line, "Мои объекты": the board's components
 * made its own objects (by a component's arrow), each put on the board as an instance by a click (in
 * the screen's middle) or dragged off the menu onto it.
 */
export function ObjectsMenu({ editor, tool, onPick, onClose }: { editor: Editor; tool: Tool; onPick: (t: Tool) => void; onClose: () => void }) {
  const mine = editor.objects();
  // One of "Мои объекты" pressed: let go where it was, a click; dragged out over the board, put there.
  const press = (id: string, e: React.PointerEvent) => {
    const from = { x: e.clientX, y: e.clientY };
    const up = (ev: PointerEvent) => {
      window.removeEventListener('pointerup', up);
      const canvas = editor.canvas, r = canvas?.getBoundingClientRect();
      const far = Math.hypot(ev.clientX - from.x, ev.clientY - from.y) > 5;
      if (far && !(canvas && document.elementFromPoint(ev.clientX, ev.clientY) === canvas)) return;
      editor.addObject(id, far && r ? { x: ev.clientX - r.left, y: ev.clientY - r.top } : undefined);
      onClose();
    };
    window.addEventListener('pointerup', up);
  };
  const ref = useRef<HTMLDivElement>(null);
  // 12 over its button's top, 9 clear of the rail (on whichever side it stands).
  useLayoutEffect(() => {
    const el = ref.current, button = document.querySelector('.tools [data-key="objects"]')?.getBoundingClientRect();
    const rail = document.querySelector('.tools')?.getBoundingClientRect();
    if (!el || !button || !rail) return;
    el.style.top = `${Math.max(8, Math.min(button.top - 12, innerHeight - el.offsetHeight - 12))}px`;
    el.style.left = rail.left < innerWidth / 2 ? `${rail.right + 9}px` : `${rail.left - 9 - el.offsetWidth}px`;
  });
  return (
    <div ref={ref} className="board-menu objects-menu" role="menu" aria-label="Объекты">
      {OBJECTS.map(([t, icon, label]) => (
        <div key={t} className="menu-item">
          <button className={`menu-row ${tool === t ? 'on' : ''}`} role="menuitem" onClick={() => onPick(t)}>
            <Glyph id={icon} className="menu-icon" />
            <span>{label}</span>
          </button>
        </div>
      ))}
      {mine.length > 0 && <>
        <div className="menu-line" />
        <div className="menu-caption">Мои объекты</div>
        {mine.map((c) => (
          <div key={c.id} className="menu-item">
            <button className="menu-row" role="menuitem" title="Клик — в середину экрана, или перетащите на доску" onPointerDown={(e) => press(c.id, e)}>
              <Glyph id="maximize" className="menu-icon" />
              <span>{c.text || 'Объект'}</span>
            </button>
          </div>
        ))}
      </>}
    </div>
  );
}
