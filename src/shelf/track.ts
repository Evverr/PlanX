import { useEffect } from 'react';
import type { Board } from '../model/board';
import { readShelf, updateEntry, writeThumb } from './boards';

/** The picture on the cover's window: this wide, as the screen was left. */
const THUMB_W = 320;

/** Takes a small picture of the board as it's shown now. */
function snapshot(canvas: HTMLCanvasElement): string | null {
  if (!canvas.width || !canvas.height) return null;
  const small = document.createElement('canvas');
  small.width = THUMB_W;
  small.height = Math.round((THUMB_W * canvas.height) / canvas.width);
  const ctx = small.getContext('2d');
  if (!ctx) return null;
  ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--bg') || '#ECEEF2';
  ctx.fillRect(0, 0, small.width, small.height);
  ctx.drawImage(canvas, 0, 0, small.width, small.height);
  try { return small.toDataURL('image/webp', 0.7); } catch { return null; }
}

/**
 * Keeps the open board's place on the shelf up to date: when it was opened and changed, its name,
 * how much is on it, and a picture of it for the cover.
 */
export function useShelfTracking(boardId: string, board: Board, canvas: React.RefObject<HTMLCanvasElement>): void {
  useEffect(() => {
    const known = readShelf()?.some((b) => b.id === boardId);
    updateEntry(boardId, { opened: Date.now(), ...(known ? {} : { title: board.title, items: board.list().length }) });

    let seen = board.getVersion(), timer = 0, pictured = -1;
    const note = () => {
      timer = 0;
      updateEntry(boardId, { title: board.title, items: board.list().length, ...(board.getVersion() !== seen ? { edited: Date.now() } : {}) });
      seen = board.getVersion();
    };
    const off = board.subscribe(() => { if (!timer) timer = window.setTimeout(note, 1000); });
    const picture = () => {
      if (pictured === board.getVersion() || !canvas.current) return;
      pictured = board.getVersion();
      const url = snapshot(canvas.current);
      if (url) writeThumb(boardId, url);
    };
    // A picture now and then while working, and when the tab is hidden or left.
    const every = window.setInterval(picture, 20000);
    const first = window.setTimeout(picture, 3000);
    const hidden = () => { if (document.visibilityState === 'hidden') { if (timer) note(); picture(); } };
    document.addEventListener('visibilitychange', hidden);
    window.addEventListener('pagehide', picture);
    window.addEventListener('planx:leave', picture);
    return () => {
      off();
      clearTimeout(timer);
      clearTimeout(first);
      clearInterval(every);
      document.removeEventListener('visibilitychange', hidden);
      window.removeEventListener('pagehide', picture);
      window.removeEventListener('planx:leave', picture);
    };
  }, [boardId, board, canvas]);
}
