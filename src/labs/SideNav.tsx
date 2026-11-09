import { useState, useSyncExternalStore } from 'react';
import { Glyph } from '../ui/glyphs';
import { ProfileDialog, SettingsDialog } from '../ui/Dialogs';
import { readJSON, readText, writeJSON, writeText } from '../storage';
import { navigate } from '../route';

/**
 * "Боковая панель": a dark side down the left edge, 200 wide, opened by the board's logo (its own leading
 * to the boards; its cross, by the board or the boards, putting it away for them to fill the window), kept open
 * whatever's beside it: the board worked on («Работа»), the boards (the shelf, its folders), the profile, the settings and, at its
 * foot, the help, each a page beside it on this one page (see main.tsx), the board put away.
 */

const KEY = 'planx-side';
let open = readText(KEY) === '1';
const listeners = new Set<() => void>();

/** Whether the side is open (kept for the next visit). */
export const sideOpen = (): boolean => open;
export function setSideOpen(on: boolean): void {
  open = on;
  writeText(KEY, on ? '1' : '');
  listeners.forEach((fn) => fn());
}
export const useSideOpen = (): boolean =>
  useSyncExternalStore((fn) => { listeners.add(fn); return () => { listeners.delete(fn); }; }, () => open);

/** The pages the side leads to besides the boards: in the address as ?page=… */
export type SidePage = 'settings' | 'profile' | 'help' | 'home';
export const sidePageFromUrl = (): SidePage | null => {
  const p = new URLSearchParams(location.search).get('page');
  return p === 'settings' || p === 'profile' || p === 'help' || p === 'home' ? p : null;
};
const pageUrl = (p: SidePage | null) => (p ? `${location.pathname}?page=${p}` : location.pathname);

export function SideNav({ page, board }: { page: SidePage | null; board: boolean }) {
  const row = (icon: string, label: string, to: SidePage | null, on: boolean) => (
    <button className={`side-nav-row ${on ? 'on' : ''}`} aria-current={on ? 'page' : undefined} onClick={() => navigate(pageUrl(to))}>
      <Glyph id={icon} className="side-nav-icon" /><span>{label}</span>
    </button>
  );
  return (
    <nav className="side-nav" aria-label="Боковая панель">
      <div className="side-nav-top">
        {/* (Straight to the boards.) */}
        <button className="side-nav-logo" title="Доски" aria-label="Доски" onClick={() => navigate(pageUrl(null))}>Plan</button>
        {/* With the board or the boards beside it: put away, they fill the window. */}
        {(board || !page) && <button className="side-nav-close" title="Свернуть панель" aria-label="Свернуть панель" onClick={() => setSideOpen(false)}>×</button>}
      </div>
      <button className={`side-nav-row ${board ? 'on' : ''}`} aria-current={board ? 'page' : undefined} onClick={toWork}>
        <Glyph id="board" className="side-nav-icon" /><span>Работа</span>
      </button>
      {row('folders', 'Доски', null, !page && !board)}
      {row('user-profile', 'Профиль', 'profile', page === 'profile')}
      {row('settings-l', 'Настройки', 'settings', page === 'settings')}
      <span className="side-nav-gap" />
      <button className={`side-nav-help ${page === 'help' ? 'on' : ''}`} title="Помощь" aria-label="Помощь" onClick={() => navigate(pageUrl('help'))}>?</button>
    </nav>
  );
}

/** «Работа»: the board worked on last (see App), or the boards with none yet. */
const LAST = 'planx-last-board';
export const noteBoard = (id: string): void => writeText(LAST, id);
function toWork() {
  const id = readText(LAST);
  navigate(id && /^[A-Za-z0-9_-]{1,64}$/.test(id) ? `${location.pathname}?board=${id}` : location.pathname);
}

/** A page the side leads to, beside it. */
export function SidePageView({ page }: { page: SidePage }) {
  if (page === 'settings') return <SettingsPage />;
  if (page === 'profile') return <ProfilePage />;
  if (page === 'home') return (
    <section className="page-view home-page" aria-label="Начало">
      <div className="hero">
        <h1>Планируйте вместе</h1>
        <p>Доска для идей, задач и схем: стикеры, майнд-карты, таймлайны и задачи на одном холсте, а рядом вся команда.</p>
        <div className="hero-actions">
          <button className="btn primary" onClick={toWork}>Продолжить работу</button>
          <button className="btn" onClick={() => navigate(location.pathname)}>Мои доски</button>
        </div>
      </div>
    </section>
  );
  return (
    <section className="page-view help-page" aria-label="Помощь">
      <h1>Помощь</h1>
      <p>Здесь скоро будут ответы на частые вопросы, подсказки и горячие клавиши.</p>
    </section>
  );
}

/** «Настройки» as a page: the theme kept as the board keeps it (planx-theme). */
function SettingsPage() {
  const [dark, setDark] = useState(() => document.documentElement.dataset.theme === 'dark');
  const flip = () => {
    const next = dark ? 'light' : 'dark';
    setDark(!dark);
    writeText('planx-theme', next);
    document.documentElement.dataset.theme = next;
  };
  return <SettingsDialog page dark={dark} onDark={flip} onClose={() => {}} />;
}

/** «Профиль» as a page: the name kept as the board keeps it (planx-me, see collab/connection.ts). */
function ProfilePage() {
  const me = readJSON<{ name?: string }>('planx-me') ?? {};
  return <ProfileDialog page name={me.name ?? ''} onRename={(name) => writeJSON('planx-me', { ...me, name: name.slice(0, 24) })} onClose={() => {}} />;
}
