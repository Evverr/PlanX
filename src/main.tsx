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
import { useLabs } from './labs/labs';
import { SideNav, SidePageView, sidePageFromUrl, useSideOpen } from './labs/SideNav';
import { readText } from './storage';
import { setSideOffset } from './labs/sideViewport';

/** One page for all (see route.ts): the board in the address, a page of the side's ("Боковая панель",
 *  src/labs), or with neither the shelf of boards, the start page; another board, its own App (the one
 *  before closed, its connection and all). The side, open, stays whatever's beside it, pushing it over. */
function Root() {
  const [boardId, setBoardId] = useState(boardIdFromUrl);
  const [page, setPage] = useState(sidePageFromUrl);
  useEffect(() => {
    const on = () => { setBoardId(boardIdFromUrl()); setPage(sidePageFromUrl()); };
    window.addEventListener('popstate', on);
    return () => window.removeEventListener('popstate', on);
  }, []);
  const labs = useLabs(), sideOn = useSideOpen(), side = labs.sideNav && sideOn;
  // A board beside the side: pushed over by it (see labs/sideViewport.ts).
  useEffect(() => setSideOffset(side && boardId ? 200 : 0), [side, boardId]);
  // (A page of the side's, without a board: the theme the board keeps.)
  useEffect(() => { if (page && !boardId) document.documentElement.dataset.theme = readText('planx-theme') === 'dark' ? 'dark' : 'light'; }, [page, boardId]);
  const content = boardId ? <App key={boardId} boardId={boardId} /> : page ? <SidePageView page={page} /> : <ShelfPage />;
  return (
    <div className={`app-shell ${side ? 'side-open' : ''} ${boardId ? 'on-board' : ''}`}>
      {side && <SideNav page={page} board={!!boardId} />}
      <div className="app-content">{content}</div>
    </div>
  );
}

// No StrictMode: its double-mounted effects would open and close the sync connection twice.
keepMenusOnScreen();
fadeOutPopups();
keepLinksHere();
createRoot(document.getElementById('root')!).render(<Root />);
