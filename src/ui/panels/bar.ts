import { useEffect, useLayoutEffect, useState, type RefObject } from 'react';
import { EDGE } from '../../layout';
import { useGrip, type Grips } from './grip';
import { dragAlong, overPanels, usePanelNumber } from './store';

/** A bar along the top or bottom of the screen: the top bar or the zoom bar. */
export interface BarSetup {
  /** Its name in the page: data-<name> says it's at the other edge ("low" or "high"), and
   *  --<name>-l / --<name>-r are its left end and its right end's distance from the screen's right,
   *  for what stands by it (the board menu, the map, the hints). */
  name: 'topbar' | 'zoom';
  /** The edge it stands by unless moved, and the end of the screen it stands from. */
  home: 'top' | 'bottom';
  from: 'left' | 'right';
  /** Where its place, its length and its being at the other edge are kept. */
  keys: { x: string; w: string; far: string };
  docked: boolean;
}

/**
 * A bar moved and made shorter by hand: dragging its left end moves it along its edge, or over to the
 * other edge of the screen once past the middle; dragging its right end makes it shorter or longer,
 * what doesn't fit going under "more". Never over another panel. Once moved (or resized), it stands
 * from its left end.
 */
export function useBar(ref: RefObject<HTMLElement | null>, s: BarSetup) {
  const [x, setX] = usePanelNumber(s.keys.x);
  const [w, setW] = usePanelNumber(s.keys.w);
  const [far, setFar] = usePanelNumber(s.keys.far);
  // Till it's been moved, a bar standing from the right stands 12px off it, counted from the left all
  // the same (by its width), so it slides back there when put back as by default.
  const [width, setWidth] = useState(0);
  const left = x ?? (s.from === 'right' && width ? innerWidth - EDGE - width : null);
  useLayoutEffect(() => {
    const el = ref.current, root = document.documentElement;
    if (el && el.offsetWidth !== width) setWidth(el.offsetWidth);
    const r = el?.getBoundingClientRect();
    if (x === null || !r) {
      root.style.removeProperty(`--${s.name}-l`);
      root.style.removeProperty(`--${s.name}-r`);
    } else {
      root.style.setProperty(`--${s.name}-l`, `${Math.round(r.left)}px`);
      root.style.setProperty(`--${s.name}-r`, `${Math.round(innerWidth - r.right)}px`);
    }
  });
  useEffect(() => {
    document.documentElement.dataset[s.name] = far ? (s.home === 'top' ? 'low' : 'high') : '';
    window.dispatchEvent(new Event('planx:side-panels'));
  }, [far, x, s.name, s.home]);

  const high = s.home === 'top';
  const grips: Grips = {
    left: {
      cursor: 'move',
      start: () => {
        const r = ref.current!.getBoundingClientRect();
        return {
          move: (dx, dy) => {
            const { at, past } = dragAlong(r, dx, dy, 'x'), f = high ? past : !past;
            // Where that puts it (12px from the edge, as every panel): not over another panel; it
            // stays where it last could be.
            const onTop = high !== f, gap = s.docked ? 0 : EDGE;
            if (overPanels({ left: at, top: onTop ? gap : innerHeight - gap - r.height, width: r.width, height: r.height }, ref.current)) return;
            setX(at);
            setFar(f ? 1 : null);
          },
          done: () => {},
        };
      },
    },
    right: {
      cursor: 'ew-resize',
      start: () => {
        const r = ref.current!.getBoundingClientRect();
        // Its left end holds still while the right one follows the pointer.
        setX(r.left);
        return {
          move: (dx) => {
            // Not over another panel: it stops short of it.
            let len = Math.max(0, r.width + dx);
            const over = (v: number) => overPanels({ left: r.left, top: r.top, width: v, height: r.height }, ref.current);
            while (len > 0 && len > r.width && over(len)) len -= 4;
            setW(len);
          },
          // Settles at the length it shows; with nothing left over, it's as long as it needs.
          done: () => {
            const el = ref.current;
            setW(el?.querySelector(':scope > .more-wrap') ? el.getBoundingClientRect().width : null);
          },
        };
      },
    },
  };
  const grip = useGrip(ref, grips);
  const onTop = high !== !!far;
  return {
    grip,
    style: left !== null ? { left, right: 'auto' } : undefined,
    /** How long it may be, for its "more" button to take what doesn't fit. */
    space: Math.min(innerWidth - (x ?? EDGE) - EDGE, w ?? Infinity),
    /** Which way its "more" popover opens: away from its edge. */
    place: (onTop ? 'below' : 'above') as 'below' | 'above',
  };
}
