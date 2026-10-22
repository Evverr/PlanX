import { cloneElement, useLayoutEffect, useRef, useState, type MouseEvent, type PointerEvent, type ReactElement } from 'react';

/** How long to hold a button before it lifts, and how far the pointer may wander meanwhile; a lifted
 *  button let go without moving more than HOLD_SLOP still counts as a click. */
const HOLD_MS = 168, HOLD_SLOP = 6;

/** Separators are items too, keyed 'sep…' (a line) or 'gap…' (a space). */
export const isSeparator = (key: string) => key.startsWith('sep') || key.startsWith('gap');

/** The saved order (with renamed keys renamed), minus anything no longer in the panel, plus anything new at the end. */
function readOrder(storageKey: string, defaults: string[], renames: Record<string, string>): string[] {
  try {
    let saved = JSON.parse(localStorage.getItem(storageKey) ?? 'null');
    if (Array.isArray(saved)) saved = saved.map((k) => renames[k] ?? k);
    if (Array.isArray(saved)) return [...saved.filter((k) => defaults.includes(k)), ...defaults.filter((k) => !saved.includes(k))];
  } catch { /* storage can be unavailable */ }
  return defaults;
}

/**
 * Lets people rearrange a panel's buttons: hold one to lift it, drag it along the panel, and the
 * others slide out of the way. The order is kept per browser under `storageKey`.
 *
 * Put `container` on the panel and `item(key)` on each button; mark parts that must not start a
 * drag (text fields, open menus) with data-nosort. When a button takes over another's place under
 * a new key, `renames` maps the old key to it so saved orders keep it there.
 */
export function useSortable(storageKey: string, defaults: string[], axis: 'x' | 'y', renames: Record<string, string> = {}) {
  const [order, setOrder] = useState(() => readOrder(storageKey, defaults, renames));
  const [drag, setDrag] = useState<{ key: string; grab: number; at: number; at0: number; moved: boolean } | null>(null);
  const press = useRef<{ x: number; y: number; timer: number } | null>(null);
  const ref = useRef<HTMLElement>(null);
  const els = useRef(new Map<string, HTMLElement>());
  const offsets = useRef(new Map<string, number>());
  const swallowClick = useRef(false);
  const shown = useRef<string[]>(order);

  const pos = (e: { clientX: number; clientY: number }) => (axis === 'y' ? e.clientY : e.clientX);
  const offset = (el: HTMLElement) => (axis === 'y' ? el.offsetTop : el.offsetLeft);
  const size = (el: HTMLElement) => (axis === 'y' ? el.offsetHeight : el.offsetWidth);
  const naturalStart = (key: string) => {
    const r = ref.current!.getBoundingClientRect();
    return (axis === 'y' ? r.top : r.left) + offset(els.current.get(key)!);
  };
  const shift = (d: number) => (axis === 'y' ? `translateY(${d}px)` : `translateX(${d}px)`);

  // The lifted button follows the pointer, wherever its slot is now.
  useLayoutEffect(() => {
    if (!drag) return;
    els.current.get(drag.key)!.style.transform = `${shift(drag.at - drag.grab - naturalStart(drag.key))} scale(1.12)`;
  });
  // Buttons that changed places slide into their new ones.
  useLayoutEffect(() => {
    for (const [key, el] of els.current) {
      const before = offsets.current.get(key), now = offset(el);
      offsets.current.set(key, now);
      if (before !== undefined && before !== now && key !== drag?.key) {
        el.animate([{ transform: shift(before - now) }, { transform: 'none' }], { duration: 150, easing: 'ease-out' });
      }
    }
  }, [order]); // eslint-disable-line react-hooks/exhaustive-deps

  const onPointerDown = (e: PointerEvent<HTMLElement>) => {
    const target = e.target as Element;
    const el = target.closest<HTMLElement>('[data-key]');
    if (!el || e.button !== 0 || target.closest('[data-nosort]') || !ref.current?.contains(el)) return;
    const key = el.dataset.key!;
    press.current = {
      x: e.clientX, y: e.clientY,
      timer: window.setTimeout(() => {
        const p = press.current;
        const at = p ? (axis === 'y' ? p.y : p.x) : pos(e);
        press.current = null;
        const r = el.getBoundingClientRect();
        setDrag({ key, grab: at - (axis === 'y' ? r.top : r.left), at, at0: at, moved: false });
      }, HOLD_MS),
    };
  };
  const onPointerMove = (e: PointerEvent<HTMLElement>) => {
    const p = press.current;
    if (p && Math.hypot(e.clientX - p.x, e.clientY - p.y) > HOLD_SLOP) { clearTimeout(p.timer); press.current = null; }
    if (p) { p.x = e.clientX; p.y = e.clientY; }
    if (!drag) return;
    const at = pos(e);
    // The pointer is only captured once the button really moves, so that letting go in place
    // still lands on the button as a click.
    const moved = drag.moved || Math.abs(at - drag.at0) > HOLD_SLOP;
    if (moved && !drag.moved) e.currentTarget.setPointerCapture(e.pointerId);
    // Swap with the neighbour on screen once the lifted button's middle passes the neighbour's.
    const list = shown.current, i = list.indexOf(drag.key);
    const middle = (k: string) => naturalStart(k) + size(els.current.get(k)!) / 2;
    const mid = at - drag.grab + size(els.current.get(drag.key)!) / 2;
    const other = i + 1 < list.length && mid > middle(list[i + 1]) ? list[i + 1] : i > 0 && mid < middle(list[i - 1]) ? list[i - 1] : null;
    if (other) {
      const next = [...order], a = next.indexOf(drag.key), b = next.indexOf(other);
      [next[a], next[b]] = [next[b], next[a]];
      setOrder(next);
    }
    setDrag({ ...drag, at, moved });
  };
  const onPointerUp = () => {
    if (press.current) { clearTimeout(press.current.timer); press.current = null; }
    if (!drag) return;
    // Settle into the slot from wherever it was let go, and don't count the release as a click.
    const el = els.current.get(drag.key)!;
    const from = el.style.transform;
    el.style.transform = '';
    el.animate([{ transform: from }, { transform: 'none' }], { duration: 150, easing: 'ease-out' });
    setDrag(null);
    if (!drag.moved) return;
    try { localStorage.setItem(storageKey, JSON.stringify(order)); } catch { /* just won't be remembered */ }
    swallowClick.current = true;
    setTimeout(() => { swallowClick.current = false; }, 0);
  };

  return {
    ref,
    sorting: !!drag,
    container: {
      onPointerDown, onPointerMove, onPointerUp, onPointerCancel: onPointerUp,
      onClickCapture: (e: MouseEvent) => { if (swallowClick.current) { e.stopPropagation(); e.preventDefault(); } },
      onContextMenu: (e: MouseEvent) => { if (drag) e.preventDefault(); },
    },
    /** Props for one item: where to find it and what it's called. */
    item: (key: string) => ({
      'data-key': key,
      ref: (el: HTMLElement | null) => { if (el) els.current.set(key, el); else els.current.delete(key); },
    }),
    lifted: (key: string) => drag?.key === key,
    /** Draws the panel's elements (by key) in order, each with its key, ref and 'lifted' class;
     *  elements left out of `items` are skipped. */
    render(items: Partial<Record<string, ReactElement>>): ReactElement[] {
      return this.visible((k) => !!items[k]).map((k) => {
        const el = items[k]!;
        const className = [el.props.className, drag?.key === k && 'lifted'].filter(Boolean).join(' ');
        return cloneElement(el, { key: k, ...this.item(k), className });
      });
    },
    /** Keys to draw, in order: those `present` keeps, without separators left at an end or doubled up. */
    visible: (present: (key: string) => boolean = () => true): string[] => {
      const out: string[] = [];
      for (const k of order.filter(present)) {
        if (isSeparator(k) && (!out.length || isSeparator(out[out.length - 1]))) continue;
        out.push(k);
      }
      while (out.length && isSeparator(out[out.length - 1])) out.pop();
      shown.current = out;
      return out;
    },
  };
}
