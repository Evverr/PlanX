import { useEffect, useRef, type PointerEvent as ReactPointerEvent, type RefObject } from 'react';

export type Edge = 'top' | 'bottom' | 'left' | 'right';

/** How close to a panel's edge the pointer (or a finger) has to be to take hold of it, and how long
 *  the mouse has to rest there before the cursor shows it can. */
const ZONE = 8, ZONE_FINGER = 14, WAIT = 500;
/** Once an edge's cursor has been waited for, every panel's edges show theirs at once, until the
 *  pointer has been off them this long (as with the hints). */
const GRACE = 1200;
let warmTill = 0;

/** A drag from a panel's edge: told how far the pointer has gone, and when it's let go. */
export interface GripDrag { move: (dx: number, dy: number) => void; done: () => void }
export type Grips = Partial<Record<Edge, { cursor: string; start: () => GripDrag | null }>>;

/**
 * Edges of a panel that can be dragged (to move it, or to make it longer or shorter): resting the
 * mouse on one for half a second shows its cursor (then at once on any panel's edges, till it has
 * been off them a while), and only then does a press there take hold (a finger takes hold at once). Put the handlers on the panel, before its own, and let it handle
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
  const drop = () => {
    if (armed.current) warmTill = performance.now() + GRACE;
    clearTimeout(timer.current);
    pending.current = null;
    armed.current = null;
    cursor('');
  };
  const arm = (edge: Edge) => { armed.current = edge; warmTill = Infinity; cursor(grips[edge]!.cursor); };
  return {
    onPointerMove(e: ReactPointerEvent) {
      if (held.current) return;
      const edge = e.buttons ? null : edgeAt(e);
      if (edge === pending.current) return;
      drop();
      pending.current = edge;
      if (!edge) return;
      if (performance.now() < warmTill) arm(edge);
      else timer.current = window.setTimeout(() => arm(edge), WAIT);
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
      ref.current?.classList.add('gripped');
      const move = (ev: PointerEvent) => drag.move(ev.clientX - x0, ev.clientY - y0);
      const up = () => {
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
        window.removeEventListener('pointercancel', up);
        document.body.style.cursor = '';
        ref.current?.classList.remove('gripped');
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
