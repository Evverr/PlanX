import { useLayoutEffect, useRef } from 'react';
import type { Tool } from '../editor/editor';
import { Glyph } from '../ui/glyphs';

/** The objects there are ("Объекты"): their tool, icon and name. */
export const OBJECTS: Array<[Tool, string, string]> = [['timeline', 'timeline', 'Таймлайн']];

/**
 * "Объекты": the menu its rail button opens when held, beside it, as the board menu looks. Picking
 * one takes its tool, to put it on the board with a click.
 */
export function ObjectsMenu({ tool, onPick }: { tool: Tool; onPick: (t: Tool) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  // Level with its button, 12 clear of the rail (on whichever side it stands).
  useLayoutEffect(() => {
    const el = ref.current, button = document.querySelector('.tools [data-key="objects"]')?.getBoundingClientRect();
    const rail = document.querySelector('.tools')?.getBoundingClientRect();
    if (!el || !button || !rail) return;
    el.style.top = `${Math.min(button.top, innerHeight - el.offsetHeight - 12)}px`;
    el.style.left = rail.left < innerWidth / 2 ? `${rail.right + 12}px` : `${rail.left - 12 - el.offsetWidth}px`;
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
    </div>
  );
}
