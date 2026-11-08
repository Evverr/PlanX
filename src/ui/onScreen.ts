/**
 * Menus kept on the screen: any menu or drop-down list that opens past an edge (a board menu's further
 * level, "Нововведения", a panel's drop-down) is moved back in, 8 px off the edge and clear of the tool
 * rail when level with it; one taller than the screen gets as tall as it and scrolls. And kept there
 * while it's open: the panel it opened from moving (what's picked laid out anew, say), it's moved in again.
 */
const MENUS = '.board-menu, .op-pop, [role="menu"], .color-picker:not(.floating), .tf-menu';
const EDGE = 8;

/** How far it's moved in now (its `translate`). */
function shifted(el: HTMLElement): [number, number] {
  const [x = '0', y = '0'] = el.style.translate.split(' ');
  return [parseFloat(x) || 0, parseFloat(y) || 0];
}

/** Moves it in as far as it has to be, from where it would stand by itself (measured with what it's
 *  moved by now taken back out). */
function fit(el: HTMLElement, first = false): void {
  const running = el.getAnimations().some((a) => a.playState === 'running');
  // (Later, only once it's come in: not measured on its way, sliding.)
  if (running && !first) return;
  // Measured where it comes to, not on its way in (see "come-in" in moves.css): the slide is stopped
  // for the measuring and starts again, still in its first frame.
  if (running) el.style.animation = 'none';
  const r = el.getBoundingClientRect(), [tx, ty] = shifted(el);
  if (running) el.style.animation = '';
  if (!r.width && !r.height) return;
  if (r.height > innerHeight - EDGE * 2) { el.style.maxHeight = `${innerHeight - EDGE * 2}px`; el.style.overflowY = 'auto'; }
  const h = Math.min(r.height, innerHeight - EDGE * 2), w = r.width, left = r.left - tx, top = r.top - ty;
  // (The tool rail at the left, level with it: kept clear of, as of the edge.)
  const rail = document.querySelector('.tools')?.getBoundingClientRect();
  const min = rail && rail.width && rail.bottom > top && rail.top < top + h && left < rail.right && !el.closest('.tools') ? rail.right + EDGE : EDGE;
  const dy = top + h > innerHeight - EDGE ? innerHeight - EDGE - h - top : top < EDGE ? EDGE - top : 0;
  const dx = left + w > innerWidth - EDGE ? Math.max(min - left, innerWidth - EDGE - w - left) : left < min ? min - left : 0;
  if (Math.round(dx) !== Math.round(tx) || Math.round(dy) !== Math.round(ty)) el.style.translate = dx || dy ? `${Math.round(dx)}px ${Math.round(dy)}px` : '';
}

/** Watches the page for menus opening (or growing) and keeps each on the screen while it's open. */
export function keepMenusOnScreen(): void {
  if (typeof MutationObserver === 'undefined') return;
  const open = new Set<HTMLElement>(), fresh = new Set<HTMLElement>();
  let frame = 0;
  // Each frame while any is open: the new ones fitted (after their own placing, a level turned leftward
  // and such), the others again if what they opened from has moved.
  const tick = () => {
    frame = 0;
    for (const m of [...open]) {
      if (!m.isConnected) { open.delete(m); fresh.delete(m); continue; }
      fit(m, fresh.has(m));
    }
    fresh.clear();
    if (open.size) frame = requestAnimationFrame(tick);
  };
  const later = (el: HTMLElement) => {
    open.add(el);
    fresh.add(el);
    if (!frame) frame = requestAnimationFrame(tick);
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
