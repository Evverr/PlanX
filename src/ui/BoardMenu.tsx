import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { Glyph } from './glyphs';
import dropIcon from './menu/drop.svg';

/**
 * The board's menu, opened from the button after its name (Figma "Mol / Menu right"), for now with
 * the mockup's items as they are: a row can end in a switch (two states, flipped by a click) or an
 * arrow for a further level, and a line splits the groups. Icons come from the set (picked at
 * random for now). The first rows' text is a shade lighter, as in the mockup.
 */
export function BoardMenu({ level = 0 }: { level?: number }) {
  const [on, setOn] = useState(false);
  // A row with an arrow opens the same menu again beside it while the pointer is on it (or its menu).
  const [sub, setSub] = useState(false);
  // Icons: every row on the first level, none on the second, just the first row on the third (to
  // try out a menu where rows without one line their text up with the row that has one).
  let n = 0;
  const iconed = (i: number) => level === 0 || (level === 2 && i === 0);
  const anyIcon = level === 0 || level === 2;
  // A further level opens to the right of its row, or to the left where the screen ends.
  const ref = useRef<HTMLDivElement>(null);
  const [leftward, setLeftward] = useState(false);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || !level || leftward) return;
    if (el.getBoundingClientRect().right > innerWidth - 8) setLeftward(true);
  }, [level, leftward]);
  const row = (icon: string, label: string, { end, onClick, light, more }: { end?: ReactNode; onClick?: () => void; light?: boolean; more?: boolean } = {}) => {
    const withIcon = iconed(n++);
    return (
    <div className="menu-item" onPointerEnter={() => setSub(!!more)}>
      <button className={`menu-row ${light ? 'light' : ''} ${anyIcon && !withIcon ? 'indent' : ''}`} role="menuitem" aria-haspopup={more || undefined} aria-expanded={more ? sub : undefined}
        onClick={more ? () => setSub(true) : onClick}>
        {withIcon && <Glyph id={icon} className="menu-icon" />}
        <span>{label}</span>
        {end}
      </button>
      {more && sub && level < MAX_LEVEL && <BoardMenu level={level + 1} />}
    </div>
    );
  };
  return (
    <div ref={ref} className={`board-menu ${level ? 'sub' : ''} ${leftward ? 'leftward' : ''} ${anyIcon ? '' : 'plain'}`} role="menu" data-nosort>
      {row('link-settings', 'Оглавление', { light: true, onClick: () => setOn(!on), end: <Switch on={on} /> })}
      {row('change-order', 'Оглавление', { light: true, more: true, end: <img className="menu-more" src={dropIcon} alt="" width={24} height={24} /> })}
      {row('broom', 'Преобразовать текст в таблицу')}
      {row('server-settings', 'Параметры оглавления')}
      <div className="menu-line" />
      {row('message-to', 'Добавить сноску')}
      {row('statistics-arrow', 'Добавить концевую сноску')}
      {row('reply', 'Закладки')}
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
