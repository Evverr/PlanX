import { cloneElement, createElement, useEffect, useLayoutEffect, useRef, useState, type MouseEvent, type PointerEvent as ReactPointerEvent, type ReactElement, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { PanelIcon } from './PanelIcon';
import { readJSON, writeJSON } from '../storage';

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

/** Where a lifted button is: on its panel, or in the panel's "more" popover. */
type Zone = 'bar' | 'more';

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
  const saved = readJSON<string[]>(storageKey);
  if (!Array.isArray(saved)) return defaults;
  // A button added since goes where it is by default: before the next one that was already there.
  const order = saved.map((k) => renames[k] ?? k).filter((k) => defaults.includes(k));
  defaults.forEach((k, i) => {
    if (order.includes(k)) return;
    const next = defaults.slice(i + 1).find((d) => order.includes(d));
    order.splice(next ? order.indexOf(next) : order.length, 0, k);
  });
  return order;
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
  // One button lifted at a time, in one of two places: on the panel itself ('bar', where it only
  // moves along the panel) or in its "more" popover ('more', where it moves both ways, as the
  // popover may have rows and columns). It can go from one to the other while it's dragged.
  const [drag, setDrag] = useState<{
    key: string; zone: Zone;
    /** Where in the button it was taken hold of, from its top left corner. */
    gx: number; gy: number;
    /** Where the pointer is on screen, and where the press began. */
    x: number; y: number; x0: number; y0: number;
    /** Whether it has moved yet, whether it's out over the board, and the order from before. */
    moved: boolean; out: boolean; before: string[];
  } | null>(null);
  const press = useRef<{ el: HTMLElement; key: string; zone: Zone; x0: number; y0: number; x: number; y: number; timer: number; held?: boolean } | null>(null);
  const ref = useRef<HTMLElement>(null);
  const els = useRef(new Map<string, HTMLElement>());
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
  const moreZone = useRef<HTMLElement | null>(null);
  const moreEls = useRef(new Map<string, HTMLElement>());
  const moreShown = useRef<string[]>([]);
  // Where each button stood when last seen, to slide it from there to a new place.
  const offsets = useRef(new Map<string, { x: number; y: number }>());

  const zones = {
    bar: { box: () => ref.current, els: els.current, keys: () => shown.current },
    more: { box: () => moreZone.current, els: moreEls.current, keys: () => moreShown.current },
  };
  /** Where a button's slot is on screen (where it stands, whatever it's moved by). */
  const slot = (zone: Zone, el: HTMLElement) => {
    const r = zones[zone].box()!.getBoundingClientRect();
    return { x: r.left + el.offsetLeft, y: r.top + el.offsetTop, w: el.offsetWidth, h: el.offsetHeight };
  };
  const along = (x: number, y: number) => (axis === 'y' ? y : x);
  const inside = (r: DOMRect | undefined, e: { clientX: number; clientY: number }, margin = 0) =>
    !!r && e.clientX >= r.left - margin && e.clientX <= r.right + margin && e.clientY >= r.top - margin && e.clientY <= r.bottom + margin;
  const over = (zone: Zone, e: { clientX: number; clientY: number }) => inside(zones[zone].box()?.getBoundingClientRect(), e);

  // The lifted button follows the pointer (along the panel on the panel, both ways in "more"),
  // wherever its slot is now; dragged out of the panel, it waits faintly in its old slot while its
  // preview follows the pointer instead.
  useLayoutEffect(() => {
    if (!drag) return;
    const el = zones[drag.zone].els.get(drag.key);
    if (!el || !zones[drag.zone].box()) return;
    if (drag.out) { el.style.transform = ''; el.style.opacity = '.3'; return; }
    const at = slot(drag.zone, el);
    let dx = drag.x - drag.gx - at.x, dy = drag.y - drag.gy - at.y;
    if (drag.zone === 'bar') { if (axis === 'y') dx = 0; else dy = 0; }
    el.style.transform = `translate(${dx}px, ${dy}px) scale(1.12)`;
    el.style.opacity = '';
  });
  // Buttons that changed places slide into their new ones.
  useLayoutEffect(() => {
    for (const zone of ['bar', 'more'] as const) {
      for (const [key, el] of zones[zone].els) {
        const id = `${zone}:${key}`, before = offsets.current.get(id), now = { x: el.offsetLeft, y: el.offsetTop };
        offsets.current.set(id, now);
        if (before && (before.x !== now.x || before.y !== now.y) && key !== drag?.key) {
          el.animate([{ transform: `translate(${before.x - now.x}px, ${before.y - now.y}px)` }, { transform: 'none' }], { duration: 150, easing: 'ease-out' });
        }
      }
    }
  }, [order]); // eslint-disable-line react-hooks/exhaustive-deps
  // Where buttons stand as soon as they show (the popover just opened), so the first change slides
  // them too; and forgetting those gone, so they don't slide in from an old place when back.
  useLayoutEffect(() => {
    const seen = new Set<string>();
    for (const zone of ['bar', 'more'] as const) {
      for (const [key, el] of zones[zone].els) {
        const id = `${zone}:${key}`;
        seen.add(id);
        if (!offsets.current.has(id)) offsets.current.set(id, { x: el.offsetLeft, y: el.offsetTop });
      }
    }
    for (const id of offsets.current.keys()) if (!seen.has(id)) offsets.current.delete(id);
  });

  // Lifts the pressed button: `x0`, `y0` is where the press began, `x`, `y` where the pointer is now.
  const lift = (p: { el: HTMLElement; key: string; zone: Zone; x0: number; y0: number; x: number; y: number }) => {
    const r = p.el.getBoundingClientRect();
    setDrag({ key: p.key, zone: p.zone, gx: p.x0 - r.left, gy: p.y0 - r.top, x: p.x, y: p.y, x0: p.x0, y0: p.y0, moved: false, out: false, before: order });
  };
  /** A press on a button of the panel or of its popover: held still a moment, it lifts. */
  const pressOn = (zone: Zone) => (e: ReactPointerEvent<HTMLElement>) => {
    const target = e.target as Element;
    const el = target.closest<HTMLElement>(zone === 'bar' ? '[data-key]' : '[data-more-key]');
    if (!el || e.button !== 0 || !zones[zone].box()?.contains(el)) return;
    // Parts that mustn't start a drag (on the panel: anything marked, the "more" popover included).
    const nosort = target.closest('[data-nosort]');
    if (nosort && (zone === 'bar' || el.contains(nosort))) return;
    const p = { el, key: (zone === 'bar' ? el.dataset.key : el.dataset.moreKey)!, zone, x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY, timer: 0, held: false };
    p.timer = window.setTimeout(() => {
      // A hold that opens the button's variants keeps the press: moving on still drags the button.
      // It's followed on the window from then on, as whatever opened may now lie under the pointer.
      if (zone === 'bar' && dropOut?.hold?.(p.key)) {
        swallowClick.current = true;
        p.held = true;
        const off = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
        const move = (ev: PointerEvent) => { if (press.current === p) pressMove(ev); if (press.current !== p) off(); };
        const up = () => { off(); pressUp(); };
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
  const pressMove = (e: { clientX: number; clientY: number }) => {
    const p = press.current;
    if (!p) return;
    p.x = e.clientX;
    p.y = e.clientY;
    if (Math.hypot(p.x - p.x0, p.y - p.y0) <= HOLD_SLOP) return;
    clearTimeout(p.timer);
    press.current = null;
    if (dropOut) lift(p);
  };
  const pressUp = () => {
    const held = press.current?.held;
    if (press.current) { clearTimeout(press.current.timer); press.current = null; }
    // A hold that did something of its own: the click that comes with letting go goes nowhere.
    if (held && !drag) setTimeout(() => { swallowClick.current = false; }, 0);
  };

  type Lifted = NonNullable<typeof drag>;
  /** Lets go of whatever transform a button was dragged with. */
  const unlift = (el: HTMLElement | undefined) => { if (el) { el.style.transform = ''; el.style.opacity = ''; } };
  /** Puts the dragged button on the panel, among the buttons either side of the pointer (never last:
   *  what's last on a full panel is what goes into "more"), and drags it on along the panel. */
  const ontoBar = (d: Lifted, e: PointerEvent) => {
    const at = along(e.clientX, e.clientY), list = shown.current.filter((k) => k !== d.key && els.current.has(k));
    const middle = (k: string) => { const s = slot('bar', els.current.get(k)!); return axis === 'y' ? s.y + s.h / 2 : s.x + s.w / 2; };
    const next = list.find((k) => middle(k) > at) ?? list[list.length - 1];
    const rest = order.filter((k) => k !== d.key);
    rest.splice(next ? rest.indexOf(next) : 0, 0, d.key);
    unlift(moreEls.current.get(d.key));
    setOrder(rest);
    setDrag({ ...d, zone: 'bar', x: e.clientX, y: e.clientY, moved: true, out: false });
  };
  /** Puts the dragged button in the "more" popover, before the one under the pointer (never first:
   *  a place freed on the panel goes to what's first there), and drags it on in there. */
  const intoMore = (d: Lifted, e: PointerEvent) => {
    const el = els.current.get(d.key), r = el?.getBoundingClientRect();
    const list = moreShown.current.filter((k) => k !== d.key && moreEls.current.has(k));
    const hit = list.findIndex((k) => { const s = slot('more', moreEls.current.get(k)!); return e.clientX >= s.x && e.clientX <= s.x + s.w && e.clientY >= s.y && e.clientY <= s.y + s.h; });
    const rest = order.filter((k) => k !== d.key);
    if (list.length) rest.splice(hit > 0 ? rest.indexOf(list[hit]) : rest.indexOf(list[hit === 0 ? 0 : list.length - 1]) + 1, 0, d.key);
    else rest.push(d.key);
    unlift(el);
    setOrder(rest);
    setDrag({ ...d, zone: 'more', gx: r ? r.width / 2 : 15, gy: r ? r.height / 2 : 15, x: e.clientX, y: e.clientY, x0: e.clientX, y0: e.clientY, moved: true, out: false });
  };
  /** The button whose place the lifted one takes: on the panel, the neighbour whose middle its own
   *  has passed; in "more", whichever slot its middle is over. */
  const passed = (d: Lifted, el: HTMLElement): string | null => {
    if (d.zone === 'more') {
      const cx = d.x - d.gx + el.offsetWidth / 2, cy = d.y - d.gy + el.offsetHeight / 2;
      return moreShown.current.find((k) => {
        const o = k !== d.key && moreEls.current.get(k);
        if (!o) return false;
        const s = slot('more', o);
        return cx >= s.x && cx <= s.x + s.w && cy >= s.y && cy <= s.y + s.h;
      }) ?? null;
    }
    const list = shown.current, i = list.indexOf(d.key);
    const middle = (k: string) => { const s = slot('bar', els.current.get(k)!); return axis === 'y' ? s.y + s.h / 2 : s.x + s.w / 2; };
    const mid = along(d.x - d.gx, d.y - d.gy) + (axis === 'y' ? el.offsetHeight : el.offsetWidth) / 2;
    return i + 1 < list.length && mid > middle(list[i + 1]) ? list[i + 1] : i > 0 && mid < middle(list[i - 1]) ? list[i - 1] : null;
  };
  // Once it has lifted, the pointer is followed on the window, so it can leave the panel; nothing
  // is captured, so letting go in place still lands on the button as a click.
  const dragMove = (e: PointerEvent) => {
    if (!drag) return;
    const d = drag, dist = Math.hypot(e.clientX - d.x0, e.clientY - d.y0);
    const moved = d.moved || (d.zone === 'bar' ? Math.abs(along(e.clientX, e.clientY) - along(d.x0, d.y0)) > HOLD_SLOP || dist > HOLD_SLOP * 3 : dist > HOLD_SLOP);
    // Over the other place (the open popover from the panel, the panel from the popover), it goes there.
    if (moved && d.zone === 'bar' && over('more', e)) { intoMore(d, e); return; }
    if (moved && (d.zone === 'more' || !els.current.has(d.key)) && over('bar', e)) { ontoBar(d, e); return; }
    const out = !!dropOut && moved && !inside(zones[d.zone].box()?.getBoundingClientRect(), e, OUT_MARGIN);
    const next = { ...d, x: e.clientX, y: e.clientY, moved, out };
    if (out) {
      if (!d.out) setOrder(d.before);
      setDrag(next);
      return;
    }
    // Not where it's dragged (gone into "more", or back where it was when it went out over the board).
    const el = zones[d.zone].els.get(d.key);
    if (!el) { setDrag(next); return; }
    const other = passed(next, el);
    if (other) {
      const list = order.filter((k) => k !== d.key), after = order.indexOf(other) > order.indexOf(d.key);
      list.splice(list.indexOf(other) + (after ? 1 : 0), 0, d.key);
      setOrder(list);
    }
    setDrag(next);
  };
  const dragEnd = () => {
    if (!drag) return;
    // Settle into the slot from wherever it was let go, and don't count the release as a click.
    const el = zones[drag.zone].els.get(drag.key);
    if (el) {
      const from = el.style.transform;
      unlift(el);
      if (!drag.out) el.animate([{ transform: from }, { transform: 'none' }], { duration: 150, easing: 'ease-out' });
    }
    setDrag(null);
    if (!drag.moved) return;
    if (drag.out) dropOut!.drop(drag.key, { x: drag.x, y: drag.y });
    else writeJSON(storageKey, order);
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
      // At least the first one stays, however short the panel is made.
      while (n > 1 && long(trimSeparators(all.slice(0, n)), true) > room.current) n--;
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
  handlers.current = { move: dragMove, end: dragEnd };
  const lifted = !!drag;
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
    sorting: !!drag,
    container: {
      onPointerDown: pressOn('bar'), onPointerMove: pressMove, onPointerUp: pressUp, onPointerCancel: pressUp,
      onClickCapture: (e: MouseEvent) => { if (swallowClick.current) { e.stopPropagation(); e.preventDefault(); } },
      onContextMenu: (e: MouseEvent) => { if (drag) e.preventDefault(); },
    },
    /** Props for one item: where to find it and what it's called. */
    item: (key: string) => ({
      'data-key': key,
      ref: (el: HTMLElement | null) => { if (el) els.current.set(key, el); else els.current.delete(key); },
    }),
    lifted: (key: string) => drag?.key === key,
    /** Props for the "more" popover holding the buttons `keys` (in order), whose buttons can be
     *  rearranged among themselves (and dragged out onto the board, with dropOut). */
    moreZone: (keys: string[]) => {
      moreShown.current = keys.filter((k) => !isSeparator(k));
      return {
        ref: (el: HTMLElement | null) => { moreZone.current = el; },
        onPointerDown: pressOn('more'), onPointerMove: pressMove, onPointerUp: pressUp, onPointerCancel: pressUp,
        onClickCapture: (e: MouseEvent) => { if (swallowClick.current) { e.stopPropagation(); e.preventDefault(); } },
      };
    },
    /** Props for one button in the "more" popover. */
    moreItem: (key: string) => ({
      'data-more-key': key,
      ref: (el: HTMLElement | null) => { if (el) moreEls.current.set(key, el); else moreEls.current.delete(key); },
    }),
    /** The preview under the pointer while a button is dragged out of the panel. */
    ghost: drag?.out && dropOut
      ? createPortal(createElement('div', { className: 'pick-ghost preview', style: { left: drag.x, top: drag.y } }, dropOut.preview(drag.key)), document.body)
      : null,
    /** One element of the panel with its key, ref and 'lifted' class. A component can't take the ref,
     *  so it goes in a wrapper that does: everything on a panel can be moved, components too. */
    place(k: string, el: ReactElement): ReactElement {
      const lifted = drag?.zone === 'bar' && drag.key === k && 'lifted';
      if (typeof el.type !== 'string') return createElement('span', { key: k, ...this.item(k), className: ['sort-wrap', lifted].filter(Boolean).join(' ') }, el);
      return cloneElement(el, { key: k, ...this.item(k), className: [el.props.className, lifted].filter(Boolean).join(' ') });
    },
    /** Like place, for a button in the "more" popover. */
    placeMore(k: string, el: ReactElement): ReactElement {
      const lifted = drag?.zone === 'more' && drag.key === k && 'lifted';
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
