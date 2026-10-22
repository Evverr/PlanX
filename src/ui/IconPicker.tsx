import { useEffect, useRef, useState, type PointerEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import type { Point } from '../canvas/geometry';
import { searchIcons } from '../icons/icons';
import { EMOJI } from '../emoji/emoji';
import { FILLS } from '../model/types';
import { Glyph } from './glyphs';

type Tab = 'emoji' | 'stickers' | 'icons';
export type PickKind = 'emoji' | 'sticky' | 'icon';

const TABS: Array<[Tab, string]> = [['emoji', 'Смайлы'], ['stickers', 'Стикеры'], ['icons', 'Иконки']];
const STICKY_COLORS = Object.keys(FILLS).filter((c) => c !== 'none');
/** How far the pointer moves before a press on a tile becomes a drag. */
const DRAG_SLOP = 4;
/** Size of the picture under the pointer while dragging (twice the tile's), in screen pixels;
 *  emoji and icons keep it when dropped. Matches .pick-ghost in styles.css. */
const GHOST_SIZE: Record<PickKind, number> = { emoji: 54, sticky: 88, icon: 52 };

/** Picture of a tile, in the grid and (twice as big) under the pointer while dragging. */
function Tile({ kind, id }: { kind: PickKind; id: string }): ReactNode {
  if (kind === 'emoji') return <img src={EMOJI.find((e) => e.id === id)?.url} alt="" draggable={false} />;
  if (kind === 'sticky') return <i className="pick-sticky" style={{ background: FILLS[id] }} />;
  return <Glyph id={id} />;
}

/**
 * Emoji, stickers and icons to put on the board, on three tabs. Click one to put it in the middle
 * of the screen, or drag it out and drop it where it should go.
 * `at` is the screen point it was dropped on.
 */
export function IconPicker({ onPick }: { onPick: (kind: PickKind, id: string, at?: Point & { size: number }) => void }) {
  const [tab, setTab] = useState<Tab>('emoji');
  const [q, setQ] = useState('');
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (tab === 'icons' && matchMedia('(pointer: fine)').matches) input.current?.focus();
  }, [tab]);
  const found = tab === 'icons' ? searchIcons(q) : [];

  const [ghost, setGhost] = useState<{ kind: PickKind; id: string; x: number; y: number } | null>(null);
  const press = useRef<{ kind: PickKind; id: string; x: number; y: number; dragged: boolean } | null>(null);
  const down = (kind: PickKind, id: string) => (e: PointerEvent<HTMLButtonElement>) => {
    if (e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    press.current = { kind, id, x: e.clientX, y: e.clientY, dragged: false };
  };
  const move = (e: PointerEvent<HTMLButtonElement>) => {
    const p = press.current;
    if (!p || (!p.dragged && Math.hypot(e.clientX - p.x, e.clientY - p.y) < DRAG_SLOP)) return;
    p.dragged = true;
    setGhost({ kind: p.kind, id: p.id, x: e.clientX, y: e.clientY });
  };
  const up = (e: PointerEvent<HTMLButtonElement>) => {
    const p = press.current;
    press.current = null;
    setGhost(null);
    if (!p) return;
    if (!p.dragged) { onPick(p.kind, p.id); return; }
    // Only a drop on the board counts; let go over a panel or the picker, nothing happens.
    if (document.elementFromPoint(e.clientX, e.clientY)?.classList.contains('board-canvas')) onPick(p.kind, p.id, { x: e.clientX, y: e.clientY, size: GHOST_SIZE[p.kind] });
  };
  const tile = (kind: PickKind, id: string, label: string) => (
    <button key={id} title={kind === 'icon' ? label : undefined} aria-label={label}
      onPointerDown={down(kind, id)} onPointerMove={move} onPointerUp={up} onPointerCancel={() => { press.current = null; setGhost(null); }}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onPick(kind, id); } }}>
      <Tile kind={kind} id={id} />
    </button>
  );

  return (
    <div className="pop icon-pick" role="dialog" aria-label="Смайлы, стикеры и иконки">
      <div className="pick-tabs" role="tablist">
        {TABS.map(([t, label]) => (
          <button key={t} role="tab" aria-selected={tab === t} className={tab === t ? 'on' : ''} onClick={() => setTab(t)}>{label}</button>
        ))}
      </div>
      {tab === 'emoji' && <div className="icon-grid emoji-grid">{EMOJI.map((e) => tile('emoji', e.id, 'Смайл'))}</div>}
      {tab === 'stickers' && <div className="icon-grid sticky-grid">{STICKY_COLORS.map((c) => tile('sticky', c, `Стикер ${c}`))}</div>}
      {tab === 'icons' && (
        <>
          <input ref={input} id="icon-search" type="search" placeholder="Найти иконку" aria-label="Найти иконку"
            autoComplete="off" value={q} onChange={(e) => setQ(e.target.value)} />
          <div className="icon-grid">{found.map((i) => tile('icon', i.id, i.ru))}</div>
          {!found.length && <p className="muted">Ничего не нашлось</p>}
        </>
      )}
      {/* The picker is a transformed box, so the ghost goes to the body to be placed by the screen. */}
      {ghost && createPortal(
        <div className={`pick-ghost ${ghost.kind}`} style={{ left: ghost.x, top: ghost.y }}><Tile kind={ghost.kind} id={ghost.id} /></div>,
        document.body,
      )}
    </div>
  );
}
