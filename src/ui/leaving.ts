/**
 * Popups go away as they came, but quicker: whatever of them is taken off the page stays a moment as
 * a copy where it was, fading out in half the time it came in (see "How every popup comes in" in
 * moves.css), then goes. None of them has to wait to be taken off for it.
 */
// The same popups as moves.css lists (but the text panel, which fades out on its own), and the dim
// behind a window (going with what's on it).
const POPUPS = '.pop, .board-menu, .more-pop, .op-pop, .color-picker, .tf-menu, .tools-more, .draw-panel, .comment-menu, .tile-menu, .minimap, .modal, .peek, .comment-card, .labs-pill, .ink-style, .modal-dim, .peek-overlay, .labs-backdrop';

function fadeOut(el: HTMLElement, parent: Node, next: Node | null): void {
  const ghost = el.cloneNode(true) as HTMLElement;
  // A copy of a canvas is blank: what's drawn in it goes along.
  const from = el.querySelectorAll('canvas'), to = ghost.querySelectorAll('canvas');
  from.forEach((c, i) => { try { to[i].getContext('2d')?.drawImage(c, 0, 0); } catch { /* left blank */ } });
  ghost.classList.add('gone');
  ghost.setAttribute('aria-hidden', 'true');
  ghost.inert = true;
  parent.insertBefore(ghost, next && next.parentNode === parent ? next : null);
  const done = () => ghost.remove();
  ghost.addEventListener('animationend', done, { once: true });
  setTimeout(done, 200);
}

/** Watches the page for popups taken off it and fades each out where it was. */
export function fadeOutPopups(): void {
  if (typeof MutationObserver === 'undefined' || matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
  new MutationObserver((records) => {
    for (const rec of records) {
      if (!rec.target.isConnected) continue;
      // (One taken off with what holds it, the panel it opens from, goes with it.)
      for (const n of rec.removedNodes) if (n instanceof HTMLElement && !n.classList.contains('gone') && n.matches(POPUPS)) fadeOut(n, rec.target, rec.nextSibling);
    }
  }).observe(document.body, { childList: true, subtree: true });
}
