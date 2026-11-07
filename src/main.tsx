import './fonts.css';
import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { ShelfPage } from './shelf/ShelfPage';
import { boardIdFromUrl } from './collab/connection';
import './styles.css';
import { keepMenusOnScreen } from './ui/onScreen';
import { fadeOutPopups } from './ui/leaving';
import { keepLinksHere } from './route';

/** One page for all (see route.ts): the board in the address, or with none the shelf of boards, the start
 *  page; another board, its own App (the one before closed, its connection and all). */
function Root() {
  const [boardId, setBoardId] = useState(boardIdFromUrl);
  useEffect(() => {
    const on = () => setBoardId(boardIdFromUrl());
    window.addEventListener('popstate', on);
    return () => window.removeEventListener('popstate', on);
  }, []);
  return boardId ? <App key={boardId} boardId={boardId} /> : <ShelfPage />;
}

// No StrictMode: its double-mounted effects would open and close the sync connection twice.
keepMenusOnScreen();
fadeOutPopups();
keepLinksHere();
createRoot(document.getElementById('root')!).render(<Root />);
