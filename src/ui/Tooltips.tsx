import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { panelScale } from './panels/size';

/** How long the pointer has to stay on a button before its hint shows, in ms (moving about on the
 *  button doesn't start it over); and how long hints keep coming at once after the pointer leaves
 *  their panel, should it come back. */
const WAIT = 1000, GRACE = 1000;

type Side = 'right' | 'left' | 'above' | 'below';
/** `px` is where along the bubble its pointer is, over or under a button. */
interface Tip { text: string; left: number; top: number; side: Side; px: number }

/** The bubble's height, its distance from the screen's edges and its width for a text (the text in
 *  Inter Semi Bold 12 and 15.5px padding each side). */
const H = 37, EDGE = 8;
let measure: CanvasRenderingContext2D | null = null;
function tipWidth(text: string): number {
  measure ??= document.createElement('canvas').getContext('2d');
  if (!measure) return text.length * 7 + 31;
  measure.font = '600 12px Inter, sans-serif';
  return Math.ceil(measure.measureText(text).width) + 31;
}

/**
 * The hints of the panels' buttons, from the Figma "Alt" bubble, once the pointer has been on one
 * for a second (then at once for the rest of that panel's buttons): shown in place of the browser's own, which they take over by moving each
 * button's title into data-tip when the pointer comes.
 * Beside the upright panels the bubble points at its button; over or under the flat bars it sits
 * centred on it; where that doesn't fit on screen, it goes to whichever side does.
 */
export function Tooltips() {
  const [tip, setTip] = useState<Tip | null>(null);
  useEffect(() => {
    let timer = 0, current: HTMLElement | null = null;
    // Once a hint has been waited for, the others in the same panel come at once, until the pointer
    // has been away from that panel for a second.
    let warm: Element | null = null, leftAt: number | null = null;
    const panelOf = (el: Element) => el.closest('.bar, .tfmt, .tools, .draw-panel, .tools-more, .more-pop, .op-pop');
    const show = (el: HTMLElement) => {
      const text = el.dataset.tip;
      warm = panelOf(el);
      leftAt = null;
      if (!text) return;
      // On whichever side, its pointer (5.89 long) reaches 2px over the button's highlight (6px round
      // the icon of a panel button). The hints of one row of a panel all stand level, as off the
      // biggest thing in that row (and those of one column beside it, off the widest there).
      const w = tipWidth(text), r = el.getBoundingClientRect();
      const group = el.closest('.more-pop, .bar, .tfmt, .tools, .draw-panel, .tools-more');
      const bar = (group ?? el).getBoundingClientRect();
      const reach = (it: Element) => {
        const q = it.getBoundingClientRect(), hl = it.matches('.fb') ? Math.round(6 * panelScale()) : 0;
        return { top: q.top - hl, bottom: q.bottom + hl, left: q.left - hl, right: q.right + hl };
      };
      const mates = group
        ? [...group.querySelectorAll('[data-tip], [title], button')].filter((it) => it.closest('.more-pop, .bar, .tfmt, .tools, .draw-panel, .tools-more') === group && it.getBoundingClientRect().width)
        : [];
      const own = reach(el);
      const row = mates.map((it) => ({ it, q: it.getBoundingClientRect() })).filter(({ q }) => q.bottom > r.top && q.top < r.bottom).map(({ it }) => reach(it));
      const col = mates.map((it) => ({ it, q: it.getBoundingClientRect() })).filter(({ q }) => q.right > r.left && q.left < r.right).map(({ it }) => reach(it));
      const top = Math.min(own.top, ...row.map((e) => e.top)), bottom = Math.max(own.bottom, ...row.map((e) => e.bottom));
      const left = Math.min(own.left, ...col.map((e) => e.left)), right = Math.max(own.right, ...col.map((e) => e.right));
      const midY = r.top + r.height / 2 - H / 2, midX = Math.min(Math.max(r.left + r.width / 2 - w / 2, EDGE), innerWidth - EDGE - w);
      const places: Record<Side, { left: number; top: number }> = {
        right: { left: right - 2 + 5.89, top: midY },
        left: { left: left + 2 - 5.89 - w, top: midY },
        above: { left: midX, top: top + 2 - 5.89 - H },
        below: { left: midX, top: bottom - 2 + 5.89 },
      };
      // Where it goes first: beside an upright panel, over or under a flat bar (whichever is towards
      // the middle of the screen); then wherever it fits.
      const upright = !!el.closest('.tools, .draw-panel, .tools-more'), high = bar.top + bar.height / 2 < innerHeight / 2;
      const order: Side[] = upright ? ['right', 'left', 'above', 'below'] : high ? ['below', 'above', 'right', 'left'] : ['above', 'below', 'right', 'left'];
      const fits = ({ left, top }: { left: number; top: number }) => left >= EDGE && left + w <= innerWidth - EDGE && top >= EDGE && top + H <= innerHeight - EDGE;
      const side = order.find((s) => fits(places[s])) ?? order[0];
      // Over or under, the pointer stands at the button's middle, kept clear of the rounded corners.
      const px = Math.min(Math.max(r.left + r.width / 2 - places[side].left, 15), w - 15);
      setTip({ text, ...places[side], side, px });
    };
    const hide = () => {
      clearTimeout(timer);
      current = null;
      setTip(null);
    };
    const over = (e: PointerEvent) => {
      const target = e.target as Element | null;
      if (warm && leftAt !== null && performance.now() - leftAt > GRACE) { warm = null; leftAt = null; }
      if (warm) { if (target && warm.contains(target)) leftAt = null; else leftAt ??= performance.now(); }
      // While something is held and dragged (a panel button, or anything on the board), no hints
      // come and none is waited for.
      if (e.buttons) { hide(); return; }
      // Nor while a menu from the top bar is open: they'd get in its way.
      if (document.querySelector('.board-menu, .topbar [aria-expanded="true"]')) { hide(); return; }
      const el = target?.closest?.<HTMLElement>('[title], [data-tip]') ?? null;
      if (el === current) return;
      hide();
      if (!el || el.closest('.board-canvas')) return;
      // Take the hint over from the browser.
      if (el.title) { el.dataset.tip = el.title; el.removeAttribute('title'); }
      current = el;
      if (warm && panelOf(el) === warm) show(el);
      else timer = window.setTimeout(() => show(el), WAIT);
    };
    window.addEventListener('pointerover', over);
    window.addEventListener('pointerdown', hide, true);
    window.addEventListener('keydown', hide, true);
    window.addEventListener('blur', hide);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('pointerover', over);
      window.removeEventListener('pointerdown', hide, true);
      window.removeEventListener('keydown', hide, true);
      window.removeEventListener('blur', hide);
    };
  }, []);
  if (!tip) return null;
  return createPortal(
    <div className={`tip ${tip.side}`} role="tooltip" style={{ left: tip.left, top: tip.top, '--px': `${tip.px}px` } as React.CSSProperties}>{tip.text}</div>,
    document.body,
  );
}
