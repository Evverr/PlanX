import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { Editor } from '../editor/editor';
import { hitItem } from '../canvas/geometry';
import { Glyph } from '../ui/glyphs';
import { labOn } from './labs';

/**
 * "Меню по правому клику": a right click on the board picks what's under it (unless it's picked
 * already) and opens a menu there, as the board menu looks: copy, delete, move down or up, make a
 * component of it. Esc, a press elsewhere or a scroll closes it.
 */
export function ContextMenu({ editor, onToast }: { editor: Editor; onToast: (text: string) => void }) {
  const [at, setAt] = useState<{ x: number; y: number } | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // On the window: the editor gets its canvas after this has run.
    const open = (e: MouseEvent) => {
      const canvas = editor.canvas;
      if (!canvas || e.target !== canvas || !labOn('contextMenu')) return;
      e.preventDefault();
      const r = canvas.getBoundingClientRect(), w = editor.toWorld(e.clientX - r.left, e.clientY - r.top);
      const hit = hitItem(editor.shown(), w, editor.cam.z);
      // What's in an instance is picked with it, as a click would.
      const id = hit ? (hit.host && !editor.selection.has(hit.id) ? hit.host : hit.id) : null;
      if (id && !editor.selection.has(id)) editor.setSelection([id]);
      if (!editor.selection.size) { setAt(null); return; }
      editor.stopEditing();
      setAt({ x: e.clientX, y: e.clientY });
    };
    window.addEventListener('contextmenu', open);
    return () => window.removeEventListener('contextmenu', open);
  }, [editor]);

  useEffect(() => {
    if (!at) return;
    const away = (e: Event) => { if (!ref.current?.contains(e.target as Node)) setAt(null); };
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') setAt(null); };
    window.addEventListener('pointerdown', away, true);
    window.addEventListener('wheel', away, true);
    window.addEventListener('keydown', key);
    return () => { window.removeEventListener('pointerdown', away, true); window.removeEventListener('wheel', away, true); window.removeEventListener('keydown', key); };
  }, [at]);

  // Kept on the screen: to the left of the pointer, or above it, where it would run off.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || !at) return;
    el.style.left = `${Math.max(8, at.x + el.offsetWidth > innerWidth - 8 ? at.x - el.offsetWidth : at.x)}px`;
    el.style.top = `${Math.max(8, at.y + el.offsetHeight > innerHeight - 8 ? at.y - el.offsetHeight : at.y)}px`;
  }, [at]);

  if (!at) return null;
  const run = (fn: () => void) => () => { fn(); setAt(null); };
  const row = (icon: string, label: string, fn: () => void) => (
    <div className="menu-item">
      <button className="menu-row" role="menuitem" onClick={run(fn)}>
        <Glyph id={icon} className="menu-icon" />
        <span>{label}</span>
      </button>
    </div>
  );
  return (
    <div ref={ref} className="board-menu context-menu" role="menu" aria-label="Действия с выделенным" onContextMenu={(e) => e.preventDefault()}>
      {row('copy', 'Скопировать', () => { if (editor.copy()) onToast('Скопировано. Вставить: Ctrl+V'); })}
      {row('arrow-top-l', 'Переместить вверх', () => editor.bringToFront())}
      {row('arrow-down-l', 'Переместить вниз', () => editor.sendToBack())}
      {row('maximize', 'Сделать компонентом', () => editor.makeComponent())}
      <div className="menu-line" />
      {row('trashcan-l', 'Удалить', () => editor.deleteSelection())}
    </div>
  );
}
