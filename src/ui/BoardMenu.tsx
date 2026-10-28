import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { Glyph } from './glyphs';
import dropIcon from './menu/drop.svg';
import { usePanelSize, type PanelSize } from './panels/size';
import { LabsMenu } from '../labs/LabsMenu';

/**
 * The board's menu, opened from the button after its name (Figma "Mol / Menu right"): first the board
 * saved in a file and such a file loaded as a new board, then keeping the panels as they've been put (or putting them back as by default), then the profile and the
 * settings (not there yet), then for now the mockup's items as they are: a row can end in a switch (two states, flipped by a click) or an
 * arrow for a further level, and a line splits the groups. Icons come from the set (picked at
 * random for now). The first rows' text is a shade lighter, as in the mockup.
 */
export function BoardMenu({ level = 0, onShare, onSave, onReset, onSaveBoard, onLoadBoard }: {
  level?: number; onShare?: () => void; onSave?: () => void; onReset?: () => void; onSaveBoard?: () => void; onLoadBoard?: () => void;
}) {
  const [on, setOn] = useState(false);
  const [panelSize, setPanelSize] = usePanelSize();
  // A row with an arrow opens a further level beside it (the same menu again, or the one it brings)
  // while the pointer is on it (or its menu); `sub` is that row's label.
  const [sub, setSub] = useState<string | null>(null);
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
  const row = (icon: string, label: string, { end, onClick, light, more }: { end?: ReactNode; onClick?: () => void; light?: boolean; more?: boolean | ReactNode } = {}) => {
    const withIcon = iconed(n++), open = !!more && sub === label;
    return (
    <div className="menu-item" onPointerEnter={() => setSub(more ? label : null)}>
      <button className={`menu-row ${light ? 'light' : ''} ${anyIcon && !withIcon ? 'indent' : ''}`} role="menuitem" aria-haspopup={!!more || undefined} aria-expanded={more ? open : undefined}
        onClick={more ? () => setSub(label) : onClick}>
        {withIcon && <Glyph id={icon} className="menu-icon" />}
        <span>{label}</span>
        {end}
      </button>
      {open && (more === true ? level < MAX_LEVEL && <BoardMenu level={level + 1} /> : more)}
    </div>
    );
  };
  const arrow = <img className="menu-more" src={dropIcon} alt="" width={24} height={24} />;
  return (
    <div ref={ref} className={`board-menu ${level ? 'sub' : ''} ${leftward ? 'leftward' : ''} ${anyIcon ? '' : 'plain'}`} role="menu" data-nosort>
      {level === 0 && <>
        {row('share', 'Поделиться', { onClick: onShare })}
        <div className="menu-line" />
        {row('download', 'Сохранить доску', { onClick: onSaveBoard })}
        {row('upload', 'Загрузить доску', { onClick: onLoadBoard })}
        <div className="menu-line" />
        {row('save-template', 'Сохранить панели', { onClick: onSave })}
        {row('refresh-l', 'Сбросить панели', { onClick: onReset })}
        {row('collapse-l', 'Размер панелей', { end: <SizeDots size={panelSize} onPick={setPanelSize} /> })}
        {row('lightning-plus', 'Нововведения', { more: <LabsMenu half={1} />, end: arrow })}
        <div className="menu-line" />
        {row('user-profile', 'Профиль')}
        {row('settings-l', 'Настройки')}
        <div className="menu-line" />
      </>}
      {row('link-settings', 'Оглавление', { light: true, onClick: () => setOn(!on), end: <Switch on={on} /> })}
      {/* The second half of the features on trial. */}
      {row('change-order', 'Оглавление', { light: true, more: <LabsMenu half={2} />, end: arrow })}
    </div>
  );
}

/** The panels' size at the end of a row: three dots, large, medium and small, the chosen one blue
 *  (a stand-in till they're drawn). Inside the row's button, so they're spans that act as buttons. */
function SizeDots({ size, onPick }: { size: PanelSize; onPick: (s: PanelSize) => void }) {
  const sizes: Array<[PanelSize, string]> = [['l', 'Большие'], ['m', 'Средние'], ['s', 'Маленькие']];
  return (
    <span className="size-dots" role="radiogroup" aria-label="Размер панелей">
      {sizes.map(([s, label]) => (
        <span key={s} className={`size-dot ${size === s ? 'on' : ''}`} role="radio" aria-checked={size === s} aria-label={label} title={label}
          onClick={(e) => { e.stopPropagation(); onPick(s); }} />
      ))}
    </span>
  );
}

/** How many levels deep menus open from rows with an arrow. */
const MAX_LEVEL = 3;

/** The switch at the end of a row (Figma "Check" and "Check 2"): a blue track with the knob right when on,
 *  grey with it left when off. */
export function Switch({ on }: { on: boolean }) {
  return <span className={`menu-switch ${on ? 'on' : ''}`} role="switch" aria-checked={on}><i /></span>;
}
