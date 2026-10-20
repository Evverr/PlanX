import { createRoot } from 'react-dom/client';
import { App } from './App';
import { boardIdFromUrl } from './collab/connection';
import './styles.css';

// No StrictMode: its double-mounted effects would open and close the sync connection twice.
createRoot(document.getElementById('root')!).render(<App boardId={boardIdFromUrl()} />);
