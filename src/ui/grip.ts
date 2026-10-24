import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type RefObject } from 'react';

export type Edge = 'top' | 'bottom' | 'left' | 'right';

/** How close to a panel's edge the pointer (or a finger) has to be to take hold of it, and how long
 *  the mouse has to rest there before the cursor shows it can. */
const ZONE = 8, ZONE_FINGER = 14, WAIT = 500;

/** A drag from a panel's edge: told how far the pointer has gone, and when it's let go. */
export interface GripDrag { move: (dx: number, dy: number) => void; done: () => void }
export type Grips = Partial<Record<Edge, { cursor: string; start: () => GripDrag | null }>>;

/**
 * Edges of a panel that can be dragged (to move it, or to make it longer or shorter): resting the
 * mouse on one for half a second shows its cursor, and only then does a press there take hold (a
 * finger takes hold at once). Put the handlers on the panel, before its own, and let it handle
 * the press when onPointerDown says it didn't.
 */
export function useGrip(ref: RefObject<HTMLElement | null>, grips: Grips) {
  const timer = useRef(0), pending = useRef<Edge | null>(null), armed = useRef<Edge | null>(null), held = useRef(false);
  useEffect(() => () => clearTimeout(timer.current), []);
  const cursor = (c: string) => { if (ref.current) ref.current.style.cursor = c; };
  const edgeAt = (e: ReactPointerEvent): Edge | null => {
    const r = ref.current?.getBoundingClientRect();
    if (!r) return null;
    const z = e.pointerType === 'touch' ? ZONE_FINGER : ZONE, x = e.clientX, y = e.clientY;
    const across = x >= r.left && x <= r.right, along = y >= r.top && y <= r.bottom;
    const at: Record<Edge, boolean> = {
      top: across && y >= r.top && y - r.top <= z, bottom: across && y <= r.bottom && r.bottom - y <= z,
      left: along && x >= r.left && x - r.left <= z, right: along && x <= r.right && r.right - x <= z,
    };
    return (Object.keys(grips) as Edge[]).find((k) => at[k]) ?? null;
  };
  const drop = () => { clearTimeout(timer.current); pending.current = null; armed.current = null; cursor(''); };
  return {
    onPointerMove(e: ReactPointerEvent) {
      if (held.current) return;
      const edge = e.buttons ? null : edgeAt(e);
      if (edge === pending.current) return;
      drop();
      pending.current = edge;
      if (edge) timer.current = window.setTimeout(() => { armed.current = edge; cursor(grips[edge]!.cursor); }, WAIT);
    },
    onPointerLeave() { if (!held.current) drop(); },
    /** Whether the press took hold of an edge (and the panel shouldn't handle it). */
    onPointerDown(e: ReactPointerEvent): boolean {
      const edge = e.button === 0 ? edgeAt(e) : null;
      if (!edge || (e.pointerType !== 'touch' && armed.current !== edge)) return false;
      const drag = grips[edge]!.start();
      if (!drag) return false;
      e.preventDefault();
      e.stopPropagation();
      held.current = true;
      const x0 = e.clientX, y0 = e.clientY, c = grips[edge]!.cursor;
      document.body.style.cursor = c;
      const move = (ev: PointerEvent) => drag.move(ev.clientX - x0, ev.clientY - y0);
      const up = () => {
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
        window.removeEventListener('pointercancel', up);
        document.body.style.cursor = '';
        held.current = false;
        drop();
        drag.done();
      };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
      window.addEventListener('pointercancel', up);
      return true;
    },
  };
}

/** A number kept per browser under `key` (null when not set), and a way to set it, remembered or not. */
export function useStoredNumber(key: string): [number | null, (v: number | null, keep?: boolean) => void] {
  const [v, setV] = useState<number | null>(() => {
    try { const s = localStorage.getItem(key); return s === null ? null : Number(s); } catch { return null; }
  });
  const set = (n: number | null, keep = false) => {
    setV(n);
    if (keep) try { if (n === null) localStorage.removeItem(key); else localStorage.setItem(key, String(Math.round(n))); } catch { /* just won't be remembered */ }
  };
  return [v, set];
}
