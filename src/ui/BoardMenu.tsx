import { useState, type ReactNode } from 'react';
import imageIcon from './menu/image.svg';
import bookmarkIcon from './menu/bookmark.svg';
import dropIcon from './menu/drop.svg';

/**
 * The board's menu, opened from the button after its name (Figma "Mol / Menu right"), for now with the mockup's items as they are: a
 * row can end in a switch (two states, flipped by a click) or an arrow for a further level, and a
 * line splits the groups. The first rows' text is a shade lighter, as in the mockup.
 */
export function BoardMenu({ level = 0 }: { level?: number }) {
  const [on, setOn] = useState(false);
  // A row with an arrow opens the same menu again beside it while the pointer is on it (or its menu).
  const [sub, setSub] = useState(false);
  const row = (icon: string, label: string, { end, onClick, light, more }: { end?: ReactNode; onClick?: () => void; light?: boolean; more?: boolean } = {}) => (
    <div className="menu-item" onPointerEnter={() => setSub(!!more)}>
      <button className={`menu-row ${light ? 'light' : ''}`} role="menuitem" aria-haspopup={more || undefined} aria-expanded={more ? sub : undefined}
        onClick={more ? () => setSub(true) : onClick}>
        <img src={icon} alt="" width={24} height={24} />
        <span>{label}</span>
        {end}
      </button>
      {more && sub && level < MAX_LEVEL && <BoardMenu level={level + 1} />}
    </div>
  );
  return (
    <div className={`board-menu ${level ? 'sub' : ''}`} role="menu" data-nosort>
      {row(imageIcon, 'Оглавление', { light: true, onClick: () => setOn(!on), end: <Switch on={on} /> })}
      {row(imageIcon, 'Оглавление', { light: true, more: true, end: <img className="menu-more" src={dropIcon} alt="" width={24} height={24} /> })}
      {row(imageIcon, 'Преобразовать текст в таблицу')}
      {row(imageIcon, 'Параметры оглавления')}
      <div className="menu-line" />
      {row(imageIcon, 'Добавить сноску')}
      {row(imageIcon, 'Добавить концевую сноску')}
      {row(bookmarkIcon, 'Закладки')}
    </div>
  );
}

/** How many levels deep menus open from rows with an arrow. */
const MAX_LEVEL = 3;

/** The switch at the end of a row (Figma "Check" and "Check 2"): a blue track with the knob right when on,
 *  grey with it left when off. */
function Switch({ on }: { on: boolean }) {
  return <span className={`menu-switch ${on ? 'on' : ''}`} role="switch" aria-checked={on}><i /></span>;
}
