/**
 * One page for all of PlanX: going to a board, back to the shelf or into a folder changes the address
 * without loading the page again (the board's or the shelf's view is swapped in, see main.tsx). The back
 * and forward buttons go where they did; a link opened in a new tab or window still opens there.
 */

/** Goes to an address of this page's (a board's, a folder's, the shelf's): the address bar and the view. */
export function navigate(url: string, replace = false): void {
  if (replace) history.replaceState(null, '', url);
  else history.pushState(null, '', url);
  // (As the back button would: what shows the address now takes it up.)
  window.dispatchEvent(new PopStateEvent('popstate'));
}

/** Links to this page's own addresses go there on this page, unless meant for another tab or window. */
export function keepLinksHere(): void {
  document.addEventListener('click', (e) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const a = (e.target as Element | null)?.closest?.('a[href]') as HTMLAnchorElement | null;
    if (!a || (a.target && a.target !== '_self') || a.hasAttribute('download')) return;
    const to = new URL(a.href, location.href);
    if (to.origin !== location.origin || to.pathname !== location.pathname) return;
    e.preventDefault();
    navigate(to.pathname + to.search + to.hash);
  });
}
