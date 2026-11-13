import { useEffect, useRef, useState } from 'react';
import type { Editor } from '../editor/editor';
import type { Item } from '../model/types';
import { PanelIcon } from '../ui/PanelIcon';
import { saveMarkdown, savePdf } from './docExport';

/** «Документ» on the selection panel: saving it as a file, Markdown or PDF, picked from a list under it. */
export function DocSave({ editor, item }: { editor: Editor; item: Item }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    window.addEventListener('pointerdown', close, true);
    return () => window.removeEventListener('pointerdown', close, true);
  }, [open]);
  return (
    <div ref={ref} className="tf-drop">
      <button className={`ib ${open ? 'on' : ''}`} title="Скачать документ" aria-label="Скачать документ" aria-expanded={open} onClick={() => setOpen(!open)}>
        <PanelIcon name="download" />
      </button>
      {open && (
        <div className="tf-menu" role="menu" data-nosort>
          <button className="tf-item" role="menuitem" onClick={() => { saveMarkdown(editor, item); setOpen(false); }}>Markdown (.md)</button>
          <button className="tf-item" role="menuitem" onClick={() => { void savePdf(editor, item); setOpen(false); }}>PDF</button>
        </div>
      )}
    </div>
  );
}
