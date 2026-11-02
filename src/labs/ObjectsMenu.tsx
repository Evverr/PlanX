import { useLayoutEffect, useRef, useState } from 'react';
import type { Editor, Tool } from '../editor/editor';
import { Glyph } from '../ui/glyphs';

/** The objects there are ("Объекты"): their tool, icon and name. */
export const OBJECTS: Array<[Tool, string, string]> = [['timeline', 'timeline', 'Таймлайн']];

/**
 * "Объекты": the menu its rail button opens, beside it, as the board menu looks. Picking one takes
 * its tool, to put it on the board with a click. Under a line, "Мои объекты" opens a further level
 * on hover: the board's components made its own objects (by a component's arrow), each put on the
 * board as an instance by a click (in the screen's middle) or dragged off onto it, as the rail's
 * buttons are; its cross takes it off the list, once said yes.
 */
export function ObjectsMenu({ editor, tool, onPick, onClose }: { editor: Editor; tool: Tool; onPick: (t: Tool) => void; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [, redraw] = useState(0);
  const mine = editor.objects();
  // 12 over its button's top, 9 clear of the rail (on whichever side it stands).
  useLayoutEffect(() => {
    const el = ref.current, button = document.querySelector('.tools [data-key="objects"]')?.getBoundingClientRect();
    const rail = document.querySelector('.tools')?.getBoundingClientRect();
    if (!el || !button || !rail) return;
    el.style.top = `${Math.max(8, Math.min(button.top - 12, innerHeight - el.offsetHeight - 12))}px`;
    el.style.left = rail.left < innerWidth / 2 ? `${rail.right + 9}px` : `${rail.left - 9 - el.offsetWidth}px`;
  });
  const leftward = (ref.current?.getBoundingClientRect().left ?? 0) > innerWidth / 2;
  // One of "Мои объекты" pressed: let go where it was, a click (in the screen's middle); dragged out, its
  // icon goes along under the pointer, and let go over the board it's put there.
  const press = (id: string, e: React.PointerEvent) => {
    if (e.button !== 0) return;
    const from = { x: e.clientX, y: e.clientY }, icon = (e.currentTarget as HTMLElement).querySelector('.menu-icon')?.outerHTML ?? '';
    let ghost: HTMLDivElement | null = null;
    const move = (ev: PointerEvent) => {
      if (!ghost && Math.hypot(ev.clientX - from.x, ev.clientY - from.y) > 5) {
        ghost = document.createElement('div');
        ghost.className = 'tp-icon obj-ghost';
        ghost.innerHTML = icon;
        document.body.appendChild(ghost);
      }
      if (ghost) ghost.style.translate = `${ev.clientX - 22}px ${ev.clientY - 22}px`;
    };
    const up = (ev: PointerEvent) => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      const dragged = !!ghost;
      ghost?.remove();
      const canvas = editor.canvas, r = canvas?.getBoundingClientRect();
      if (dragged && !(canvas && document.elementFromPoint(ev.clientX, ev.clientY) === canvas)) return;
      editor.addObject(id, dragged && r ? { x: ev.clientX - r.left, y: ev.clientY - r.top } : undefined);
      onClose();
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };
  const remove = (id: string, name: string) => {
    window.dispatchEvent(new CustomEvent('planx:confirm', { detail: {
      text: `Удалить «${name}» из «Мои объекты»? Его копии на доске останутся.`, action: 'Удалить',
      ok: () => { editor.board.update(id, { obj: undefined }); redraw((n) => n + 1); },
    } }));
  };
  return (
    <div ref={ref} className="board-menu objects-menu" role="menu" aria-label="Объекты">
      {OBJECTS.map(([t, icon, label]) => (
        <div key={t} className="menu-item" onPointerEnter={() => setOpen(false)}>
          <button className={`menu-row ${tool === t ? 'on' : ''}`} role="menuitem" onClick={() => onPick(t)}>
            <Glyph id={icon} className="menu-icon" />
            <span>{label}</span>
          </button>
        </div>
      ))}
      {mine.length > 0 && <>
        <div className="menu-line" />
        <div className="menu-item" onPointerEnter={() => setOpen(true)}>
          <button className="menu-row" role="menuitem" aria-haspopup aria-expanded={open} onClick={() => setOpen(true)}>
            <Glyph id="component" className="menu-icon" />
            <span>Мои объекты</span>
            <i className="menu-more" aria-hidden="true" />
          </button>
          {open && (
            <div className={`board-menu sub objects-mine ${leftward ? 'leftward' : ''}`} role="menu" aria-label="Мои объекты">
              {mine.map((c) => (
                <div key={c.id} className="menu-item">
                  <button className="menu-row" role="menuitem" title="Клик — в середину экрана, или перетащите на доску" onPointerDown={(e) => press(c.id, e)}>
                    <Glyph id="component" className="menu-icon" />
                    <span>{c.text || 'Объект'}</span>
                    <span className="menu-x" role="button" aria-label={`Удалить «${c.text || 'Объект'}» из объектов`} title="Удалить из объектов"
                      onPointerDown={(e) => e.stopPropagation()} onClick={(e) => { e.stopPropagation(); remove(c.id, c.text || 'Объект'); }}>×</span>
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </>}
    </div>
  );
}
