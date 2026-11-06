import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { Editor } from '../editor/editor';
import type { Point } from '../canvas/geometry';
import { center, hitItem, hitLink, starRound } from '../canvas/geometry';
import { linkInTextAt } from '../canvas/renderer';
import { alignOf, baseWeight, DEFAULTS, FILLS, fillable, HAS_FONT, ICON_COLORS, INK_COLORS, strokable, STROKE_COLORS, TEXT_COLORS, type Item, type LinkStyle } from '../model/types';
import { fitHeight, FONTS } from '../canvas/text';
import { PanelIcon, type PanelIconName } from '../ui/PanelIcon';
import { fillOpacity, MIND_PALETTE } from '../model/mind';
import { Glyph } from '../ui/glyphs';
import { ColorPicker } from '../ui/ColorPicker';
import { Switch } from '../ui/BoardMenu';
import { labOn } from './labs';
import { TL_STEPS } from '../canvas/timeline';
import { startTidy } from './tidy';
import { startComment } from './comments';

/** Where the menu opened (on the screen and the board; the panel, from its button), what it's for, and
 *  whether it shows the picked item's parameters in place of its rows. */
interface Open { x: number; y: number; w: Point; url: string | null; board: boolean; params: boolean; link?: string; from?: DOMRect }

/** Opened from a panel low on the screen, it goes above the panel. */
const rising = (panel: DOMRect) => panel.top > innerHeight / 2;

/* Whether the menu's open from its button on the panels, for that to show. */
let menuShown = false;
const shownListeners = new Set<() => void>();
const setMenuShown = (v: boolean) => { menuShown = v; shownListeners.forEach((fn) => fn()); };
const subscribeShown = (fn: () => void) => { shownListeners.add(fn); return () => { shownListeners.delete(fn); }; };

/** Three dots at a panel's right end: the menu of the right click, for what's picked, opened from here. */
export function ItemMenuButton({ className }: { className: string }) {
  const on = useSyncExternalStore(subscribeShown, () => menuShown);
  return (
    <button className={`${className} item-menu ${on ? 'on' : ''}`} title="Действия" aria-label="Действия" aria-expanded={on} data-nosort
      onClick={(e) => window.dispatchEvent(new CustomEvent('planx:item-menu', { detail: e.currentTarget.closest('.bar, .tfmt')!.getBoundingClientRect() }))}>
      <PanelIcon name="more-vertical" />
    </button>
  );
}

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
  const opened = useRef(false);
  opened.current = !!at;
  useEffect(() => { setMenuShown(!!at?.from); }, [at]);
  // Where the parameters' popup was dragged to (by its top), kept till the menu opens again.
  const placed = useRef<{ left: number; top: number } | null>(null);

  useEffect(() => {
    // On the window: the editor gets its canvas after this has run.
    const open = (e: MouseEvent) => {
      const canvas = editor.canvas;
      if (!canvas || e.target !== canvas || !labOn('contextMenu')) return;
      e.preventDefault();
      if (editor.looking) return;
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
      editor.stopEditing();
      placed.current = null;
      // On nothing, with something picked: the menu's for that, wherever it's pressed.
      const picked = editor.selectedItems();
      if (!id && !picked.length && editor.selectedLinks().length) {
        setAt({ x: e.clientX, y: e.clientY, w, url: null, board: false, params: false, link: editor.selectedLinks()[0].id });
        return;
      }
      // On a link (in text, or the item's own): the way to it first.
      const own = id ? hit?.url : picked.length === 1 ? picked[0].url : undefined;
      const url = labOn('textLink') ? linkInTextAt(w) ?? own ?? null : null;
      setAt({ x: e.clientX, y: e.clientY, w: !id && picked.length ? center(picked[0]) : w, url, board: !id && !picked.length, params: false });
    };
    // From its button on a panel: the same menu, by the panel, closed again by it. What's being typed
    // in is what it's for; the typing, and so the text panel, goes on till a row's pressed.
    const fromPanel = (e: Event) => {
      if (opened.current) { setAt(null); return; }
      const typing = editor.editingId;
      if (typing && !editor.selection.has(typing)) editor.setSelection([typing]);
      const it = editor.selectedItems()[0], link = !it ? editor.selectedLinks()[0] : undefined;
      if (!it && !link) return;
      const from = (e as CustomEvent<DOMRect>).detail, w = it ? center(it) : editor.toWorld(from.x, from.y);
      placed.current = null;
      setAt({ x: from.right, y: from.top, w, url: labOn('textLink') && editor.selection.size === 1 ? it?.url ?? null : null, board: false, params: false, link: link?.id, from });
    };
    window.addEventListener('contextmenu', open);
    window.addEventListener('planx:item-menu', fromPanel);
    return () => { window.removeEventListener('contextmenu', open); window.removeEventListener('planx:item-menu', fromPanel); };
  }, [editor]);

  useEffect(() => {
    if (!at) return;
    // (A press on its button is left to the button.)
    const away = (e: Event) => { if (!ref.current?.contains(e.target as Node) && !(e.target as Element).closest?.('.item-menu')) setAt(null); };
    // (Opened from a panel, Esc only closes it: what's being typed goes on.)
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') { if (at.from) e.stopPropagation(); setAt(null); } };
    window.addEventListener('pointerdown', away, true);
    window.addEventListener('wheel', away, true);
    window.addEventListener('keydown', key, true);
    return () => { window.removeEventListener('pointerdown', away, true); window.removeEventListener('wheel', away, true); window.removeEventListener('keydown', key, true); };
  }, [at]);

  // Kept on the screen: where it would run off the right, it opens to the left of the pointer; off
  // the bottom, it moves up to the window's edge.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || !at) return;
    if (placed.current) { el.style.left = `${placed.current.left}px`; el.style.top = `${placed.current.top}px`; return; }
    // By its panel: level with its right end, above it or below; again as it takes another size (as
    // wide as its rows, it does as their font comes in).
    if (at.from) {
      const from = at.from, place = () => {
        // (Not once it's been dragged elsewhere by its top.)
        if (placed.current) return;
        const gap = 8, h = el.offsetHeight;
        el.style.left = `${Math.max(gap, Math.min(innerWidth - gap - el.offsetWidth, from.right - el.offsetWidth))}px`;
        el.style.top = `${Math.max(gap, Math.min(innerHeight - gap - h, rising(from) ? from.top - gap - h : from.bottom + gap))}px`;
      };
      place();
      const sized = new ResizeObserver(place);
      sized.observe(el);
      return () => sized.disconnect();
    }
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
  // Rising, opened above its button.
  const comes = at.from && rising(at.from) ? { '--in-y': '8px' } as React.CSSProperties : undefined;
  const gripBar = <div className="params-grip" onPointerDown={grip} title="Перетащить" aria-hidden="true" />;
  const run = (fn: () => void) => () => { fn(); setAt(null); };
  const row = (icon: string, label: string, fn: () => void) => (
    <div className="menu-item">
      <button className={`menu-row ${label === 'Удалить' ? 'danger' : ''}`} role="menuitem" onClick={fn}>
        <Glyph id={icon} className="menu-icon" />
        <span>{label}</span>
      </button>
    </div>
  );
  const link = at.link ? editor.board.getLink(at.link) : undefined;
  if (link) {
    return (
      <div ref={ref} className={`board-menu context-menu ${at.params ? 'params-pop' : ''}`} role={at.params ? 'dialog' : 'menu'} aria-label={at.params ? 'Параметры линии' : 'Линия'} style={comes}
        onContextMenu={(e) => e.preventDefault()}>
        {at.params ? <>{gripBar}<div className="params-body"><LinkParams editor={editor} ids={editor.selectedLinks().map((l) => l.id)} /></div></> : <>
          {row('settings-l', 'Параметры', () => setAt({ ...at, params: true }))}
          <div className="menu-line" />
          {row('trashcan', 'Удалить', run(() => editor.deleteSelection()))}
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
      <div ref={ref} className="board-menu context-menu params-pop" role="dialog" aria-label="Параметры" style={comes} onContextMenu={(e) => e.preventDefault()}>
        {gripBar}
        <div className="params-body"><ParamsList editor={editor} items={params} /></div>
      </div>
    );
  }
  return (
    <div ref={ref} className="board-menu context-menu" role="menu" aria-label={at.board ? 'Доска' : 'Действия с выделенным'} style={comes} onContextMenu={(e) => e.preventDefault()}>
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
          {row('settings-l', 'Параметры', () => setAt({ ...at, params: true }))}
          <div className="menu-line" />
        </>}
        {labOn('comments') && <>
          {row('message', 'Комментарий', run(() => startComment(at.w, editor.selectedItems()[0])))}
          <div className="menu-line" />
        </>}
        {row('copy', 'Скопировать', run(() => { if (editor.copy()) onToast('Скопировано. Вставить: Ctrl+V или правым кликом'); }))}
        {row('arrow-top-l', 'Переместить вверх', run(() => editor.bringToFront()))}
        {row('arrow-down-l', 'Переместить вниз', run(() => editor.sendToBack()))}
        {row('component', 'Сделать компонентом', run(() => editor.makeComponent()))}
        {editInst && row('edit-l', 'Редактировать компонент', run(() => editor.editComponentAt(editInst)))}
        {tidy && row('apps', 'Авторасположение', run(() => { if (tidyMind) editor.tidyMind(tidyMind); else startTidy(editor); editor.requestRender(); }))}
        <div className="menu-line" />
        {row('trashcan', 'Удалить', run(() => editor.deleteSelection()))}
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
      {/* How thick: from a hair to 8 px. */}
      <div className="params-group">
        <div className="params-label">Толщина</div>
        <div className="params-opacity">
          <input type="range" min={0.5} max={8} step={0.5} value={l.lw ?? 1.7} aria-label="Толщина линии, px" style={{ '--p': `${(((l.lw ?? 1.7) - 0.5) / 7.5) * 100}%` } as React.CSSProperties}
            onPointerDown={() => { editor.beginChange(); window.addEventListener('pointerup', () => editor.endChange(), { once: true }); }}
            onChange={(e) => set({ lw: Number(e.target.value) })} />
          <i>{(l.lw ?? 1.7).toLocaleString('ru')} px</i>
        </div>
      </div>
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
  sticky: 'Заметка', text: 'Текст', rect: 'Прямоугольник', ellipse: 'Эллипс', polygon: 'Фигура', task: 'Задача', mind: 'Узел майнд-карты',
  icon: 'Иконка', emoji: 'Эмодзи', ink: 'Рисунок', image: 'Картинка', frame: 'Группа',
};

/** The items whose parameters the popup lists: the picked, an instance by what's in it. */
export function paramItems(editor: Editor): Item[] {
  const all = editor.board.list();
  return editor.selectedItems().flatMap((it) => (it.inst ? all.filter((c) => c.host === it.id) : [it])).filter((it) => (NAMES[it.type] && (it.type !== 'frame' || fillable(it))) || it.tl);
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
            <div className="params-title">{now.tl ? 'Таймлайн' : now.doodle ? 'Стикер' : NAMES[now.type]}{now.nm ? ` ${now.nm}` : ''}{now.tl ? '' : snippet}</div>
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
export function ColorRow({ editor, label, colors, current, none, opacity, onColor, onOpacity }: {
  editor: Editor; label: string; colors: Record<string, string>; current: string | undefined; none?: boolean;
  opacity: number; onColor: (c: string) => void; onOpacity: (v: number | undefined) => void;
}) {
  const [picking, setPicking] = useState(false);
  const custom = current?.startsWith('#') && !colors[current] ? current : null, pct = Math.round(opacity * 100);
  // Any colour floats under its circle (over it when there's no room below), past the popup's edges
  // if it must; a press elsewhere or the popup scrolled puts it away.
  const swatch = useRef<HTMLButtonElement>(null), box = useRef<HTMLDivElement>(null);
  const [spot, setSpot] = useState<{ x: number; y: number; above: boolean } | null>(null);
  useLayoutEffect(() => {
    if (!picking) { setSpot(null); return; }
    const b = swatch.current!.getBoundingClientRect(), f = box.current!.getBoundingClientRect(), gap = 8;
    const x = Math.max(gap, Math.min(innerWidth - f.width - gap, b.left + b.width / 2 - f.width / 2));
    const above = b.bottom + gap + f.height > innerHeight - gap && b.top - gap - f.height >= gap;
    setSpot({ x: Math.round(x), y: Math.round(above ? b.top - gap - f.height : b.bottom + gap), above });
    const away = (e: Event) => { const t = e.target as Node; if (!box.current?.contains(t) && !swatch.current?.contains(t)) setPicking(false); };
    window.addEventListener('pointerdown', away, true);
    window.addEventListener('scroll', away, true);
    return () => { window.removeEventListener('pointerdown', away, true); window.removeEventListener('scroll', away, true); };
  }, [picking]);
  return (
    <div className="params-group">
      <div className="params-label">{label}</div>
      <div className="params-colors">
        {Object.entries(colors).map(([k, v]) => (
          <button key={k} className={`sw ${k === 'none' ? 'none' : ''} ${current === k ? 'on' : ''}`} style={{ background: v || 'var(--ink)' }}
            aria-label={`${label}: ${k}`} onClick={() => onColor(k)} />
        ))}
        {none && <button className={`sw none ${current === 'none' ? 'on' : ''}`} aria-label={`${label}: нет`} onClick={() => onColor('none')} />}
        <button ref={swatch} className={`sw custom ${custom || picking ? 'on' : ''}`} style={custom ? { background: custom } : undefined} title="Свой цвет" aria-label={`${label}: свой цвет`}
          onClick={() => setPicking(!picking)} />
      </div>
      {picking && <ColorPicker value={custom ?? '#3E7BFA'} onChange={onColor} onStart={() => editor.beginChange()} onEnd={() => editor.endChange()} at={spot} box={box} />}
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
  const canFill = fillable(it), canStroke = strokable(it), texted = HAS_FONT.includes(it.type) && it.type !== 'table' && !!it.text?.trim();
  const fills = it.type === 'mind' ? Object.fromEntries(MIND_PALETTE.map((c) => [c, c])) : FILLS;
  const own = it.type === 'icon' ? ICON_COLORS : it.type === 'ink' ? INK_COLORS : null;
  const fs = it.fs ?? DEFAULTS[it.type].fs ?? 16, bold = (it.fw ?? baseWeight(it.type)) >= 600, align = alignOf(it);
  const text = (patch: Partial<Item>) => set(restyle(it, patch));
  // A timeline: its step alone.
  if (it.tl) return (
    <div className="params-group">
      <div className="params-label">Шаг</div>
      <div className="labs-seg" role="radiogroup" aria-label="Шаг">
        {TL_STEPS.map((k) => (
          <button key={k} role="radio" aria-checked={(it.ts ?? 1) === k} className={(it.ts ?? 1) === k ? 'on' : ''} onClick={() => editor.setTimelineStep(it.id, k)}>{k}x</button>
        ))}
      </div>
    </div>
  );
  const toggle = (icon: PanelIconName, label: string, on: boolean, patch: Partial<Item>) => (
    <button className={`params-btn ${on ? 'on' : ''}`} title={label} aria-label={label} aria-pressed={on} onClick={() => text(patch)}><PanelIcon name={icon} /></button>
  );
  return (
    <>
      {canFill && <ColorRow editor={editor} label={it.type === 'mind' ? 'Цвет' : 'Заливка'} colors={fills} current={it.color} opacity={fillOpacity(it)}
        onColor={(c) => set({ color: c })} onOpacity={(v) => set({ fo: v ?? (it.type === 'mind' || it.type === 'frame' ? 1 : undefined) })} />}
      {canStroke && <ColorRow editor={editor} label="Обводка" colors={Object.fromEntries(Object.entries(STROKE_COLORS).filter(([k]) => k !== 'none').map(([k, v]) => [k, v || (k === 'ink' ? 'var(--ink)' : 'var(--shape-stroke)')]))} none
        current={it.sc ?? 'gray'} opacity={it.sc === 'none' ? 0 : it.so ?? 1}
        onColor={(c) => set({ sc: c === 'gray' ? undefined : c, ...(it.sc === 'none' && c !== 'none' && { so: undefined }) })}
        onOpacity={(v) => set({ so: v, ...(it.sc === 'none' && v !== 0 && { sc: undefined }) })} />}
      {own && <ColorRow editor={editor} label="Цвет" colors={own} current={it.color ?? 'ink'} opacity={it.fo ?? 1}
        onColor={(c) => set({ color: c })} onOpacity={(v) => set({ fo: v })} />}
      {!canFill && !own && !texted && (
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
            <input type="number" min={0} max={200} step={1} value={it.rad ?? (it.type === 'rect' ? 8 : it.shape === 'star' ? starRound(it) : 0)} aria-label="Скругление углов"
              onChange={(e) => set({ rad: Math.max(0, Math.min(200, Number(e.target.value) || 0)) })} />
            <i>px</i>
          </span>
        </div>
      )}
    </>
  );
}
