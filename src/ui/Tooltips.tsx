import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

/** How long the pointer rests on a button before its hint shows, and how soon after one hides the
 *  next shows straight away, in ms. */
const WAIT = 400, CARRY_ON = 300;

interface Tip { text: string; x: number; y: number; side: 'right' | 'above' | 'below' }

/**
 * The hints of the panels' buttons, from the Figma "Alt" bubble: shown in place of the browser's
 * own, which they take over by moving each button's title into data-tip when the pointer comes.
 * Beside the upright panels the bubble points at its button; over or under the flat bars it sits
 * centred on it.
 */
export function Tooltips() {
  const [tip, setTip] = useState<Tip | null>(null);
  useEffect(() => {
    let timer = 0, hiddenAt = 0, current: HTMLElement | null = null;
    const show = (el: HTMLElement) => {
      const text = el.dataset.tip;
      if (!text) return;
      const r = el.getBoundingClientRect(), panel = el.closest('.tools, .draw-panel');
      if (panel) setTip({ text, x: panel.getBoundingClientRect().right + 6, y: r.top + r.height / 2, side: 'right' });
      else {
        const bar = (el.closest('.bar, .tfmt, .tools-more') ?? el).getBoundingClientRect();
        const below = bar.top + bar.height / 2 < innerHeight / 2;
        setTip({ text, x: r.left + r.width / 2, y: below ? bar.bottom + 8 : bar.top - 8, side: below ? 'below' : 'above' });
      }
    };
    const hide = () => {
      clearTimeout(timer);
      if (current) hiddenAt = performance.now();
      current = null;
      setTip(null);
    };
    const over = (e: PointerEvent) => {
      const el = (e.target as Element | null)?.closest?.<HTMLElement>('[title], [data-tip]') ?? null;
      if (el === current) return;
      hide();
      if (!el || el.closest('.board-canvas')) return;
      // Take the hint over from the browser.
      if (el.title) { el.dataset.tip = el.title; el.removeAttribute('title'); }
      current = el;
      timer = window.setTimeout(() => show(el), performance.now() - hiddenAt < CARRY_ON ? 0 : WAIT);
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
    <div className={`tip ${tip.side}`} role="tooltip" style={{ left: tip.x, top: tip.y }}>{tip.text}</div>,
    document.body,
  );
}
