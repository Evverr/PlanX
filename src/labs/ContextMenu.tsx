import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { Editor } from '../editor/editor';
import type { Point } from '../canvas/geometry';
import { hitItem } from '../canvas/geometry';
import { linkInTextAt } from '../canvas/renderer';
import { FILLS, type Item } from '../model/types';
import { Glyph } from '../ui/glyphs';
import { ColorPicker } from '../ui/ColorPicker';
import { labOn } from './labs';

/** Where the menu opened (on the screen and the board), what it's for, and whether it shows the
 *  picked item's parameters in place of its rows. */
interface Open { x: number; y: number; w: Point; url: string | null; board: boolean; params: boolean }

/**
 * "Меню по правому клику": a right click on the board opens a menu there, as the board menu looks.
 * On the empty board: zoom to 100%, and paste (with something copied). On an item (picked by it,
 * unless it's picked already): copy, move down or up, make a component of it, delete; on a link,
 * the way to it first; for a rectangle, its parameters (colour, rounding) in a popup in its place.
 * Esc, a press elsewhere or a scroll closes it.
 */
export function ContextMenu({ editor, onToast }: { editor: Editor; onToast: (text: string) => void }) {
  const [at, setAt] = useState<Open | null>(null);
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
      if (!id) editor.setSelection([]);
      editor.stopEditing();
      // On a link (in text, or the item's own): the way to it first.
      const url = labOn('textLink') ? linkInTextAt(w) ?? hit?.url ?? null : null;
      setAt({ x: e.clientX, y: e.clientY, w, url, board: !id, params: false });
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

  // Kept on the screen: where it would run off the right, it opens to the left of the pointer; off
  // the bottom, it moves up to the window's edge.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || !at) return;
    el.style.left = `${Math.max(8, at.x + el.offsetWidth > innerWidth - 8 ? at.x - el.offsetWidth : at.x)}px`;
    el.style.top = `${Math.max(8, Math.min(at.y, innerHeight - 8 - el.offsetHeight))}px`;
  });

  if (!at) return null;
  const run = (fn: () => void) => () => { fn(); setAt(null); };
  const row = (icon: string, label: string, fn: () => void) => (
    <div className="menu-item">
      <button className="menu-row" role="menuitem" onClick={fn}>
        <Glyph id={icon} className="menu-icon" />
        <span>{label}</span>
      </button>
    </div>
  );
  const picked = editor.selectedItems(), rect = picked.length === 1 && picked[0].type === 'rect' ? picked[0] : null;
  if (at.params && rect) {
    return (
      <div ref={ref} className="board-menu context-menu params-pop" role="dialog" aria-label="Параметры" onContextMenu={(e) => e.preventDefault()}>
        <RectParams editor={editor} it={rect} />
      </div>
    );
  }
  return (
    <div ref={ref} className="board-menu context-menu" role="menu" aria-label={at.board ? 'Доска' : 'Действия с выделенным'} onContextMenu={(e) => e.preventDefault()}>
      {at.board ? <>
        {row('glasses', 'Масштаб 100%', run(() => {
          // The point clicked stays where it is.
          const r = editor.canvas!.getBoundingClientRect(), sx = at.x - r.left, sy = at.y - r.top;
          editor.zoomAt(sx, sy, 1 / editor.cam.z);
        }))}
        {editor.hasClipboard() && row('note', 'Вставить', run(() => editor.paste(0, at.w)))}
      </> : <>
        {at.url && <>
          {row('link', 'Перейти по ссылке', run(() => window.open(at.url!, '_blank', 'noopener')))}
          <div className="menu-line" />
        </>}
        {rect && <>
          {row('sign', 'Параметры', () => setAt({ ...at, params: true }))}
          <div className="menu-line" />
        </>}
        {row('copy', 'Скопировать', run(() => { if (editor.copy()) onToast('Скопировано. Вставить: Ctrl+V или правым кликом'); }))}
        {row('arrow-top-l', 'Переместить вверх', run(() => editor.bringToFront()))}
        {row('arrow-down-l', 'Переместить вниз', run(() => editor.sendToBack()))}
        {row('maximize', 'Сделать компонентом', run(() => editor.makeComponent()))}
        <div className="menu-line" />
        {row('trashcan-l', 'Удалить', run(() => editor.deleteSelection()))}
      </>}
    </div>
  );
}

/** A rectangle's parameters: its colour (any, too) on top, its corners' rounding under a line. */
function RectParams({ editor, it }: { editor: Editor; it: Item }) {
  const [picking, setPicking] = useState(false);
  const [, redraw] = useState(0);
  const now = editor.board.get(it.id) ?? it, custom = now.color?.startsWith('#') ? now.color : null;
  const set = (patch: Partial<Item>) => { editor.board.update(it.id, patch); redraw((n) => n + 1); };
  return (
    <>
      <div className="params-title">Цвет</div>
      <div className="params-colors">
        {Object.entries(FILLS).map(([k, v]) => (
          <button key={k} className={`sw ${k === 'none' ? 'none' : ''} ${now.color === k ? 'on' : ''}`} style={{ background: v }} aria-label={`Цвет ${k}`}
            onClick={() => set({ color: k })} />
        ))}
        <div className="cp-wrap">
          <button className={`sw custom ${custom || picking ? 'on' : ''}`} style={custom ? { background: custom } : undefined} title="Свой цвет" aria-label="Свой цвет"
            onClick={() => setPicking(!picking)} />
          {picking && <ColorPicker value={custom ?? FILLS.blue} onChange={(c) => set({ color: c })} onStart={() => editor.beginChange()} onEnd={() => editor.endChange()} />}
        </div>
      </div>
      <div className="menu-line" />
      <div className="menu-item">
        <div className="menu-row">
          <Glyph id="collapse-l" className="menu-icon" />
          <span>Скругление</span>
          <span className="menu-input">
            <input type="number" min={0} max={200} step={1} value={now.rad ?? 8} aria-label="Скругление углов"
              onChange={(e) => set({ rad: Math.max(0, Math.min(200, Number(e.target.value) || 0)) })} />
            <i>px</i>
          </span>
        </div>
      </div>
    </>
  );
}
