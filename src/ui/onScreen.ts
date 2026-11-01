/**
 * Menus kept on the screen: any menu or drop-down list that opens past an edge (a board menu's further
 * level, "Нововведения", "Оглавление", a panel's drop-down) is moved back in, 8 px off the edge; one taller
 * than the screen gets as tall as it and scrolls.
 */
const MENUS = '.board-menu, .op-pop, [role="menu"]';
const EDGE = 8;

function fit(el: HTMLElement): void {
  el.style.translate = '';
  const r = el.getBoundingClientRect();
  if (!r.width && !r.height) return;
  if (r.height > innerHeight - EDGE * 2) { el.style.maxHeight = `${innerHeight - EDGE * 2}px`; el.style.overflowY = 'auto'; }
  const h = Math.min(r.height, innerHeight - EDGE * 2), w = r.width;
  const dy = r.top + h > innerHeight - EDGE ? innerHeight - EDGE - h - r.top : r.top < EDGE ? EDGE - r.top : 0;
  const dx = r.left + w > innerWidth - EDGE ? Math.max(EDGE - r.left, innerWidth - EDGE - w - r.left) : r.left < EDGE ? EDGE - r.left : 0;
  if (dx || dy) el.style.translate = `${Math.round(dx)}px ${Math.round(dy)}px`;
}

/** Watches the page for menus opening (or growing) and keeps each on the screen. */
export function keepMenusOnScreen(): void {
  if (typeof MutationObserver === 'undefined') return;
  const pending = new Set<HTMLElement>();
  let frame = 0;
  const later = (el: HTMLElement) => {
    pending.add(el);
    // After the menu's own placing (a level turned leftward and such) is done.
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => { pending.forEach((m) => { if (m.isConnected) fit(m); }); pending.clear(); });
  };
  new MutationObserver((records) => {
    for (const rec of records) {
      for (const n of rec.addedNodes) {
        if (!(n instanceof HTMLElement)) continue;
        if (n.matches(MENUS)) later(n);
        n.querySelectorAll<HTMLElement>(MENUS).forEach(later);
      }
      // Something added inside a menu (a further level, more rows): it's looked at again.
      const host = rec.target instanceof HTMLElement ? rec.target.closest<HTMLElement>(MENUS) : null;
      if (host && rec.addedNodes.length) later(host);
    }
  }).observe(document.body, { childList: true, subtree: true });
}
