import { useEffect, useReducer, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import type { Point } from '../canvas/geometry';
import { ICONS, searchIcons } from '../icons/icons';
import { EMOJI, emojiSrc, onEmojiLoad } from '../emoji/emoji';
import { DEFAULTS, FILLS } from '../model/types';
import { Glyph } from './glyphs';
import { readOrder } from './sortable';

type Tab = 'emoji' | 'stickers' | 'icons';
export type PickKind = 'emoji' | 'sticky' | 'icon';

const TABS: Array<[Tab, string]> = [['emoji', 'Смайлы'], ['stickers', 'Стикеры'], ['icons', 'Иконки']];
const KIND: Record<Tab, PickKind> = { emoji: 'emoji', stickers: 'sticky', icons: 'icon' };
const STICKY_COLORS = Object.keys(FILLS).filter((c) => c !== 'none');
/** Every tile of a tab in its default order, and where each tab's own order is kept. */
const ALL: Record<Tab, string[]> = { emoji: EMOJI.map((e) => e.id), stickers: STICKY_COLORS, icons: ICONS.map((i) => i.id) };
const ORDER_KEY: Record<Tab, string> = { emoji: 'planx-pick-emoji', stickers: 'planx-pick-stickers', icons: 'planx-pick-icons' };
/** How far the pointer moves before a press on a tile becomes a drag. */
const DRAG_SLOP = 4;

/** Picture of a tile: in the grid, twice as big while dragged around the picker, and outside it
 *  at the size it will have on the board (`px` across). */
function Tile({ kind, id, px }: { kind: PickKind; id: string; px?: number }): ReactNode {
  const size = px ? { width: px, height: px } : undefined;
  if (kind === 'emoji') return <img src={emojiSrc(id)} alt="" draggable={false} style={size} />;
  if (kind === 'sticky') return <i className="pick-sticky" style={{ background: FILLS[id], ...size }} />;
  return <span className="pick-glyph" style={size}><Glyph id={id} /></span>;
}

/**
 * Emoji, stickers and icons to put on the board, on three tabs. Click one to put it in the middle
 * of the screen. Drag one around the picker to rearrange the tab (kept in this browser), or out of
 * it: it turns into a preview at its board size and lands where it's let go (`at`, a screen point).
 */
export function IconPicker({ zoom, onPick }: { zoom: number; onPick: (kind: PickKind, id: string, at?: Point) => void }) {
  const root = useRef<HTMLDivElement>(null);
  const [tab, setTab] = useState<Tab>('emoji');
  // The emoji show as they come ready, cut to size.
  const [, redraw] = useReducer((n: number) => n + 1, 0);
  useEffect(() => onEmojiLoad(redraw), []);
  const [q, setQ] = useState('');
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (tab === 'icons' && matchMedia('(pointer: fine)').matches) input.current?.focus();
  }, [tab]);

  const [orders, setOrders] = useState(() => ({
    emoji: readOrder(ORDER_KEY.emoji, ALL.emoji, {}),
    stickers: readOrder(ORDER_KEY.stickers, ALL.stickers, {}),
    icons: readOrder(ORDER_KEY.icons, ALL.icons, {}),
  }));
  const shown = (t: Tab): string[] => {
    if (t !== 'icons') return orders[t];
    const found = new Set(searchIcons(q).map((i) => i.id));
    return orders.icons.filter((id) => found.has(id));
  };
  const label = (t: Tab, id: string) => (t === 'emoji' ? 'Смайл' : t === 'stickers' ? `Стикер ${id}` : ICONS.find((i) => i.id === id)?.ru ?? id);

  const tiles = useRef(new Map<string, HTMLElement>());
  const [drag, setDrag] = useState<{ tab: Tab; id: string; x: number; y: number; outside: boolean } | null>(null);
  const press = useRef<{ tab: Tab; id: string; x: number; y: number; dragged: boolean; moved: boolean; before: string[] } | null>(null);

  const isInside = (x: number, y: number) => {
    const r = root.current!.getBoundingClientRect();
    return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
  };
  /** Moves the dragged tile to where `target` is: before it when coming from later on, after it otherwise. */
  const moveTile = (t: Tab, id: string, target: string) => setOrders((o) => {
    const from = o[t].indexOf(id), list = o[t].filter((k) => k !== id), to = list.indexOf(target);
    list.splice(from > o[t].indexOf(target) ? to : to + 1, 0, id);
    return { ...o, [t]: list };
  });

  // The pointer is followed on the window, not captured by the tile: rearranging moves the tile's
  // element around the page, which would drop a capture.
  const handlers = useRef({ move: (_: PointerEvent) => {}, up: (_: PointerEvent) => {} });
  useEffect(() => {
    const onMove = (e: PointerEvent) => handlers.current.move(e), onUp = (e: PointerEvent) => handlers.current.up(e);
    const onCancel = () => { press.current = null; setDrag(null); };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onCancel);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onCancel);
    };
  }, []);

  const down = (t: Tab, id: string) => (e: ReactPointerEvent<HTMLButtonElement>) => {
    if (e.button !== 0) return;
    e.preventDefault();
    press.current = { tab: t, id, x: e.clientX, y: e.clientY, dragged: false, moved: false, before: orders[t] };
  };
  const move = (e: PointerEvent) => {
    const p = press.current;
    if (!p || (!p.dragged && Math.hypot(e.clientX - p.x, e.clientY - p.y) < DRAG_SLOP)) return;
    p.dragged = true;
    const outside = !isInside(e.clientX, e.clientY);
    // Inside the picker the tile takes the place of the one under the pointer.
    if (!outside) {
      for (const [id, el] of tiles.current) {
        if (id === p.id) continue;
        const r = el.getBoundingClientRect();
        if (e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom) {
          moveTile(p.tab, p.id, id);
          p.moved = true;
          break;
        }
      }
    }
    setDrag({ tab: p.tab, id: p.id, x: e.clientX, y: e.clientY, outside });
  };
  const up = (e: PointerEvent) => {
    const p = press.current;
    press.current = null;
    setDrag(null);
    if (!p) return;
    if (!p.dragged) { onPick(KIND[p.tab], p.id); return; }
    // Taken out onto the board, the tile goes back where it was (it may have passed other tiles on
    // the way out); let go inside, the new order stays.
    if (!isInside(e.clientX, e.clientY)) {
      setOrders((o) => ({ ...o, [p.tab]: p.before }));
      onPick(KIND[p.tab], p.id, { x: e.clientX, y: e.clientY });
    } else if (p.moved) {
      try { localStorage.setItem(ORDER_KEY[p.tab], JSON.stringify(orders[p.tab])); } catch { /* just won't be remembered */ }
    }
  };

  handlers.current = { move, up };

  const tile = (t: Tab, id: string) => (
    <button key={id} ref={(el) => { if (el) tiles.current.set(id, el); else tiles.current.delete(id); }}
      className={drag?.id === id && drag.tab === t ? 'dragging' : ''} title={t === 'icons' ? label(t, id) : undefined} aria-label={label(t, id)}
      onPointerDown={down(t, id)}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onPick(KIND[t], id); } }}>
      <Tile kind={KIND[t]} id={id} />
    </button>
  );

  // Outside the picker, the size the dropped item will have on screen (at least big enough to see).
  const boardPx = drag ? Math.max(16, DEFAULTS[KIND[drag.tab]].w * zoom) : 0;
  return (
    <div ref={root} className="pop icon-pick" role="dialog" aria-label="Смайлы, стикеры и иконки">
      <div className="pick-tabs" role="tablist">
        {TABS.map(([t, name]) => (
          <button key={t} role="tab" aria-selected={tab === t} className={tab === t ? 'on' : ''} onClick={() => setTab(t)}>{name}</button>
        ))}
      </div>
      {tab === 'emoji' && <div className="icon-grid emoji-grid">{shown('emoji').map((id) => tile('emoji', id))}</div>}
      {tab === 'stickers' && <div className="icon-grid sticky-grid">{shown('stickers').map((id) => tile('stickers', id))}</div>}
      {tab === 'icons' && (
        <>
          <input ref={input} id="icon-search" type="search" placeholder="Найти иконку" aria-label="Найти иконку"
            autoComplete="off" value={q} onChange={(e) => setQ(e.target.value)} />
          <div className="icon-grid">{shown('icons').map((id) => tile('icons', id))}</div>
          {!shown('icons').length && <p className="muted">Ничего не нашлось</p>}
        </>
      )}
      {/* The picker is a transformed box, so the ghost goes to the body to be placed by the screen. */}
      {drag && createPortal(
        <div className={`pick-ghost ${KIND[drag.tab]} ${drag.outside ? 'preview' : ''}`} style={{ left: drag.x, top: drag.y }}>
          <Tile kind={KIND[drag.tab]} id={drag.id} px={drag.outside ? boardPx : undefined} />
        </div>,
        document.body,
      )}
    </div>
  );
}
