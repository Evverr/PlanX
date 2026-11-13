import { useEffect, useRef, useState } from 'react';
import type { Editor } from '../editor/editor';
import { saveFile } from '../files';
import { docBlob, onOpenDoc, renderDoc } from './docx';

/** A Word document opened from its page on the board ("Документы Word"): all of it, read only, over
 *  the board; its pages fit the screen's width (an iPad's too). Esc or the cross closes it. */
export function DocViewer({ editor }: { editor: Editor }) {
  const [open, setOpen] = useState<{ id: string; name: string; src: string } | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'failed'>('loading');
  const pages = useRef<HTMLDivElement>(null);

  useEffect(() => onOpenDoc((id) => {
    const it = editor.board.get(id);
    if (it?.doc) { setState('loading'); setOpen({ id, name: it.dn || 'Документ.docx', src: it.doc }); }
  }), [editor]);

  useEffect(() => {
    if (!open) return;
    // Keys are its own while it's open (Delete mustn't take the page off the board under it).
    const key = (e: KeyboardEvent) => { e.stopImmediatePropagation(); if (e.key === 'Escape') setOpen(null); };
    window.addEventListener('keydown', key, true);
    return () => window.removeEventListener('keydown', key, true);
  }, [open]);

  useEffect(() => {
    const el = pages.current;
    if (!open || !el) return;
    let gone = false;
    const fit = () => {
      const wrap = el.querySelector<HTMLElement>('.docx-wrapper'), page = el.querySelector<HTMLElement>('section.docx');
      if (!wrap || !page) return;
      wrap.style.zoom = '';
      const k = Math.min(1, (el.clientWidth - 16) / (page.offsetWidth + 32));
      wrap.style.zoom = String(k);
    };
    void docBlob(open.src).then((b) => renderDoc(b, el)).then(() => { if (!gone) { fit(); setState('ready'); } }, () => { if (!gone) setState('failed'); });
    window.addEventListener('resize', fit);
    return () => { gone = true; window.removeEventListener('resize', fit); el.replaceChildren(); };
  }, [open]);

  if (!open) return null;
  return (
    <div className="doc-view" onPointerDown={(e) => { if (e.target === e.currentTarget) setOpen(null); }}>
      <div className="doc-view-box">
        <header>
          <span className="doc-view-name" title={open.name}>{open.name}</span>
          <button className="btn" onClick={() => void docBlob(open.src).then((b) => saveFile(b, open.name))}>Скачать</button>
          <button className="doc-view-close" aria-label="Закрыть" title="Закрыть (Esc)" onClick={() => setOpen(null)}>×</button>
        </header>
        {state !== 'ready' && <p className="doc-view-note">{state === 'loading' ? 'Открываю документ…' : 'Не получилось открыть этот документ'}</p>}
        <div ref={pages} className="doc-view-pages" />
      </div>
    </div>
  );
}
