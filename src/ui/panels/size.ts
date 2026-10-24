import { useEffect, useState } from 'react';
import { readText, writeText } from '../../storage';

/** The panels' size (the board menu's three dots): large as by default, medium or small, for every
 *  panel at once, kept right away, as a setting rather than a place. */
export type PanelSize = 'l' | 'm' | 's';
const SIZE_KEY = 'planx-panel-size';
let size: PanelSize = (() => {
  const v = readText(SIZE_KEY);
  if (v === 'm' || v === 's') return v;
  return readText('planx-compact') === '1' ? 's' : 'l';
})();
const sizeFns = new Set<(v: PanelSize) => void>();
// The styles scale the panels by the size (--k) under data-compact; data-size picks how much.
const showSize = () => {
  const root = document.documentElement;
  if (size === 'l') { delete root.dataset.compact; delete root.dataset.size; } else { root.dataset.compact = ''; root.dataset.size = size; }
};
if (typeof document !== 'undefined') showSize();

export function usePanelSize(): [PanelSize, (v: PanelSize) => void] {
  const [v, setV] = useState(size);
  useEffect(() => { sizeFns.add(setV); return () => { sizeFns.delete(setV); }; }, []);
  const set = (n: PanelSize) => {
    size = n;
    writeText(SIZE_KEY, n === 'l' ? null : n);
    writeText('planx-compact', null);
    showSize();
    sizeFns.forEach((f) => f(n));
    window.dispatchEvent(new Event('planx:side-panels'));
  };
  return [v, set];
}

/** How the panels are scaled now (--k in the styles: 1, or less with smaller panels). */
export function panelScale(): number {
  const k = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--k'));
  return k > 0 ? k : 1;
}
