import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { Editor } from '../editor/editor';
import type { Item } from '../model/types';
import { boxOf, instanceBounds } from '../canvas/geometry';
import { subscribeTidy, tidyMatches, tidyNow } from './tidy';
import { holds } from './tidyMind';

/**
 * "Панель над элементом" (src/labs): one selection panel, over what's picked; at the bottom instead
 * where it would be in the way there: what's picked more than half the screen across or high (big, or
 * several far apart) or partly off it, or the handles of «Авторасположение» up (it would lie over
 * them). While the board is moved or zoomed it's away, and back once it's still.
 */
export function panelPlace(ed: Editor, items: Item[]): 'over' | 'bottom' {
  if (!items.length || tidyMatches(ed) || holds(ed)) return 'bottom';
  const all = ed.board.list(), boxes = items.map((i) => (i.inst ? instanceBounds(i, all) : boxOf(i)));
  const a = ed.toScreen({ x: Math.min(...boxes.map((b) => b.x)), y: Math.min(...boxes.map((b) => b.y)) });
  const b = ed.toScreen({ x: Math.max(...boxes.map((r) => r.x + r.w)), y: Math.max(...boxes.map((r) => r.y + r.h)) });
  const W = ed.canvas?.clientWidth ?? innerWidth, H = ed.canvas?.clientHeight ?? innerHeight;
  const big = b.x - a.x > W / 2 || b.y - a.y > H / 2, off = a.x < 0 || a.y < 0 || b.x > W || b.y > H;
  return big || off ? 'bottom' : 'over';
}

/** Where the selection panel goes now (see panelPlace), worked out once the board stands still (0.2 s
 *  after it's last moved or zoomed). */
export function usePanelPlace(ed: Editor, items: Item[]): 'over' | 'bottom' | null {
  useSyncExternalStore(subscribeTidy, tidyNow);
  const key = `${ed.cam.x}|${ed.cam.y}|${ed.cam.z}`, first = useRef(key);
  const [still, setStill] = useState(true);
  useEffect(() => {
    if (key === first.current) return;
    first.current = '';
    setStill(false);
    const t = setTimeout(() => setStill(true), 200);
    return () => clearTimeout(t);
  }, [key]);
  // Meanwhile, where it was before (or nowhere, if over what's picked): not hopping as it goes.
  const settled = useRef<'over' | 'bottom'>('bottom');
  if (still) settled.current = panelPlace(ed, items);
  return still || settled.current === 'bottom' ? settled.current : null;
}
