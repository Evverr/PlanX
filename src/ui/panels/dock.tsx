import { useEffect, useRef, useState } from 'react';
import { PanelIcon } from '../PanelIcon';
import { readText, writeText } from '../../storage';
import { onPanelsReset } from './store';

export type Edge = 'left' | 'top' | 'right' | 'bottom';

/** Whether a panel is stuck to its screen edge, remembered per panel in this browser right away;
 *  "Сбросить панели" unsticks it (and its undo sticks it back). */
export function useDock(name: string): [boolean, () => void] {
  const key = `planx-dock-${name}`;
  const [docked, setDocked] = useState(() => readText(key) === '1');
  const set = (v: boolean) => { setDocked(v); writeText(key, v ? '1' : '0'); };
  const now = useRef(docked);
  now.current = docked;
  useEffect(() => onPanelsReset(() => {
    const was = now.current;
    if (was) set(false);
    return () => { if (was) set(true); };
  }), []); // eslint-disable-line react-hooks/exhaustive-deps
  return [docked, () => set(!docked)];
}

/** The chevron points at the edge the panel can stick to, and turns around once it has. */
const TURN: Record<Edge, number> = { left: 0, top: 90, right: 180, bottom: 270 };

export function DockButton({ edge, docked, onToggle, className = 'ib' }: {
  edge: Edge; docked: boolean; onToggle: () => void; className?: string;
}) {
  const label = docked ? 'Открепить от края' : 'Прикрепить к краю';
  return (
    <button className={`${className} dock`} title={label} aria-label={label} aria-pressed={docked} onClick={onToggle}>
      <PanelIcon name="chevron-left" className="dock-chevron" style={{ transform: `rotate(${TURN[edge] + (docked ? 180 : 0)}deg)` }} />
    </button>
  );
}
