import { useEffect, useReducer, useRef, useState, useSyncExternalStore } from 'react';
import type { Editor } from '../editor/editor';
import { boxOf } from '../canvas/geometry';
import { searchIcons, ICONS } from '../icons/icons';
import { onEmojiLoad } from '../emoji/emoji';
import { IconSections, pickerOrder, Tile } from '../ui/IconPicker';
import { SHAPES } from '../ui/ShapePanel';
import { DOODLES, doodle } from '../canvas/doodles';
import { PanelIcon } from '../ui/PanelIcon';
import { shapeOf, SWAP_EVENT, swapKind, swapPatch } from './swap';

/** How far under the item the popup comes. */
const GAP = 12;

/**
 * "Замена двойным кликом": the neighbours of the emoji, icon or shape double-clicked, in a popup
 * under it; one picked takes its place (the popup stays, to try another). Esc, a press beside it
 * or the item going away closes it.
 */
export function SwapPop({ editor }: { editor: Editor }) {
  const [id, setId] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const ref = useRef<HTMLDivElement>(null);
  useSyncExternalStore(editor.subscribeUI, editor.getUI);
  useSyncExternalStore(editor.board.subscribe, editor.board.getVersion);
  const [, redraw] = useReducer((n: number) => n + 1, 0);
  useEffect(() => onEmojiLoad(redraw), []);

  useEffect(() => {
    const open = (e: Event) => { setId((e as CustomEvent<string>).detail); setQ(''); };
    const close = () => setId(null);
    window.addEventListener(SWAP_EVENT, open);
    window.addEventListener('planx:close-popovers', close);
    return () => { window.removeEventListener(SWAP_EVENT, open); window.removeEventListener('planx:close-popovers', close); };
  }, []);
  useEffect(() => {
    if (!id) return;
    const away = (e: PointerEvent) => { if (!ref.current?.contains(e.target as Node)) setId(null); };
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') setId(null); };
    window.addEventListener('pointerdown', away, true);
    window.addEventListener('keydown', key);
    return () => { window.removeEventListener('pointerdown', away, true); window.removeEventListener('keydown', key); };
  }, [id]);

  const it = id ? editor.board.get(id) : undefined, kind = swapKind(it);
  useEffect(() => { if (id && !kind) setId(null); }, [id, kind]);
  if (!it || !kind || !editor.canvas) return null;

  const r = editor.canvas.getBoundingClientRect(), b = boxOf(it);
  const top = editor.toScreen({ x: b.x, y: b.y + b.h });
  const now = kind === 'emoji' ? it.emoji : kind === 'icon' ? it.icon : kind === 'doodle' ? it.doodle : shapeOf(it);
  const pick = (to: string) => {
    if (to === now) return;
    editor.board.update(it.id, swapPatch(it, kind, to));
  };
  const tile = (key: string, label: string, body: React.ReactNode) => (
    <button key={key} className={key === now ? 'on' : ''} title={kind === 'emoji' ? undefined : label} aria-label={label} aria-pressed={key === now}
      onPointerDown={(e) => e.preventDefault()} onClick={() => pick(key)}>{body}</button>
  );
  const found = kind === 'icon' ? new Set(searchIcons(q).map((i) => i.id)) : null;
  const icons = kind === 'icon' ? pickerOrder('icon').filter((i) => found!.has(i)) : [];

  return (
    <div ref={ref} className={`pop swap-pop ${kind}`} role="dialog" aria-label="Заменить на соседний"
      style={{ left: Math.max(8, Math.min(window.innerWidth - 340, r.left + top.x)), top: Math.min(window.innerHeight - 120, r.top + top.y + GAP) }}>
      {kind === 'emoji' && <div className="icon-grid emoji-grid">{pickerOrder('emoji').map((e) => tile(e, 'Смайл', <Tile kind="emoji" id={e} />))}</div>}
      {kind === 'icon' && (
        <>
          <input type="search" placeholder="Найти иконку" aria-label="Найти иконку" autoComplete="off" value={q} onChange={(e) => setQ(e.target.value)} />
          <IconSections ids={icons} tile={(i) => tile(i, ICONS.find((d) => d.id === i)?.ru ?? i, <Tile kind="icon" id={i} />)} />
          {!icons.length && <p className="muted">Ничего не нашлось</p>}
        </>
      )}
      {/* A game sticker: the others of its set. */}
      {kind === 'doodle' && <div className="icon-grid doodle-grid">{DOODLES.filter((d) => d.set === doodle(it.doodle)?.set).map((d) => tile(d.id, d.name, <Tile kind="doodle" id={d.id} />))}</div>}
      {kind === 'shape' && <div className="icon-grid shape-grid">{SHAPES.map(([t, icon, label]) => tile(t, label.replace(/ \(.*\)$/, ''), <PanelIcon name={icon} />))}</div>}
    </div>
  );
}
