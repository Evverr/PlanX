import { useEffect, useLayoutEffect, useState, type CSSProperties } from 'react';
import { EDGE } from '../../layout';
import { isSeparator, type useSortable } from '../sortable';
import { useGrip } from './grip';
import { dragAlong, overPanels, usePanelNumber } from './store';

/** An upright panel: the tool rail, or another like it. */
export interface RailSetup {
  /** Its name in the page: data-<name> says it's at the other edge ("right" or "left"). */
  name: string;
  /** The edge it stands by unless moved. */
  home: 'left' | 'right';
  /** Where its chosen length, its top and its being at the other edge are kept. */
  keys: { cap: string; top: string; far: string };
  /** Which of its buttons are on it now, when not all of them are. */
  present?: (key: string) => boolean;
}

/** The tool rail's. */
const TOOL_RAIL: RailSetup = { name: 'rail', home: 'left', keys: { cap: 'planx-tools-cap', top: 'planx-tools-top', far: 'planx-tools-right' } };

/**
 * The tool rail's place and length: centred on the screen by default, as long as the screen allows
 * (what doesn't fit goes under its "more" button). By its top edge it moves up or down the screen,
 * and over to the other edge (or back) once past the middle, keeping its length; by its bottom edge
 * it gets longer or shorter a button at a time, down to a single one. Never over another panel.
 * `all` is what's on the rail, in order.
 */
export function useRail(sort: ReturnType<typeof useSortable>, all: string[], s: RailSetup = TOOL_RAIL) {
  const [fit, setFit] = useState(Infinity);
  // How many of its elements the rail keeps, as chosen by dragging its bottom edge; Infinity for all.
  const [capKept, setCapKept] = usePanelNumber(s.keys.cap);
  const cap = capKept && capKept > 0 ? capKept : Infinity;
  const setCap = (n: number) => setCapKept(n === Infinity ? null : n);
  // Where its top is, once it's been moved (or made longer or shorter) by hand; till then (null)
  // it's centred on the screen.
  const [top, setTop] = usePanelNumber(s.keys.top);
  const [far, setFar] = usePanelNumber(s.keys.far);
  const right = (s.home === 'right') !== !!far;
  // Room kept clear above it (the top bar, 12px off the edge and 12px from the rail) and as much
  // below it, whatever size the panels are.
  const clear = 24 + (document.querySelector<HTMLElement>('.topbar')?.offsetHeight || 52);
  useEffect(() => {
    document.documentElement.dataset[s.name] = far ? (s.home === 'left' ? 'right' : 'left') : '';
    window.dispatchEvent(new Event('planx:side-panels'));
  }, [far, top, s.name, s.home]);

  /** The rail's height with its first n elements (and the "more" button when that's not all of them). */
  const height = (n: number): number | null => {
    const el = sort.ref.current, btn = el?.querySelector<HTMLElement>('.fb');
    if (!el || !btn) return null;
    const cs = getComputedStyle(el), gap = parseFloat(cs.rowGap) || 0;
    const pad = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom);
    const ks = n >= all.length ? all : [...sort.visible(s.present, n), 'more'];
    const sepH = el.querySelector<HTMLElement>('.tsep')?.offsetHeight ?? 7;
    return pad + ks.reduce((t, k) => t + (isSeparator(k) ? sepH : btn.offsetHeight), 0) + gap * (ks.length - 1);
  };
  // Centred: clear of the top bar above and as far from the bottom edge. Put by hand: from there down
  // to near the bottom.
  const room = (from = top) => (from === null ? innerHeight - clear * 2 : innerHeight - EDGE - from);
  useLayoutEffect(() => {
    if (height(all.length) === null) return;
    // On a screen grown shorter, a rail put low comes up to keep at least one button in sight.
    const lowest = Math.max(EDGE, innerHeight - EDGE - height(1)!);
    if (top !== null && top > lowest) { setTop(lowest); return; }
    let n = Math.min(all.length, cap);
    while (n > 1 && height(n)! > room()) n--;
    const next = n >= all.length ? Infinity : n;
    if (next !== fit) setFit(next);
    // Measuring went through other lengths: the rail's list is the one on screen again.
    else sort.visible(s.present, fit);
  });

  const grip = useGrip(sort.ref, {
    top: {
      cursor: 'move',
      start: () => {
        const r = sort.ref.current!.getBoundingClientRect();
        // Moving it keeps its length: as many buttons as it shows now, whatever room it finds.
        if (fit !== Infinity && fit < cap) setCap(fit);
        return {
          move: (dx, dy) => {
            const { at, past } = dragAlong(r, dx, dy, 'y');
            // Not over another panel: it stays where it last could be.
            const margin = right ? innerWidth - r.right : r.left;
            if (overPanels({ left: past ? innerWidth - margin - r.width : margin, top: at, width: r.width, height: r.height }, sort.ref.current)) return;
            setTop(at);
            setFar(past !== (s.home === 'right') ? 1 : null);
          },
          done: () => {},
        };
      },
    },
    bottom: {
      cursor: 'ns-resize',
      start: () => {
        const r = sort.ref.current!.getBoundingClientRect();
        const heights = all.map((_, i) => height(i + 1)!);
        sort.visible(s.present, fit);
        // A centred rail stays where it is from now on, its top held, and the edge keeps up with the pointer.
        setTop(r.top);
        return {
          move: (_, dy) => {
            const want = r.height + dy;
            let best = 0, most = 0;
            heights.forEach((h, i) => {
              if (h > room(r.top)) return;
              most = i;
              // Not over another panel.
              if (h > r.height && overPanels({ left: r.left, top: r.top, width: r.width, height: h }, sort.ref.current)) return;
              // Of lengths alike (the last button in place of "more"), the one with more buttons.
              if (Math.abs(h - want) <= Math.abs(heights[best] - want)) best = i;
            });
            // As long as the screen allows is all of it: on a taller screen it's longer again.
            setCap(best >= most ? Infinity : best + 1);
          },
          done: () => {},
        };
      },
    },
  });

  return {
    grip,
    /** How many of its elements the rail shows (Infinity for all). */
    fit,
    /** The room kept clear above it, which its "more" column stays under too. */
    clear,
    style: (top !== null ? { top, transform: 'none' } : undefined) as CSSProperties | undefined,
  };
}
