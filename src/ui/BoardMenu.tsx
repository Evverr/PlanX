import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { Glyph } from './glyphs';
import { usePanelSize, type PanelSize } from './panels/size';
import { setGridKind, useGridKind, type GridKind } from '../labs/boardGrid';
import { useLabs } from '../labs/labs';

/**
 * The board's menu, opened from the button after its name (Figma "Mol / Menu right"): first the board
 * saved in a file and such a file loaded as a new board, then keeping the panels as they've been put (or putting them back as by default), then the profile and the
 * settings (not there yet), then for now the mockup's items as they are: a row can end in a switch (two states, flipped by a click) or an
 * arrow for a further level, and a line splits the groups. Icons come from the set (picked at
 * random for now). The first rows' text is a shade lighter, as in the mockup.
 */
export function BoardMenu({ level = 0, onShare, onSave, onReset, onSaveBoard, onSaveBoardAs, onLoadBoard, onProfile, onSettings }: {
  level?: number; onShare?: () => void; onSave?: () => void; onReset?: () => void; onSaveBoard?: () => void; onSaveBoardAs?: () => void; onLoadBoard?: () => void;
  onProfile?: () => void; onSettings?: () => void;
}) {
  const [on, setOn] = useState(false), [on2, setOn2] = useState(false);
  const [panelSize, setPanelSize] = usePanelSize();
  const grid = useGridKind(), labs = useLabs();
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
  const arrow = <i className="menu-more" aria-hidden="true" />;
  return (
    <div ref={ref} className={`board-menu ${level ? 'sub' : ''} ${leftward ? 'leftward' : ''} ${anyIcon ? '' : 'plain'}`} role="menu" data-nosort>
      {level === 0 && <>
        {row('share', 'Поделиться', { onClick: onShare })}
        <div className="menu-line" />
        {row('download', 'Сохранить доску', { onClick: onSaveBoard })}
        {row('download', 'Сохранить как…', { onClick: onSaveBoardAs })}
        {row('upload', 'Загрузить доску', { onClick: onLoadBoard })}
        <div className="menu-line" />
        {row('save-template', 'Сохранить панели', { onClick: onSave })}
        {row('refresh-l', 'Сбросить панели', { onClick: onReset })}
        {row('collapse-l', 'Размер панелей', { end: <PickDots label="Размер панелей" now={panelSize} of={[['l', 'Большие'], ['m', 'Средние'], ['s', 'Маленькие']] as Array<[PanelSize, string]>} onPick={setPanelSize} /> })}
        {/* The features on trial are in "Настройки" now; these keep their place, three rows for now. */}
        {row('lightning-plus', 'Нововведения', { more: <Stub />, end: arrow })}
        <div className="menu-line" />
        {row('user-profile', 'Профиль', { onClick: onProfile })}
        {row('settings-l', 'Настройки', { onClick: onSettings })}
        <div className="menu-line" />
      </>}
      {/* "Фон доски" (src/labs). */}
      {level === 0 && labs.boardGrid
        ? row('apps', 'Фон', { end: <PickDots label="Фон" now={grid} of={[['lines', 'Линии'], ['dots', 'Точки'], ['none', 'Пусто']] as Array<[GridKind, string]>} onPick={setGridKind} /> })
        : row('link-settings', 'Оглавление', { light: true, onClick: () => setOn(!on), end: <Switch on={on} /> })}
      {row('change-order', 'Оглавление', { light: true, onClick: () => setOn2(!on2), end: <Switch on={on2} /> })}
    </div>
  );
}

/** A choice at the end of a row: a dot for each (the panels' size; what's on the board's background),
 *  the chosen one blue (a stand-in till they're drawn). Inside the row's button, so they're spans that
 *  act as buttons. */
function PickDots<T extends string>({ label, now, of, onPick }: { label: string; now: T; of: Array<[T, string]>; onPick: (v: T) => void }) {
  return (
    <span className="size-dots" role="radiogroup" aria-label={label}>
      {of.map(([v, name]) => (
        <span key={v} className={`size-dot ${now === v ? 'on' : ''}`} role="radio" aria-checked={now === v} aria-label={name} title={name}
          onClick={(e) => { e.stopPropagation(); onPick(v); }} />
      ))}
    </span>
  );
}

/** How many levels deep menus open from rows with an arrow. */
const MAX_LEVEL = 3;

/** The switch at the end of a row (Figma "Check" and "Check 2"): a blue track with the knob right when on,
 *  grey with it left when off. */
/** A further level that's still to come: three rows, no icons. */
function Stub() {
  return (
    <div className="board-menu sub plain" role="menu">
      {['Пункт 1', 'Пункт 2', 'Пункт 3'].map((label) => (
        <div key={label} className="menu-item"><button className="menu-row" role="menuitem"><span>{label}</span></button></div>
      ))}
    </div>
  );
}

export function Switch({ on }: { on: boolean }) {
  return <span className={`menu-switch ${on ? 'on' : ''}`} role="switch" aria-checked={on}><i /></span>;
}
