import { useState } from 'react';
import { PanelIcon } from './PanelIcon';

export type Edge = 'left' | 'top' | 'right' | 'bottom';

/** Whether a panel is stuck to its screen edge, remembered per panel in this browser. */
export function useDock(name: string): [boolean, () => void] {
  const key = `planx-dock-${name}`;
  const [docked, setDocked] = useState(() => {
    try { return localStorage.getItem(key) === '1'; } catch { return false; }
  });
  const toggle = () => {
    setDocked(!docked);
    try { localStorage.setItem(key, docked ? '0' : '1'); } catch { /* just won't be remembered */ }
  };
  return [docked, toggle];
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
