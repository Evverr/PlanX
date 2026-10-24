import { cloneElement, createElement, useEffect, useLayoutEffect, useRef, useState, type MouseEvent, type PointerEvent as ReactPointerEvent, type ReactElement, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { PanelIcon } from './PanelIcon';

/** How long to hold a button before it lifts, and how far the pointer may wander meanwhile; a lifted
 *  button let go without moving more than HOLD_SLOP still counts as a click. */
const HOLD_MS = 168, HOLD_SLOP = 6;

/** How far past a panel's edge a lifted button has to go before it counts as dragged out of it. */
const OUT_MARGIN = 16;

/** For panels whose buttons can be dragged out onto the board: what follows the pointer once a
 *  button is out (a preview of what it makes, or just its icon), and what letting it go does. */
export interface DropOut {
  preview: (key: string) => ReactNode;
  drop: (key: string, at: { x: number; y: number }) => void;
  /** A button held still: true if that does something of its own (opens its variants), so it
   *  doesn't lift, and letting go isn't a click. Moving it still drags it, out or along the panel. */
  hold?: (key: string) => boolean;
}

/** Separators are items too, keyed 'sep…' (a line) or 'gap…' (a space). */
export const isSeparator = (key: string) => key.startsWith('sep') || key.startsWith('gap');

/** Keys without separators left at either end. */
const trimSeparators = (ks: string[]) => {
  let a = 0, b = ks.length;
  while (a < b && isSeparator(ks[a])) a++;
  while (b > a && isSeparator(ks[b - 1])) b--;
  return ks.slice(a, b);
};

/** The "more" button's width in a bar, with the gap before it. */
const MORE_SIZE = 40;

/** The saved order (with renamed keys renamed), minus anything no longer in the panel, plus anything new at the end. */
export function readOrder(storageKey: string, defaults: string[], renames: Record<string, string>): string[] {
  try {
    let saved = JSON.parse(localStorage.getItem(storageKey) ?? 'null');
    if (Array.isArray(saved)) saved = saved.map((k) => renames[k] ?? k);
    if (Array.isArray(saved)) {
      // A button added since goes where it is by default: before the next one that was already there.
      const order: string[] = saved.filter((k: string) => defaults.includes(k));
      defaults.forEach((k, i) => {
        if (order.includes(k)) return;
        const next = defaults.slice(i + 1).find((d) => order.includes(d));
        order.splice(next ? order.indexOf(next) : order.length, 0, k);
      });
      return order;
    }
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
 *
 * With `dropOut`, a button dragged out of the panel turns into its preview (render `ghost`) and is
 * dropped on the board where it's let go; the panel's order goes back to what it was.
 */
export function useSortable(storageKey: string, defaults: string[], axis: 'x' | 'y', renames: Record<string, string> = {}, dropOut?: DropOut) {
  const [order, setOrder] = useState(() => readOrder(storageKey, defaults, renames));
  const [drag, setDrag] = useState<{
    key: string; grab: number; at: number; at0: number; moved: boolean;
    /** Out of the panel, where the pointer is on screen, and the order from before the drag. */
    out: boolean; x: number; y: number; x0: number; y0: number; before: string[];
  } | null>(null);
  const press = useRef<{ el: HTMLElement; key: string; x0: number; y0: number; x: number; y: number; timer: number; held?: boolean } | null>(null);
  const ref = useRef<HTMLElement>(null);
  const els = useRef(new Map<string, HTMLElement>());
  const offsets = useRef(new Map<string, number>());
  const swallowClick = useRef(false);
  const shown = useRef<string[]>(order);
  // Panels too long for the screen: how many elements fit, their sizes as last seen (the hidden ones
  // aren't there to measure), the room there is, and whether the "more" popover is open.
  const [fit, setFit] = useState(Infinity);
  const [moreOpen, setMoreOpen] = useState(false);
  const sizes = useRef(new Map<string, number>());
  const room = useRef<number | null>(null);
  const keys = useRef<string[]>([]);
  const moreRef = useRef<HTMLElement | null>(null);
  const [, redraw] = useState(0);
  // The "more" popover's buttons can be rearranged too, among themselves, in a row or in columns:
  // the lifted one follows the pointer both ways and takes the place of whichever it comes over.
  const moreZone = useRef<HTMLElement | null>(null);
  const moreEls = useRef(new Map<string, HTMLElement>());
  const moreOffsets = useRef(new Map<string, { x: number; y: number }>());
  const moreShown = useRef<string[]>([]);
  const [moreDrag, setMoreDrag] = useState<{
    key: string; gx: number; gy: number; x: number; y: number; x0: number; y0: number; moved: boolean; out: boolean; before: string[];
  } | null>(null);
  const morePress = useRef<{ el: HTMLElement; key: string; x0: number; y0: number; timer: number } | null>(null);

  const pos = (e: { clientX: number; clientY: number }) => (axis === 'y' ? e.clientY : e.clientX);
  const offset = (el: HTMLElement) => (axis === 'y' ? el.offsetTop : el.offsetLeft);
  const size = (el: HTMLElement) => (axis === 'y' ? el.offsetHeight : el.offsetWidth);
  const naturalStart = (key: string) => {
    const r = ref.current!.getBoundingClientRect();
    return (axis === 'y' ? r.top : r.left) + offset(els.current.get(key)!);
  };
  const shift = (d: number) => (axis === 'y' ? `translateY(${d}px)` : `translateX(${d}px)`);

  // The lifted button follows the pointer, wherever its slot is now; dragged out of the panel, it
  // waits faintly in its old slot while its preview follows the pointer instead.
  useLayoutEffect(() => {
    if (!drag) return;
    const el = els.current.get(drag.key);
    if (!el) return;
    el.style.transform = drag.out ? '' : `${shift(drag.at - drag.grab - naturalStart(drag.key))} scale(1.12)`;
    el.style.opacity = drag.out ? '.3' : '';
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
    for (const [key, el] of moreEls.current) {
      const before = moreOffsets.current.get(key), now = { x: el.offsetLeft, y: el.offsetTop };
      moreOffsets.current.set(key, now);
      if (before && (before.x !== now.x || before.y !== now.y) && key !== moreDrag?.key) {
        el.animate([{ transform: `translate(${before.x - now.x}px, ${before.y - now.y}px)` }, { transform: 'none' }], { duration: 150, easing: 'ease-out' });
      }
    }
  }, [order]); // eslint-disable-line react-hooks/exhaustive-deps
  // Where the popover's buttons stand as soon as it opens, so the first change slides them too; and
  // forgetting those gone from it, so they don't slide in from their old place when it opens again.
  useLayoutEffect(() => {
    for (const [key, el] of moreEls.current) if (!moreOffsets.current.has(key)) moreOffsets.current.set(key, { x: el.offsetLeft, y: el.offsetTop });
    for (const key of moreOffsets.current.keys()) if (!moreEls.current.has(key)) moreOffsets.current.delete(key);
  });

  // Lifts the pressed button: `x0`, `y0` is where the press began, `x`, `y` where the pointer is now.
  const lift = (p: { el: HTMLElement; key: string; x0: number; y0: number; x: number; y: number }) => {
    const at0 = axis === 'y' ? p.y0 : p.x0, at = axis === 'y' ? p.y : p.x, r = p.el.getBoundingClientRect();
    setDrag({ key: p.key, grab: at0 - (axis === 'y' ? r.top : r.left), at, at0, moved: false, out: false, x: p.x, y: p.y, x0: p.x0, y0: p.y0, before: order });
  };
  const onPointerDown = (e: ReactPointerEvent<HTMLElement>) => {
    const target = e.target as Element;
    const el = target.closest<HTMLElement>('[data-key]');
    if (!el || e.button !== 0 || target.closest('[data-nosort]') || !ref.current?.contains(el)) return;
    const p = { el, key: el.dataset.key!, x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY, timer: 0, held: false };
    p.timer = window.setTimeout(() => {
      // A hold that opens the button's variants keeps the press: moving on still drags the button.
      // It's followed on the window from then on, as whatever opened may now lie under the pointer.
      if (dropOut?.hold?.(p.key)) {
        swallowClick.current = true;
        p.held = true;
        const off = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
        const move = (ev: PointerEvent) => { if (press.current === p) onPointerMove(ev); if (press.current !== p) off(); };
        const up = () => { off(); onPointerUp(); };
        window.addEventListener('pointermove', move);
        window.addEventListener('pointerup', up);
        return;
      }
      press.current = null;
      lift(p);
    }, HOLD_MS);
    press.current = p;
  };
  // Wandering off the button before it lifts cancels the hold, except in a panel whose buttons can
  // be dragged onto the board: there pulling a button away picks it up at once.
  const onPointerMove = (e: { clientX: number; clientY: number }) => {
    const p = press.current;
    if (!p) return;
    p.x = e.clientX;
    p.y = e.clientY;
    if (Math.hypot(p.x - p.x0, p.y - p.y0) <= HOLD_SLOP) return;
    clearTimeout(p.timer);
    press.current = null;
    if (dropOut) lift(p);
  };
  // Once it has lifted, the pointer is followed on the window, so it can leave the panel; nothing
  // is captured, so letting go in place still lands on the button as a click.
  const dragMove = (e: PointerEvent) => {
    if (!drag) return;
    const at = pos(e);
    const moved = drag.moved || Math.abs(at - drag.at0) > HOLD_SLOP || Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0) > HOLD_SLOP * 3;
    // Over the open "more" popover, it goes in there.
    if (moved && overMore(e)) { intoMore(drag.key, e, drag.before); return; }
    // Gone from the panel (into "more", or back where it was when it went out over the board):
    // over the panel again, it takes a place there.
    if (!els.current.has(drag.key)) {
      if (overBar(e)) ontoBar(drag.key, e, drag.before, drag.grab, drag.x0, drag.y0);
      else setDrag({ ...drag, moved, x: e.clientX, y: e.clientY });
      return;
    }
    const r = ref.current!.getBoundingClientRect();
    const out = !!dropOut && moved && (e.clientX < r.left - OUT_MARGIN || e.clientX > r.right + OUT_MARGIN || e.clientY < r.top - OUT_MARGIN || e.clientY > r.bottom + OUT_MARGIN);
    if (out) {
      if (!drag.out) setOrder(drag.before);
      setDrag({ ...drag, at, moved, out, x: e.clientX, y: e.clientY });
      return;
    }
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
    setDrag({ ...drag, at, moved, out, x: e.clientX, y: e.clientY });
  };
  const onPointerUp = () => {
    const held = press.current?.held;
    if (press.current) { clearTimeout(press.current.timer); press.current = null; }
    // A hold that did something of its own: the click that comes with letting go goes nowhere.
    if (held && !drag) setTimeout(() => { swallowClick.current = false; }, 0);
  };
  const dragEnd = () => {
    if (!drag) return;
    // Settle into the slot from wherever it was let go, and don't count the release as a click.
    const el = els.current.get(drag.key);
    if (el) {
      const from = el.style.transform;
      el.style.transform = '';
      el.style.opacity = '';
      if (!drag.out) el.animate([{ transform: from }, { transform: 'none' }], { duration: 150, easing: 'ease-out' });
    }
    setDrag(null);
    if (!drag.moved) return;
    if (drag.out) dropOut!.drop(drag.key, { x: drag.x, y: drag.y });
    else try { localStorage.setItem(storageKey, JSON.stringify(order)); } catch { /* just won't be remembered */ }
    swallowClick.current = true;
    setTimeout(() => { swallowClick.current = false; }, 0);
  };

  const inside = (r: DOMRect | undefined, e: { clientX: number; clientY: number }) =>
    !!r && e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
  const overBar = (e: { clientX: number; clientY: number }) => inside(ref.current?.getBoundingClientRect(), e);
  const overMore = (e: { clientX: number; clientY: number }) => inside(moreZone.current?.getBoundingClientRect(), e);
  /** Lets go of whatever transform a button was dragged with. */
  const unlift = (el: HTMLElement | undefined) => { if (el) { el.style.transform = ''; el.style.opacity = ''; } };
  /** Puts the dragged button on the panel, among the buttons either side of the pointer (never last:
   *  what's last on a full panel is what goes into "more"), and drags it on along the panel. */
  const ontoBar = (key: string, e: { clientX: number; clientY: number }, before: string[], grab: number, x0: number, y0: number) => {
    const at = pos(e), list = shown.current.filter((k) => k !== key && els.current.has(k));
    const next = list.find((k) => naturalStart(k) + size(els.current.get(k)!) / 2 > at) ?? list[list.length - 1];
    const rest = order.filter((k) => k !== key);
    rest.splice(next ? rest.indexOf(next) : 0, 0, key);
    unlift(moreEls.current.get(key));
    setOrder(rest);
    setMoreDrag(null);
    setDrag({ key, grab, at, at0: axis === 'y' ? y0 : x0, moved: true, out: false, x: e.clientX, y: e.clientY, x0, y0, before });
  };
  /** Puts the dragged button in the "more" popover, before the one under the pointer (never first:
   *  a place freed on the panel goes to what's first there), and drags it on in there. */
  const intoMore = (key: string, e: { clientX: number; clientY: number }, before: string[]) => {
    const el = els.current.get(key), r = el?.getBoundingClientRect();
    const list = moreShown.current.filter((k) => k !== key && moreEls.current.has(k));
    const hit = list.findIndex((k) => { const sl = slot(moreEls.current.get(k)!); return e.clientX >= sl.x && e.clientX <= sl.x + sl.w && e.clientY >= sl.y && e.clientY <= sl.y + sl.h; });
    const rest = order.filter((k) => k !== key);
    if (list.length) {
      const i = hit > 0 ? rest.indexOf(list[hit]) : rest.indexOf(list[hit === 0 ? 0 : list.length - 1]) + 1;
      rest.splice(i, 0, key);
    } else rest.push(key);
    unlift(el);
    setOrder(rest);
    setDrag(null);
    setMoreDrag({ key, gx: r ? r.width / 2 : 15, gy: r ? r.height / 2 : 15, x: e.clientX, y: e.clientY, x0: e.clientX, y0: e.clientY, moved: true, out: false, before });
  };

  // Where a popover button's slot is on screen.
  const slot = (el: HTMLElement) => {
    const r = moreZone.current!.getBoundingClientRect();
    return { x: r.left + el.offsetLeft, y: r.top + el.offsetTop, w: el.offsetWidth, h: el.offsetHeight };
  };
  useLayoutEffect(() => {
    if (!moreDrag || !moreZone.current) return;
    const el = moreEls.current.get(moreDrag.key);
    if (!el) return;
    const at = slot(el);
    el.style.transform = moreDrag.out ? '' : `translate(${moreDrag.x - moreDrag.gx - at.x}px, ${moreDrag.y - moreDrag.gy - at.y}px) scale(1.12)`;
    el.style.opacity = moreDrag.out ? '.3' : '';
  });
  const liftMore = (p: { el: HTMLElement; key: string; x0: number; y0: number }, x: number, y: number) => {
    const r = p.el.getBoundingClientRect();
    setMoreDrag({ key: p.key, gx: p.x0 - r.left, gy: p.y0 - r.top, x, y, x0: p.x0, y0: p.y0, moved: false, out: false, before: order });
  };
  const moreDown = (e: ReactPointerEvent<HTMLElement>) => {
    const target = e.target as Element, el = target.closest<HTMLElement>('[data-more-key]');
    const nosort = target.closest('[data-nosort]');
    if (!el || e.button !== 0 || !moreZone.current?.contains(el) || (nosort && el.contains(nosort))) return;
    const p = { el, key: el.dataset.moreKey!, x0: e.clientX, y0: e.clientY, timer: 0 };
    p.timer = window.setTimeout(() => { morePress.current = null; liftMore(p, p.x0, p.y0); }, HOLD_MS);
    morePress.current = p;
  };
  const moreMovePress = (e: ReactPointerEvent<HTMLElement>) => {
    const p = morePress.current;
    if (!p || Math.hypot(e.clientX - p.x0, e.clientY - p.y0) <= HOLD_SLOP) return;
    clearTimeout(p.timer);
    morePress.current = null;
    if (dropOut) liftMore(p, e.clientX, e.clientY);
  };
  const moreUpPress = () => {
    if (morePress.current) { clearTimeout(morePress.current.timer); morePress.current = null; }
  };
  const moreMove = (e: PointerEvent) => {
    const d = moreDrag, zone = moreZone.current;
    if (!d || !zone) return;
    const moved = d.moved || Math.hypot(e.clientX - d.x0, e.clientY - d.y0) > HOLD_SLOP;
    const r = zone.getBoundingClientRect();
    const out = !!dropOut && moved && (e.clientX < r.left - OUT_MARGIN || e.clientX > r.right + OUT_MARGIN || e.clientY < r.top - OUT_MARGIN || e.clientY > r.bottom + OUT_MARGIN);
    const next = { ...d, x: e.clientX, y: e.clientY, moved, out };
    // Brought onto the panel itself, it takes its place there and is dragged on along the panel.
    if (moved && overBar(e)) { ontoBar(d.key, e, d.before, axis === 'y' ? d.gy : d.gx, d.x0, d.y0); return; }
    if (out) {
      if (!d.out) setOrder(d.before);
      setMoreDrag(next);
      return;
    }
    // The lifted button's middle over another's slot: it goes there, the rest shifting along.
    const el = moreEls.current.get(d.key);
    if (!el) { setMoreDrag(next); return; }
    const cx = e.clientX - d.gx + el.offsetWidth / 2, cy = e.clientY - d.gy + el.offsetHeight / 2;
    const other = moreShown.current.find((k) => {
      const o = k !== d.key && moreEls.current.get(k);
      if (!o) return false;
      const s = slot(o);
      return cx >= s.x && cx <= s.x + s.w && cy >= s.y && cy <= s.y + s.h;
    });
    if (other) {
      const after = order.indexOf(other) > order.indexOf(d.key), list = order.filter((k) => k !== d.key);
      list.splice(list.indexOf(other) + (after ? 1 : 0), 0, d.key);
      setOrder(list);
    }
    setMoreDrag(next);
  };
  const moreEnd = () => {
    const d = moreDrag;
    if (!d) return;
    const el = moreEls.current.get(d.key);
    if (el) {
      const from = el.style.transform;
      el.style.transform = '';
      el.style.opacity = '';
      if (!d.out) el.animate([{ transform: from }, { transform: 'none' }], { duration: 150, easing: 'ease-out' });
    }
    setMoreDrag(null);
    if (!d.moved) return;
    if (d.out) dropOut!.drop(d.key, { x: d.x, y: d.y });
    else try { localStorage.setItem(storageKey, JSON.stringify(order)); } catch { /* just won't be remembered */ }
    swallowClick.current = true;
    setTimeout(() => { swallowClick.current = false; }, 0);
  };

  // With a room set (see renderFit), what doesn't fit goes under a "more" button at the end.
  useLayoutEffect(() => {
    const el = ref.current;
    if (room.current === null || !el) return;
    for (const c of Array.from(el.children) as HTMLElement[]) {
      const k = c.dataset.key;
      if (!k) continue;
      const cs = getComputedStyle(c);
      sizes.current.set(k, axis === 'y' ? c.offsetHeight + parseFloat(cs.marginTop) + parseFloat(cs.marginBottom) : c.offsetWidth + parseFloat(cs.marginLeft) + parseFloat(cs.marginRight));
    }
    const cs = getComputedStyle(el), gap = parseFloat(axis === 'y' ? cs.rowGap : cs.columnGap) || 0;
    const pad = axis === 'y' ? parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom) : parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight);
    const moreSize = MORE_SIZE;
    const long = (ks: string[], more: boolean) => pad + ks.reduce((t, k) => t + (sizes.current.get(k) ?? 0), 0) + (more ? moreSize : 0) + gap * (ks.length - (more ? 0 : 1));
    const all = keys.current;
    let n = all.length;
    if (long(all, false) > room.current) {
      n = all.length - 1;
      while (n > 0 && long(trimSeparators(all.slice(0, n)), true) > room.current) n--;
    }
    const next = n >= all.length ? Infinity : n;
    if (next !== fit) setFit(next);
  });
  useEffect(() => {
    const again = () => redraw((n) => n + 1);
    window.addEventListener('resize', again);
    return () => window.removeEventListener('resize', again);
  }, []);
  // The popover closes on a press anywhere else.
  useEffect(() => {
    if (!moreOpen) return;
    const close = (e: globalThis.PointerEvent) => { if (!moreRef.current?.contains(e.target as Node)) setMoreOpen(false); };
    window.addEventListener('pointerdown', close, true);
    return () => window.removeEventListener('pointerdown', close, true);
  }, [moreOpen]);

  const handlers = useRef({ move: dragMove, end: dragEnd });
  handlers.current = moreDrag ? { move: moreMove, end: moreEnd } : { move: dragMove, end: dragEnd };
  const lifted = !!drag || !!moreDrag;
  useEffect(() => {
    if (!lifted) return;
    const move = (e: PointerEvent) => handlers.current.move(e), end = () => handlers.current.end();
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', end);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', end);
      window.removeEventListener('pointercancel', end);
    };
  }, [lifted]);

  return {
    ref,
    sorting: !!drag || !!moreDrag,
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
    lifted: (key: string) => drag?.key === key || moreDrag?.key === key,
    /** Props for the "more" popover holding the buttons `keys` (in order), whose buttons can be
     *  rearranged among themselves (and dragged out onto the board, with dropOut). */
    moreZone: (keys: string[]) => {
      moreShown.current = keys.filter((k) => !isSeparator(k));
      return {
        ref: (el: HTMLElement | null) => { moreZone.current = el; },
        onPointerDown: moreDown, onPointerMove: moreMovePress, onPointerUp: moreUpPress, onPointerCancel: moreUpPress,
        onClickCapture: (e: MouseEvent) => { if (swallowClick.current) { e.stopPropagation(); e.preventDefault(); } },
      };
    },
    /** Props for one button in the "more" popover. */
    moreItem: (key: string) => ({
      'data-more-key': key,
      ref: (el: HTMLElement | null) => { if (el) moreEls.current.set(key, el); else moreEls.current.delete(key); },
    }),
    /** The preview under the pointer while a button is dragged out of the panel. */
    ghost: (drag?.out || moreDrag?.out) && dropOut
      ? createPortal(createElement('div', { className: 'pick-ghost preview', style: { left: (drag ?? moreDrag)!.x, top: (drag ?? moreDrag)!.y } }, dropOut.preview((drag ?? moreDrag)!.key)), document.body)
      : null,
    /** One element of the panel with its key, ref and 'lifted' class. A component can't take the ref,
     *  so it goes in a wrapper that does: everything on a panel can be moved, components too. */
    place(k: string, el: ReactElement): ReactElement {
      const lifted = drag?.key === k && 'lifted';
      if (typeof el.type !== 'string') return createElement('span', { key: k, ...this.item(k), className: ['sort-wrap', lifted].filter(Boolean).join(' ') }, el);
      return cloneElement(el, { key: k, ...this.item(k), className: [el.props.className, lifted].filter(Boolean).join(' ') });
    },
    /** Like place, for a button in the "more" popover. */
    placeMore(k: string, el: ReactElement): ReactElement {
      const lifted = moreDrag?.key === k && 'lifted';
      if (isSeparator(k)) return cloneElement(el, { key: k });
      if (typeof el.type !== 'string') return createElement('span', { key: k, ...this.moreItem(k), className: ['sort-wrap', lifted].filter(Boolean).join(' ') }, el);
      return cloneElement(el, { key: k, ...this.moreItem(k), className: [el.props.className, lifted].filter(Boolean).join(' ') });
    },
    /** Draws the panel's elements (by key) in order, each with its key, ref and 'lifted' class;
     *  elements left out of `items` are skipped. */
    render(items: Partial<Record<string, ReactElement>>): ReactElement[] {
      return this.visible((k) => !!items[k]).map((k) => this.place(k, items[k]!));
    },
    /**
     * Like render, for a panel that has `space` px along it: the elements that don't fit go under a
     * "more" button at its end, which opens them in a popover above or below the panel.
     */
    renderFit(items: Partial<Record<string, ReactElement>>, space: number, place: 'above' | 'below'): ReactElement[] {
      room.current = space;
      keys.current = this.visible((k) => !!items[k]);
      const shownKeys = this.visible((k) => !!items[k], fit);
      const out = shownKeys.map((k) => this.place(k, items[k]!));
      const hidden = keys.current.filter((k) => !shownKeys.includes(k) && !isSeparator(k));
      if (!hidden.length) { if (moreOpen) setMoreOpen(false); return out; }
      out.push(createElement('div', { key: '__more', className: 'more-wrap', 'data-nosort': true, ref: (e: HTMLElement | null): void => { moreRef.current = e; } },
        createElement('button', { className: `ib ${moreOpen ? 'on' : ''}`, title: 'Ещё', 'aria-label': 'Ещё', 'aria-expanded': moreOpen, onClick: () => setMoreOpen(!moreOpen) },
          createElement(PanelIcon, { name: 'more' })),
        moreOpen && (() => {
          const inPop = trimSeparators(keys.current.filter((k) => !shownKeys.includes(k)));
          return createElement('div', { className: `more-pop ${place}`, role: 'toolbar', 'aria-label': 'Ещё', ...this.moreZone(inPop) },
            ...inPop.map((k) => this.placeMore(k, items[k]!)));
        })()));
      return out;
    },
    /** Keys to draw, in order: those `present` keeps, without separators left at an end or doubled up;
     *  only the first `limit` when the panel has room for no more. */
    visible: (present: (key: string) => boolean = () => true, limit = Infinity): string[] => {
      let out: string[] = [];
      for (const k of order.filter(present)) {
        if (isSeparator(k) && (!out.length || isSeparator(out[out.length - 1]))) continue;
        out.push(k);
      }
      out = out.slice(0, limit);
      while (out.length && isSeparator(out[out.length - 1])) out.pop();
      shown.current = out;
      return out;
    },
  };
}
