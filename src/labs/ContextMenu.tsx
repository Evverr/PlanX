import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { Editor } from '../editor/editor';
import type { Point } from '../canvas/geometry';
import { hitItem, hitLink } from '../canvas/geometry';
import { linkInTextAt } from '../canvas/renderer';
import { alignOf, baseWeight, COLORABLE, DEFAULTS, FILLS, HAS_FONT, ICON_COLORS, INK_COLORS, STROKABLE, STROKE_COLORS, TEXT_COLORS, type Item, type LinkStyle } from '../model/types';
import { fitHeight, FONTS } from '../canvas/text';
import { PanelIcon, type PanelIconName } from '../ui/PanelIcon';
import { fillOpacity, MIND_PALETTE } from '../model/mind';
import { Glyph } from '../ui/glyphs';
import { ColorPicker } from '../ui/ColorPicker';
import { Switch } from '../ui/BoardMenu';
import { labOn } from './labs';
import { startTidy } from './tidy';
import { startComment } from './comments';

/** Where the menu opened (on the screen and the board), what it's for, and whether it shows the
 *  picked item's parameters in place of its rows. */
interface Open { x: number; y: number; w: Point; url: string | null; board: boolean; params: boolean; link?: string }

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
  // Where the parameters' popup was dragged to (by its top), kept till the menu opens again.
  const placed = useRef<{ left: number; top: number } | null>(null);

  useEffect(() => {
    // On the window: the editor gets its canvas after this has run.
    const open = (e: MouseEvent) => {
      const canvas = editor.canvas;
      if (!canvas || e.target !== canvas || !labOn('contextMenu')) return;
      e.preventDefault();
      const r = canvas.getBoundingClientRect(), w = editor.toWorld(e.clientX - r.left, e.clientY - r.top);
      const hit = hitItem(editor.shown(), w, editor.cam.z);
      // A link (where no item but a frame is over it, as a press would find it): its own menu.
      const link = hit && hit.type !== 'frame' ? null : hitLink(editor.shownLinks(), (i) => editor.board.get(i), w, editor.cam.z);
      if (link) {
        // One of several links picked: the menu's for them all.
        if (!editor.selection.has(link.id)) editor.setSelection([link.id]);
        editor.stopEditing();
        placed.current = null;
        setAt({ x: e.clientX, y: e.clientY, w, url: null, board: false, params: false, link: link.id });
        return;
      }
      // What's in an instance is picked with it, as a click would.
      const id = hit ? (hit.host && !editor.selection.has(hit.id) ? hit.host : hit.id) : null;
      if (id && !editor.selection.has(id)) editor.setSelection([id]);
      if (!id) editor.setSelection([]);
      editor.stopEditing();
      // On a link (in text, or the item's own): the way to it first.
      const url = labOn('textLink') ? linkInTextAt(w) ?? hit?.url ?? null : null;
      placed.current = null;
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
    if (placed.current) { el.style.left = `${placed.current.left}px`; el.style.top = `${placed.current.top}px`; return; }
    el.style.left = `${Math.max(8, at.x + el.offsetWidth > innerWidth - 8 ? at.x - el.offsetWidth : at.x)}px`;
    el.style.top = `${Math.max(8, Math.min(at.y, innerHeight - 8 - el.offsetHeight))}px`;
  });

  if (!at) return null;
  /** The parameters' popup taken by its top and moved about, kept on the screen. */
  const grip = (e: React.PointerEvent) => {
    const el = ref.current;
    if (!el || e.button !== 0) return;
    e.preventDefault();
    const r = el.getBoundingClientRect(), dx = e.clientX - r.left, dy = e.clientY - r.top;
    const move = (ev: PointerEvent) => {
      placed.current = {
        left: Math.max(8, Math.min(innerWidth - 8 - r.width, ev.clientX - dx)),
        top: Math.max(8, Math.min(innerHeight - 40, ev.clientY - dy)),
      };
      el.style.left = `${placed.current.left}px`;
      el.style.top = `${placed.current.top}px`;
    };
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };
  const gripBar = <div className="params-grip" onPointerDown={grip} title="Перетащить" aria-hidden="true" />;
  const run = (fn: () => void) => () => { fn(); setAt(null); };
  const row = (icon: string, label: string, fn: () => void) => (
    <div className="menu-item">
      <button className="menu-row" role="menuitem" onClick={fn}>
        <Glyph id={icon} className="menu-icon" />
        <span>{label}</span>
      </button>
    </div>
  );
  const link = at.link ? editor.board.getLink(at.link) : undefined;
  if (link) {
    return (
      <div ref={ref} className={`board-menu context-menu ${at.params ? 'params-pop' : ''}`} role={at.params ? 'dialog' : 'menu'} aria-label={at.params ? 'Параметры линии' : 'Линия'}
        onContextMenu={(e) => e.preventDefault()}>
        {at.params ? <>{gripBar}<LinkParams editor={editor} ids={editor.selectedLinks().map((l) => l.id)} /></> : <>
          {row('sign', 'Параметры', () => setAt({ ...at, params: true }))}
          <div className="menu-line" />
          {row('trashcan-l', 'Удалить', run(() => editor.deleteSelection()))}
        </>}
      </div>
    );
  }
  const params = paramItems(editor);
  // An instance picked (or something in one): its component brought out in its place.
  const one = editor.selection.size === 1 ? editor.selectedItems()[0] : undefined;
  const inOne = one?.host ? editor.board.get(one.host) : one, editInst = inOne?.inst && !inOne.inst.startsWith('@') ? inOne.id : null;
  // "Авторасположение" (src/labs/tidy.ts): a few picked in a grid, or a mind map node's branches.
  const tidyMind = one?.type === 'mind' && editor.board.list().some((i) => i.parent === one.id) ? one.id : null;
  const tidy = labOn('tidy') && (editor.selection.size > 1 || tidyMind);
  if (at.params && params.length) {
    return (
      <div ref={ref} className="board-menu context-menu params-pop" role="dialog" aria-label="Параметры" onContextMenu={(e) => e.preventDefault()}>
        {gripBar}
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
        {labOn('comments') && row('message', 'Комментарий', run(() => startComment(at.w)))}
      </> : <>
        {at.url && <>
          {row('link', 'Перейти по ссылке', run(() => window.open(at.url!, '_blank', 'noopener')))}
          <div className="menu-line" />
        </>}
        {params.length > 0 && <>
          {row('sign', 'Параметры', () => setAt({ ...at, params: true }))}
          <div className="menu-line" />
        </>}
        {labOn('comments') && <>
          {row('message', 'Комментарий', run(() => startComment(at.w, editor.selectedItems()[0])))}
          <div className="menu-line" />
        </>}
        {row('copy', 'Скопировать', run(() => { if (editor.copy()) onToast('Скопировано. Вставить: Ctrl+V или правым кликом'); }))}
        {row('arrow-top-l', 'Переместить вверх', run(() => editor.bringToFront()))}
        {row('arrow-down-l', 'Переместить вниз', run(() => editor.sendToBack()))}
        {row('maximize', 'Сделать компонентом', run(() => editor.makeComponent()))}
        {editInst && row('edit-l', 'Редактировать компонент', run(() => editor.editComponentAt(editInst)))}
        {tidy && row('apps', 'Авторасположение', run(() => { if (tidyMind) editor.tidyMind(tidyMind); else startTidy(editor); editor.requestRender(); }))}
        <div className="menu-line" />
        {row('trashcan-l', 'Удалить', run(() => editor.deleteSelection()))}
      </>}
    </div>
  );
}

/** A line's parameters: its colour (any too) and opacity, dashed or not, its arrowheads, the way it runs. */
export function LinkParams({ editor, ids }: { editor: Editor; ids: string[] }) {
  const [, redraw] = useState(0);
  // Several picked: shown as the first is, set on all of them.
  const links = ids.map((id) => editor.board.getLink(id)).filter((l): l is NonNullable<typeof l> => !!l), l = links[0];
  if (!l) return null;
  const set = (patch: Parameters<Editor['board']['updateLink']>[1]) => {
    editor.board.transact(() => links.forEach((k) => editor.board.updateLink(k.id, patch)));
    redraw((n) => n + 1);
  };
  const start = l.heads === 'start' || l.heads === 'both', end = l.heads !== 'start' && l.heads !== 'none';
  const heads = (s: boolean, e: boolean) => set({ heads: s && e ? 'both' : s ? 'start' : e ? undefined : 'none' });
  const btn = (icon: PanelIconName, label: string, on: boolean, fn: () => void) => (
    <button className={`params-btn ${on ? 'on' : ''}`} title={label} aria-label={label} aria-pressed={on} onClick={fn}><PanelIcon name={icon} /></button>
  );
  const styled = (style: LinkStyle | undefined) => { editor.board.transact(() => links.forEach((k) => editor.board.setLinkStyle(k.id, style))); redraw((n) => n + 1); };
  return (
    <div className="params-list">
      <div className="params-title">{links.length > 1 ? `Линии: ${links.length}` : 'Линия'}</div>
      <ColorRow editor={editor} label="Цвет" colors={Object.fromEntries(Object.entries(STROKE_COLORS).filter(([k]) => k !== 'none').map(([k, v]) => [k, v || (k === 'ink' ? 'var(--ink)' : 'var(--link)')]))}
        current={l.color ?? 'gray'} opacity={l.lo ?? 1} onColor={(c) => set({ color: c === 'gray' ? undefined : c })} onOpacity={(v) => set({ lo: v })} />
      <div className="params-group">
        <div className="params-label">Вид</div>
        <div className="params-text">
          {btn('line-curve', 'Плавная', !l.style, () => styled(undefined))}
          {btn('line-elbow', 'С прямыми углами', l.style === 'elbow', () => styled('elbow'))}
          {btn('line-straight', 'Прямая', l.style === 'straight', () => styled('straight'))}
        </div>
      </div>
      <div className="menu-item">
        <button className="menu-row" role="menuitemcheckbox" aria-checked={!!l.dash} onClick={() => set({ dash: l.dash ? undefined : true })}>
          <span>Пунктир</span><Switch on={!!l.dash} />
        </button>
      </div>
      <div className="menu-item">
        <button className="menu-row" role="menuitemcheckbox" aria-checked={start} onClick={() => heads(!start, end)}>
          <span>Стрелка в начале</span><Switch on={start} />
        </button>
      </div>
      <div className="menu-item">
        <button className="menu-row" role="menuitemcheckbox" aria-checked={end} onClick={() => heads(start, !end)}>
          <span>Стрелка в конце</span><Switch on={end} />
        </button>
      </div>
    </div>
  );
}

/** What each kind of item is called in the parameters' list. */
const NAMES: Partial<Record<Item['type'], string>> = {
  sticky: 'Базовый стикер', text: 'Текст', rect: 'Прямоугольник', ellipse: 'Эллипс', polygon: 'Фигура', task: 'Задача', mind: 'Узел майнд-карты',
  icon: 'Иконка', emoji: 'Смайл', ink: 'Рисунок', image: 'Картинка',
};

/** The items whose parameters the popup lists: the picked, an instance by what's in it. */
export function paramItems(editor: Editor): Item[] {
  const all = editor.board.list();
  return editor.selectedItems().flatMap((it) => (it.inst ? all.filter((c) => c.host === it.id) : [it])).filter((it) => NAMES[it.type]);
}

/** Each item's parameters, one after another under its name, a line between. */
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
            <div className="params-title">{now.doodle ? 'Игровой стикер' : NAMES[now.type]}{snippet}</div>
            <ItemParams editor={editor} it={now} set={set} />
          </div>
        );
      })}
    </div>
  );
}

/** How an item's text looks, set from the parameters: a text item measured again to fit (a copy in
 *  an instance keeping that height as its own, as typing does). */
function restyle(it: Item, patch: Partial<Item>): Partial<Item> {
  if (it.type !== 'text') return patch;
  const h = fitHeight({ ...it, ...patch });
  return { ...patch, ...(h && { h }), ...(h && it.host && !it.ovr?.includes('h') && { ovr: [...(it.ovr ?? []), 'h'] }) };
}

/** A colour row: the colours to pick from (the one now marked), any colour, and how see-through. */
function ColorRow({ editor, label, colors, current, none, opacity, onColor, onOpacity }: {
  editor: Editor; label: string; colors: Record<string, string>; current: string | undefined; none?: boolean;
  opacity: number; onColor: (c: string) => void; onOpacity: (v: number | undefined) => void;
}) {
  const [picking, setPicking] = useState(false);
  const custom = current?.startsWith('#') && !colors[current] ? current : null, pct = Math.round(opacity * 100);
  return (
    <div className="params-group">
      <div className="params-label">{label}</div>
      <div className="params-colors">
        {Object.entries(colors).map(([k, v]) => (
          <button key={k} className={`sw ${k === 'none' ? 'none' : ''} ${current === k ? 'on' : ''}`} style={{ background: v || 'var(--ink)' }}
            aria-label={`${label}: ${k}`} onClick={() => onColor(k)} />
        ))}
        {none && <button className={`sw none ${current === 'none' ? 'on' : ''}`} aria-label={`${label}: нет`} onClick={() => onColor('none')} />}
        <div className="cp-wrap">
          <button className={`sw custom ${custom || picking ? 'on' : ''}`} style={custom ? { background: custom } : undefined} title="Свой цвет" aria-label={`${label}: свой цвет`}
            onClick={() => setPicking(!picking)} />
          {picking && <ColorPicker value={custom ?? '#3E7BFA'} onChange={onColor} onStart={() => editor.beginChange()} onEnd={() => editor.endChange()} />}
        </div>
      </div>
      <div className="params-opacity">
        <input type="range" min={0} max={100} value={pct} aria-label={`${label}: непрозрачность, %`} style={{ '--p': `${pct}%` } as React.CSSProperties}
          onPointerDown={() => { editor.beginChange(); window.addEventListener('pointerup', () => editor.endChange(), { once: true }); }}
          onChange={(e) => onOpacity(Number(e.target.value) >= 100 ? undefined : Number(e.target.value) / 100)} />
        <i>{pct}%</i>
      </div>
    </div>
  );
}

const SIZES = [10, 12, 14, 16, 18, 20, 24, 28, 32, 36, 48, 64, 72, 96];

/** An item's parameters: its fill and outline (or colour), each with its opacity, its text as the
 *  text panel sets it (font, size, style, alignment, list, colour), and a rectangle's or figure's
 *  rounding. */
function ItemParams({ editor, it, set }: { editor: Editor; it: Item; set: (patch: Partial<Item>) => void }) {
  // Its text's parameters once it has some (not a new rectangle's).
  const fillable = COLORABLE.includes(it.type), strokable = STROKABLE.includes(it.type), texted = HAS_FONT.includes(it.type) && it.type !== 'table' && !!it.text?.trim();
  const fills = it.type === 'mind' ? Object.fromEntries(MIND_PALETTE.map((c) => [c, c])) : FILLS;
  const own = it.type === 'icon' ? ICON_COLORS : it.type === 'ink' ? INK_COLORS : null;
  const fs = it.fs ?? DEFAULTS[it.type].fs ?? 16, bold = (it.fw ?? baseWeight(it.type)) >= 600, align = alignOf(it);
  const text = (patch: Partial<Item>) => set(restyle(it, patch));
  const toggle = (icon: PanelIconName, label: string, on: boolean, patch: Partial<Item>) => (
    <button className={`params-btn ${on ? 'on' : ''}`} title={label} aria-label={label} aria-pressed={on} onClick={() => text(patch)}><PanelIcon name={icon} /></button>
  );
  return (
    <>
      {fillable && <ColorRow editor={editor} label={it.type === 'mind' ? 'Цвет' : 'Заливка'} colors={fills} current={it.color} opacity={fillOpacity(it)}
        onColor={(c) => set({ color: c })} onOpacity={(v) => set({ fo: v ?? (it.type === 'mind' ? 1 : undefined) })} />}
      {strokable && <ColorRow editor={editor} label="Обводка" colors={Object.fromEntries(Object.entries(STROKE_COLORS).filter(([k]) => k !== 'none').map(([k, v]) => [k, v || (k === 'ink' ? 'var(--ink)' : 'var(--shape-stroke)')]))} none
        current={it.sc ?? 'gray'} opacity={it.so ?? 1} onColor={(c) => set({ sc: c === 'gray' ? undefined : c })} onOpacity={(v) => set({ so: v })} />}
      {own && <ColorRow editor={editor} label="Цвет" colors={own} current={it.color ?? 'ink'} opacity={it.fo ?? 1}
        onColor={(c) => set({ color: c })} onOpacity={(v) => set({ fo: v })} />}
      {!fillable && !own && !texted && (
        <div className="params-group">
          <div className="params-label">Непрозрачность</div>
          <div className="params-opacity">
            <input type="range" min={0} max={100} value={Math.round((it.fo ?? 1) * 100)} aria-label="Непрозрачность, %" style={{ '--p': `${Math.round((it.fo ?? 1) * 100)}%` } as React.CSSProperties}
              onChange={(e) => set({ fo: Number(e.target.value) >= 100 ? undefined : Number(e.target.value) / 100 })} />
            <i>{Math.round((it.fo ?? 1) * 100)}%</i>
          </div>
        </div>
      )}
      {texted && (
        <div className="params-group">
          <div className="params-label">Текст</div>
          <div className="params-text">
            <select aria-label="Шрифт" value={it.ff ?? 'onest'} onChange={(e) => text({ ff: e.target.value === 'onest' ? undefined : e.target.value })}>
              {Object.entries(FONTS).map(([k, f]) => <option key={k} value={k}>{f.label}</option>)}
            </select>
            <select aria-label="Размер" value={fs} onChange={(e) => text({ fs: Number(e.target.value) })}>
              {[...new Set([...SIZES, fs])].sort((a, b) => a - b).map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </div>
          <div className="params-text">
            {toggle('bold', 'Жирный', bold, { fw: bold ? 400 : 700 })}
            {toggle('italic', 'Курсив', !!it.fi, { fi: it.fi ? undefined : true })}
            {toggle('underline', 'Подчёркнутый', !!it.fu, { fu: it.fu ? undefined : true })}
            {toggle('strike', 'Зачёркнутый', !!it.fx, { fx: it.fx ? undefined : true })}
            <span className="params-gap" />
            {toggle('align-left', 'По левому краю', align === 'left', { ta: 'left' })}
            {toggle('align-center', 'По центру', align === 'center', { ta: 'center' })}
            {toggle('align-right', 'По правому краю', align === 'right', { ta: 'right' })}
            <span className="params-gap" />
            {toggle('bulleted-list', 'Маркированный список', it.ls === 'bullet', { ls: it.ls === 'bullet' ? undefined : 'bullet' })}
            {toggle('numbered-list', 'Нумерованный список', it.ls === 'number', { ls: it.ls === 'number' ? undefined : 'number' })}
          </div>
        </div>
      )}
      {texted && <ColorRow editor={editor} label="Цвет текста" colors={TEXT_COLORS} current={it.tc ?? 'ink'} opacity={it.to ?? 1}
        onColor={(c) => set({ tc: c === 'ink' ? undefined : c })} onOpacity={(v) => set({ to: v })} />}
      {(it.type === 'rect' || it.type === 'polygon') && (
        <div className="params-group params-inline">
          <div className="params-label">Скругление</div>
          <span className="menu-input">
            <input type="number" min={0} max={200} step={1} value={it.rad ?? (it.type === 'rect' ? 8 : 0)} aria-label="Скругление углов"
              onChange={(e) => set({ rad: Math.max(0, Math.min(200, Number(e.target.value) || 0)) })} />
            <i>px</i>
          </span>
        </div>
      )}
    </>
  );
}
