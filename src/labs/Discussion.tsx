import { useEffect, useSyncExternalStore } from 'react';
import { WishlistPage } from './WishlistPage';

/**
 * "Обсуждение": the chat button on the left rail opens a big panel on the right, white as the panels,
 * from under the others' pictures at the top right down to over the zoom bar, over the right rail while
 * it's open. In it for now the wishlist (src/labs/WishlistPage.tsx). The comments on the board are on
 * the zoom bar's button meanwhile.
 */

let open = false;
const listeners = new Set<() => void>();
export const discussionOpen = (): boolean => open;
export function setDiscussionOpen(on: boolean): void {
  open = on;
  listeners.forEach((fn) => fn());
}
export const useDiscussionOpen = (): boolean =>
  useSyncExternalStore((fn) => { listeners.add(fn); return () => { listeners.delete(fn); }; }, () => open);

export function Discussion() {
  const on = useDiscussionOpen();
  useEffect(() => {
    if (!on) return;
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape' && !(e.target as Element)?.closest?.('.discussion textarea')) setDiscussionOpen(false); };
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [on]);
  if (!on) return null;
  return (
    <aside className="discussion" aria-label="Обсуждение">
      <div className="discussion-head">
        <h2>Обсуждение</h2>
        <button className="discussion-close" title="Закрыть" aria-label="Закрыть" onClick={() => setDiscussionOpen(false)}>×</button>
      </div>
      <div className="discussion-body"><WishlistPage /></div>
    </aside>
  );
}
