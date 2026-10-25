import { useEffect, useReducer, useRef, useState } from 'react';
import { moreCol } from '../ui/Toolbar';
import { PanelIcon, type PanelIconName } from '../ui/PanelIcon';
import { useRail } from '../ui/panels/rail';
import { panelScale, usePanelSize } from '../ui/panels/size';
import { useSortable } from '../ui/sortable';

export interface RailButton { icon: PanelIconName; title: string; on?: boolean; onClick: () => void }

/** Their order on the rail, top to bottom, until someone rearranges it. */
const ORDER = ['export', 'search', 'timer', 'laser', 'follow', 'keys'];

/**
 * The trial features' buttons, on a rail like the tool rail at the right edge: its buttons
 * rearranged by holding them, the rail moved by its top edge (over to the left edge too) and
 * shortened by its bottom one, what doesn't fit going under "more". `buttons` are the ones
 * switched on.
 */
export function LabsRail({ buttons, docked }: { buttons: Partial<Record<string, RailButton>>; docked: boolean }) {
  const sort = useSortable('planx-labs-order', ORDER, 'y');
  const present = (k: string) => !!buttons[k];
  const all = sort.visible(present);
  const rail = useRail(sort, all, { name: 'labs', home: 'right', keys: { cap: 'planx-labs-cap', top: 'planx-labs-top', far: 'planx-labs-left' }, present });
  const [panelSize] = usePanelSize();
  const [moreOpen, setMoreOpen] = useState(false);
  const moreRef = useRef<HTMLButtonElement>(null), menuRef = useRef<HTMLDivElement | null>(null);
  const [, redraw] = useReducer((n: number) => n + 1, 0);
  useEffect(() => {
    window.addEventListener('resize', redraw);
    return () => window.removeEventListener('resize', redraw);
  }, []);
  const main = sort.visible(present, rail.fit);
  const hidden = all.filter((k) => !main.includes(k));
  useEffect(() => {
    if (!moreOpen) return;
    const close = (e: PointerEvent) => {
      const t = e.target as Node;
      if (!menuRef.current?.contains(t) && !moreRef.current?.contains(t)) setMoreOpen(false);
    };
    window.addEventListener('pointerdown', close, true);
    return () => window.removeEventListener('pointerdown', close, true);
  }, [moreOpen]);
  if (moreOpen && !hidden.length) setMoreOpen(false);
  // As the tool rail's: level with the rail's bottom edge, in as many columns as it takes.
  const railBottom = sort.ref.current?.getBoundingClientRect().bottom ?? innerHeight / 2;
  const col = moreCol(panelSize === 'l' ? 1 : panelScale());
  const moreRows = Math.max(1, Math.min(hidden.length, Math.floor((railBottom - rail.clear - col.pad + col.gap) / (col.size + col.gap))));
  const moreZone = sort.moreZone(hidden);
  if (!all.length) return null;

  const button = (key: string, inMenu = false) => {
    const b = buttons[key]!;
    return (
      <button key={key} {...(inMenu ? sort.moreItem(key) : sort.item(key))} className={`fb ${b.on ? 'on' : ''} ${sort.lifted(key) ? 'lifted' : ''}`}
        title={b.title} aria-label={b.title.replace(/ \(.*\)$/, '')} aria-pressed={b.on}
        onClick={() => { b.onClick(); if (inMenu) setMoreOpen(false); }}>
        <PanelIcon name={b.icon} />
      </button>
    );
  };
  return (
    <>
      <nav ref={sort.ref} className={`tools labs-rail sortable ${docked ? 'docked' : ''} ${sort.sorting ? 'sorting' : ''}`} aria-label="Нововведения"
        {...sort.container}
        style={rail.style}
        onPointerDown={(e) => { if (!rail.grip.onPointerDown(e)) sort.container.onPointerDown(e); }}
        onPointerMove={(e) => { if (!sort.sorting) rail.grip.onPointerMove(e); sort.container.onPointerMove(e); }}
        onPointerLeave={rail.grip.onPointerLeave}>
        {main.map((k) => button(k))}
        {hidden.length > 0 && (
          <button ref={moreRef} className={`fb ${moreOpen ? 'on' : ''}`} title="Ещё" aria-label="Ещё" aria-expanded={moreOpen} data-nosort
            onClick={() => setMoreOpen(!moreOpen)}>
            <PanelIcon name="more" />
          </button>
        )}
      </nav>
      {moreOpen && hidden.length > 0 && (
        <div {...moreZone} ref={(el) => { menuRef.current = el; moreZone.ref(el); }} className={`tools-more labs-more sortable ${sort.sorting ? 'sorting' : ''}`}
          role="toolbar" aria-label="Ещё нововведения" aria-orientation="vertical"
          style={{ bottom: innerHeight - railBottom, gridTemplateRows: `repeat(${moreRows}, ${col.size}px)` }}>
          {hidden.map((k) => button(k, true))}
        </div>
      )}
    </>
  );
}
