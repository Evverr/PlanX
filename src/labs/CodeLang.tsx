import { useEffect, useRef, useState } from 'react';
import type { Editor } from '../editor/editor';
import type { Item } from '../model/types';
import { PanelIcon } from '../ui/PanelIcon';
import { langOf, LANGS } from './codeBlock';

/** "Код" on the selection panel: the block's language, picked from a list dropped under it. */
export function CodeLang({ editor, item }: { editor: Editor; item: Item }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    window.addEventListener('pointerdown', close, true);
    return () => window.removeEventListener('pointerdown', close, true);
  }, [open]);
  const now = langOf(item).label;
  return (
    <div ref={ref} className="tf-drop code-lang">
      <button className="fpick" title="Язык" aria-label={`Язык: ${now}`} aria-expanded={open} onClick={() => setOpen(!open)}>
        {now}<PanelIcon name="drop" className="caret" />
      </button>
      {open && (
        <div className="tf-menu" role="menu" data-nosort>
          {Object.entries(LANGS).map(([k, l]) => (
            <button key={k} className={`tf-item ${l.label === now ? 'on' : ''}`} role="menuitemradio" aria-checked={l.label === now}
              onClick={() => { editor.board.update(item.id, { code: k }); setOpen(false); }}>{l.label}</button>
          ))}
        </div>
      )}
    </div>
  );
}
