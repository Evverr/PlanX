/** How far every panel stands from the screen's edges, and at least from one another. */
export const EDGE = 12;

/** A box on screen. */
export interface Box { left: number; top: number; width: number; height: number }

/** The boxes on screen of what matches the selector and is showing (but `except`). */
export function shownRects(selector: string, except?: Element | null): DOMRect[] {
  return [...document.querySelectorAll(selector)].filter((el) => el !== except && !el.classList.contains('gone')).map((el) => el.getBoundingClientRect()).filter((r) => r.width && r.height);
}

/** Whether a box comes within `gap` of another (or over it). */
export function crowds(a: Box, b: Box, gap = EDGE): boolean {
  return a.left < b.left + b.width + gap && a.left + a.width > b.left - gap && a.top < b.top + b.height + gap && a.top + a.height > b.top - gap;
}

/**
 * A popover opened from a panel (its palette, a menu of its button), above or below the panel as it
 * opens by itself: turned to the other side when it would lie over the panel or past the window's
 * edge (under the top bar, when level with it), if there's room there. `.down`/`.up` turn it.
 */
export function fitPopover(pop: HTMLElement, panel: Element): void {
  pop.classList.remove('down', 'up');
  const bad = () => {
    const r = pop.getBoundingClientRect(), b = panel.getBoundingClientRect(), bar = document.querySelector('.topbar')?.getBoundingClientRect();
    const top = (bar && bar.left < r.right && bar.right > r.left && bar.top < innerHeight / 2 ? bar.bottom : 0) + EDGE;
    return (r.top < b.bottom && r.bottom > b.top) || r.top < top || r.bottom > innerHeight - EDGE;
  };
  if (!bad()) return;
  const above = pop.getBoundingClientRect().top < panel.getBoundingClientRect().top;
  pop.classList.add(above ? 'down' : 'up');
  if (bad()) pop.classList.remove('down', 'up');
}

/** Keeps every popover opened from `panel` (matching `selector`) clear of it, as it opens. */
export function fitPopovers(panel: HTMLElement, selector: string): () => void {
  const mo = new MutationObserver((records) => {
    for (const r of records) for (const n of r.addedNodes) {
      if (!(n instanceof HTMLElement)) continue;
      const pops = n.matches(selector) ? [n] : [...n.querySelectorAll<HTMLElement>(selector)];
      pops.forEach((p) => fitPopover(p, panel));
    }
  });
  mo.observe(panel, { childList: true, subtree: true });
  return () => mo.disconnect();
}
