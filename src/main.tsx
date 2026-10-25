import './fonts.css';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { ShelfPage } from './shelf/ShelfPage';
import { boardIdFromUrl } from './collab/connection';
import './styles.css';

// No StrictMode: its double-mounted effects would open and close the sync connection twice.
// With no board in the address, the shelf of boards opens: the start page.
const boardId = boardIdFromUrl();
createRoot(document.getElementById('root')!).render(boardId ? <App boardId={boardId} /> : <ShelfPage />);
