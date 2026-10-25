import { useLayoutEffect, useRef, useState } from 'react';
import { Glyph } from '../ui/glyphs';
import { Switch } from '../ui/BoardMenu';
import { LABS, setLab, useLabs } from './labs';

/** The board menu's "Нововведения" level: every feature on trial with its switch. */
export function LabsMenu() {
  const labs = useLabs();
  // To the right of its row, or to the left where the screen ends (as the menu's other levels).
  const ref = useRef<HTMLDivElement>(null);
  const [leftward, setLeftward] = useState(false);
  useLayoutEffect(() => {
    const el = ref.current;
    if (el && !leftward && el.getBoundingClientRect().right > innerWidth - 8) setLeftward(true);
  }, [leftward]);
  return (
    <div ref={ref} className={`board-menu sub labs-menu ${leftward ? 'leftward' : ''}`} role="menu" aria-label="Нововведения" data-nosort>
      {LABS.map((l) => (
        <div className="menu-item" key={l.id}>
          <button className="menu-row" role="menuitemcheckbox" aria-checked={labs[l.id]} title={l.hint} onClick={() => setLab(l.id, !labs[l.id])}>
            <Glyph id={l.icon} className="menu-icon" />
            <span>{l.label}</span>
            <Switch on={labs[l.id]} />
          </button>
        </div>
      ))}
    </div>
  );
}
