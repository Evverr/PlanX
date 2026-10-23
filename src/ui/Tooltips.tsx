import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

/** How long the pointer has to stay still on a button before its hint shows, in ms, and how far it
 *  may drift meanwhile, in px. */
const WAIT = 2000, STILL = 3;

interface Tip { text: string; x: number; y: number; side: 'right' | 'above' | 'below' }

/**
 * The hints of the panels' buttons, from the Figma "Alt" bubble, once the pointer has stayed still
 * on one for two seconds: shown in place of the browser's own, which they take over by moving each
 * button's title into data-tip when the pointer comes.
 * Beside the upright panels the bubble points at its button; over or under the flat bars it sits
 * centred on it.
 */
export function Tooltips() {
  const [tip, setTip] = useState<Tip | null>(null);
  useEffect(() => {
    let timer = 0, current: HTMLElement | null = null, rest = { x: 0, y: 0 }, shown = false;
    const show = (el: HTMLElement) => {
      const text = el.dataset.tip;
      shown = true;
      if (!text) return;
      const r = el.getBoundingClientRect(), panel = el.closest('.tools, .draw-panel');
      // The pointer (5.89 wide) reaches 2px over the button's highlight (6px round the icon of a rail button).
      if (panel) setTip({ text, x: r.right + (el.matches('.fb') ? 6 : 0) - 2 + 5.89, y: r.top + r.height / 2, side: 'right' });
      else {
        const bar = (el.closest('.bar, .tfmt, .tools-more') ?? el).getBoundingClientRect();
        const below = bar.top + bar.height / 2 < innerHeight / 2;
        setTip({ text, x: r.left + r.width / 2, y: below ? bar.bottom + 8 : bar.top - 8, side: below ? 'below' : 'above' });
      }
    };
    const hide = () => {
      clearTimeout(timer);
      current = null;
      shown = false;
      setTip(null);
    };
    const wait = (el: HTMLElement, e: PointerEvent) => {
      clearTimeout(timer);
      rest = { x: e.clientX, y: e.clientY };
      timer = window.setTimeout(() => show(el), WAIT);
    };
    const over = (e: PointerEvent) => {
      const el = (e.target as Element | null)?.closest?.<HTMLElement>('[title], [data-tip]') ?? null;
      if (el === current) return;
      hide();
      if (!el || el.closest('.board-canvas')) return;
      // Take the hint over from the browser.
      if (el.title) { el.dataset.tip = el.title; el.removeAttribute('title'); }
      current = el;
      wait(el, e);
    };
    // Moving on the button starts the wait over, until the hint is up.
    const move = (e: PointerEvent) => {
      if (current && !shown && Math.hypot(e.clientX - rest.x, e.clientY - rest.y) > STILL) wait(current, e);
    };
    window.addEventListener('pointerover', over);
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerdown', hide, true);
    window.addEventListener('keydown', hide, true);
    window.addEventListener('blur', hide);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('pointerover', over);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerdown', hide, true);
      window.removeEventListener('keydown', hide, true);
      window.removeEventListener('blur', hide);
    };
  }, []);
  if (!tip) return null;
  return createPortal(
    <div className={`tip ${tip.side}`} role="tooltip" style={{ left: tip.x, top: tip.y }}>{tip.text}</div>,
    document.body,
  );
}
