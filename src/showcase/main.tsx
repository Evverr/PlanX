import '../fonts.css';
import { createRoot } from 'react-dom/client';
import '../styles.css';
import '../labs/labs.css';
import './showcase.css';
import { Showcase } from './Showcase';

// «Витрина»: every panel and popup of the board on one page (showcase.html, see Showcase.tsx).
createRoot(document.getElementById('root')!).render(<Showcase />);
