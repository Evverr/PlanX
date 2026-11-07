import { useEffect, useRef } from 'react';
import { Glyph } from '../ui/glyphs';

/**
 * "Боковая панель": a dark side opening from the left edge by the logo, 200 wide, with the boards (the
 * start page, its folders and boards), the profile and the settings, all on this page. A press anywhere
 * else, Esc or the logo again puts it away.
 */
export function SideNav({ onBoards, onProfile, onSettings, onClose }: { onBoards: () => void; onProfile: () => void; onSettings: () => void; onClose: () => void }) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const away = (e: PointerEvent) => { const t = e.target as Element; if (!ref.current?.contains(t) && !t.closest?.('.logo')) onClose(); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('pointerdown', away, true);
    window.addEventListener('keydown', esc, true);
    return () => { window.removeEventListener('pointerdown', away, true); window.removeEventListener('keydown', esc, true); };
  }, [onClose]);
  const row = (icon: string, label: string, run: () => void) => (
    <button className="side-nav-row" onClick={() => { onClose(); run(); }}><Glyph id={icon} className="side-nav-icon" /><span>{label}</span></button>
  );
  return (
    <nav ref={ref} className="side-nav" aria-label="Боковая панель">
      <div className="side-nav-logo">Plan</div>
      {row('folders', 'Доски', onBoards)}
      {row('user-profile', 'Профиль', onProfile)}
      {row('settings-l', 'Настройки', onSettings)}
    </nav>
  );
}
