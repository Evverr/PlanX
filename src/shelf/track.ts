import { useEffect } from 'react';
import type { Board } from '../model/board';
import { folderUrl, placeOf, readFolders, readShelf, updateEntry, writeThumb } from './boards';
import { previewOf } from './preview';

/**
 * Keeps the open board's place on the shelf up to date: when it was opened and changed, its name,
 * how much is on it, and the picture of everything on it for its tile.
 */
export function useShelfTracking(boardId: string, board: Board): void {
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
      if (pictured === board.getVersion()) return;
      pictured = board.getVersion();
      writeThumb(boardId, previewOf(board));
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
  }, [boardId, board]);
}

/** Where the way back from a board leads: the folder it's in on the shelf. */
export function shelfUrlFor(boardId: string): string {
  return folderUrl(placeOf(readShelf()?.find((b) => b.id === boardId)?.folder, readFolders()));
}
