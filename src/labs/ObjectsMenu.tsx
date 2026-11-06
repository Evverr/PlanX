import { useLayoutEffect, useRef, useState } from 'react';
import type { Editor, Tool } from '../editor/editor';
import { Glyph } from '../ui/glyphs';
import { dropMyObject, myObjects } from './myObjects';

/** The objects there are ("Объекты"): their tool, icon and name. */
export const OBJECTS: Array<[Tool, string, string]> = [['timeline', 'timeline', 'Таймлайн']];

/**
 * "Объекты": the menu its rail button opens, beside it, as the board menu looks. Picking one takes
 * its tool, to put it on the board with a click, or it's dragged off onto the board. Under a line, two further levels open on hover:
 * "Мои объекты", the components made objects in this browser (kept here, for any board, see
 * myObjects.ts), and "Объекты документа", the board's own ones that aren't among them (made objects
 * here, by anyone), each with a button to keep it in "Мои объекты" too. One is put on the board as
 * an instance by a click (in the screen's middle) or dragged off onto it, as the rail's buttons are;
 * its cross takes it off its list, once said yes.
 */
export function ObjectsMenu({ editor, tool, onPick, onClose }: { editor: Editor; tool: Tool; onPick: (t: Tool) => void; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState<'mine' | 'doc' | null>(null);
  const [, redraw] = useState(0);
  const mine = myObjects(), kept = new Set(mine.map((o) => o.id));
  const doc = editor.objects().filter((c) => !c.lib || !kept.has(c.lib));
  // 12 over its button's top, 9 clear of the rail (on whichever side it stands).
  useLayoutEffect(() => {
    const el = ref.current, button = document.querySelector('.tools [data-key="objects"]')?.getBoundingClientRect();
    const rail = document.querySelector('.tools')?.getBoundingClientRect();
    if (!el || !button || !rail) return;
    el.style.top = `${Math.max(8, Math.min(button.top - 12, innerHeight - el.offsetHeight - 12))}px`;
    el.style.left = rail.left < innerWidth / 2 ? `${rail.right + 9}px` : `${rail.left - 9 - el.offsetWidth}px`;
  });
  const leftward = (ref.current?.getBoundingClientRect().left ?? 0) > innerWidth / 2;
  // One of them pressed: let go where it was, a click (in the screen's middle); dragged out, its icon
  // goes along under the pointer, and let go over the board it's put there.
  const press = (put: (at?: { x: number; y: number }) => void, e: React.PointerEvent) => {
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
      put(dragged && r ? { x: ev.clientX - r.left, y: ev.clientY - r.top } : undefined);
      onClose();
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };
  const ask = (text: string, ok: () => void) => window.dispatchEvent(new CustomEvent('planx:confirm', { detail: {
    text, action: 'Удалить', ok: () => { ok(); redraw((n) => n + 1); },
  } }));
  // A row of a further level: its name, and its buttons at the end.
  const row = (key: string, name: string, put: (at?: { x: number; y: number }) => void, remove: () => void, take?: () => void) => (
    <div key={key} className="menu-item">
      <button className="menu-row" role="menuitem" title="Клик — в середину экрана, или перетащите на доску" onPointerDown={(e) => press(put, e)}>
        <Glyph id="component" className="menu-icon" />
        <span>{name}</span>
        {take && <span className="menu-x menu-take" role="button" aria-label={`«${name}» в «Мои объекты»`} title="В «Мои объекты»: на любую доску"
          onPointerDown={(e) => e.stopPropagation()} onClick={(e) => { e.stopPropagation(); take(); redraw((n) => n + 1); }}>+</span>}
        <span className="menu-x" role="button" aria-label={`Удалить «${name}» из списка`} title="Убрать из списка"
          onPointerDown={(e) => e.stopPropagation()} onClick={(e) => { e.stopPropagation(); remove(); }}>×</span>
      </button>
    </div>
  );
  const level = (which: 'mine' | 'doc', label: string, rows: React.ReactNode[]) => rows.length > 0 && (
    <div className="menu-item" onPointerEnter={() => setOpen(which)}>
      <button className="menu-row" role="menuitem" aria-haspopup aria-expanded={open === which} onClick={() => setOpen(which)}>
        <Glyph id="package" className="menu-icon" />
        <span>{label}</span>
        <i className="menu-more" aria-hidden="true" />
      </button>
      {open === which && (
        <div className={`board-menu sub objects-mine ${leftward ? 'leftward' : ''}`} role="menu" aria-label={label}>{rows}</div>
      )}
    </div>
  );
  return (
    <div ref={ref} className="board-menu objects-menu" role="menu" aria-label="Объекты">
      {OBJECTS.map(([t, icon, label]) => (
        <div key={t} className="menu-item" onPointerEnter={() => setOpen(null)}>
          <button className={`menu-row ${tool === t ? 'on' : ''}`} role="menuitem" title="Клик — выбрать, или перетащите на доску"
            onPointerDown={(e) => press((at) => (at ? editor.dropItem(t, at) : onPick(t)), e)}>
            <Glyph id={icon} className="menu-icon" />
            <span>{label}</span>
          </button>
        </div>
      ))}
      {(mine.length > 0 || doc.length > 0) && <div className="menu-line" />}
      {level('mine', 'Мои объекты', mine.map((o) => row(o.id, o.name, (at) => editor.placeMyObject(o.id, at),
        () => ask(`Удалить «${o.name}» из «Мои объекты»? На досках его копии останутся.`, () => dropMyObject(o.id)))))}
      {level('doc', 'Объекты документа', doc.map((c) => row(c.id, c.text || 'Объект', (at) => editor.addObject(c.id, at),
        () => ask(`Удалить «${c.text || 'Объект'}» из объектов этой доски? Его копии на доске останутся.`, () => editor.board.update(c.id, { obj: undefined })),
        () => editor.keepObject(c.id))))}
    </div>
  );
}
