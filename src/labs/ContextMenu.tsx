import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { Editor } from '../editor/editor';
import type { Point } from '../canvas/geometry';
import { hitItem } from '../canvas/geometry';
import { linkInTextAt } from '../canvas/renderer';
import { COLORABLE, FILLS, ICON_COLORS, INK_COLORS, TEXT_COLORS, type Item } from '../model/types';
import { MIND_PALETTE } from '../model/mind';
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
 * the way to it first; the parameters of each picked (an instance's, of what's in it) in a popup in
 * its place: colour, opacity, rounding.
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
  const params = paramItems(editor);
  if (at.params && params.length) {
    return (
      <div ref={ref} className="board-menu context-menu params-pop" role="dialog" aria-label="Параметры" onContextMenu={(e) => e.preventDefault()}>
        <ParamsList editor={editor} items={params} />
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
        {params.length > 0 && <>
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

/** What each kind of item is called in the parameters' list. */
const NAMES: Partial<Record<Item['type'], string>> = {
  sticky: 'Стикер', text: 'Текст', rect: 'Прямоугольник', ellipse: 'Эллипс', polygon: 'Фигура', task: 'Задача', mind: 'Узел майнд-карты',
  icon: 'Иконка', emoji: 'Смайл', ink: 'Рисунок', image: 'Картинка',
};

/** The items whose parameters the popup lists: the picked, an instance by what's in it. */
export function paramItems(editor: Editor): Item[] {
  const all = editor.board.list();
  return editor.selectedItems().flatMap((it) => (it.inst ? all.filter((c) => c.host === it.id) : [it])).filter((it) => NAMES[it.type]);
}

/** The colours an item picks from, and the field its colour and its opacity go in. */
function paintOf(it: Item): { colors: Record<string, string>; color: 'color' | 'tc' | null; opacity: 'fo' | 'to' } {
  if (it.type === 'text') return { colors: TEXT_COLORS, color: 'tc', opacity: 'to' };
  if (it.type === 'icon') return { colors: ICON_COLORS, color: 'color', opacity: 'fo' };
  if (it.type === 'ink') return { colors: INK_COLORS, color: 'color', opacity: 'fo' };
  if (it.type === 'mind') return { colors: Object.fromEntries(MIND_PALETTE.map((c) => [c, c])), color: 'color', opacity: 'fo' };
  if (COLORABLE.includes(it.type)) return { colors: FILLS, color: 'color', opacity: 'fo' };
  return { colors: {}, color: null, opacity: 'fo' };
}

/** Each item's parameters, one after another under its name, a line between: its colour (any too),
 *  how see-through, and a rectangle's or figure's rounding. */
function ParamsList({ editor, items }: { editor: Editor; items: Item[] }) {
  const [, redraw] = useState(0);
  return (
    <div className="params-list">
      {items.map((it, i) => {
        const now = editor.board.get(it.id) ?? it;
        const set = (patch: Partial<Item>) => { editor.board.update(it.id, patch); redraw((n) => n + 1); };
        const snippet = now.text?.trim() ? ` «${now.text.trim().slice(0, 18)}${now.text.trim().length > 18 ? '…' : ''}»` : '';
        return (
          <div key={it.id} className="params-item">
            {i > 0 && <div className="menu-line" />}
            <div className="params-title">{NAMES[now.type]}{snippet}</div>
            <ItemParams editor={editor} it={now} set={set} />
          </div>
        );
      })}
    </div>
  );
}

function ItemParams({ editor, it, set }: { editor: Editor; it: Item; set: (patch: Partial<Item>) => void }) {
  const [picking, setPicking] = useState(false);
  const paint = paintOf(it), current = paint.color ? it[paint.color] : undefined;
  const custom = current?.startsWith('#') && !paint.colors[current] ? current : null;
  const opacity = it[paint.opacity] ?? 1, pct = Math.round(opacity * 100);
  const rounded = it.type === 'rect' || it.type === 'polygon';
  return (
    <>
      {paint.color && (
        <div className="params-colors">
          {Object.entries(paint.colors).map(([k, v]) => (
            <button key={k} className={`sw ${k === 'none' ? 'none' : ''} ${(current ?? (paint.color === 'tc' ? 'ink' : '')) === k ? 'on' : ''}`} style={{ background: v || 'var(--ink)' }}
              aria-label={`Цвет ${k}`} onClick={() => set({ [paint.color!]: paint.color === 'tc' && k === 'ink' ? undefined : k })} />
          ))}
          <div className="cp-wrap">
            <button className={`sw custom ${custom || picking ? 'on' : ''}`} style={custom ? { background: custom } : undefined} title="Свой цвет" aria-label="Свой цвет"
              onClick={() => setPicking(!picking)} />
            {picking && <ColorPicker value={custom ?? '#3E7BFA'} onChange={(c) => set({ [paint.color!]: c })} onStart={() => editor.beginChange()} onEnd={() => editor.endChange()} />}
          </div>
        </div>
      )}
      <div className="menu-item">
        <div className="menu-row params-row">
          <Glyph id="theme" className="menu-icon" />
          <span>Непрозрачность</span>
          <span className="menu-input">
            <input type="range" min={0} max={100} value={pct} aria-label="Непрозрачность, %" style={{ '--p': `${pct}%` } as React.CSSProperties}
              onPointerDown={() => { editor.beginChange(); window.addEventListener('pointerup', () => editor.endChange(), { once: true }); }}
              onChange={(e) => set({ [paint.opacity]: Number(e.target.value) >= 100 ? undefined : Number(e.target.value) / 100 })} />
            <i>{pct}%</i>
          </span>
        </div>
      </div>
      {rounded && (
        <div className="menu-item">
          <div className="menu-row params-row">
            <Glyph id="collapse-l" className="menu-icon" />
            <span>Скругление</span>
            <span className="menu-input">
              <input type="number" min={0} max={200} step={1} value={it.rad ?? (it.type === 'rect' ? 8 : 0)} aria-label="Скругление углов"
                onChange={(e) => set({ rad: Math.max(0, Math.min(200, Number(e.target.value) || 0)) })} />
              <i>px</i>
            </span>
          </div>
        </div>
      )}
    </>
  );
}
