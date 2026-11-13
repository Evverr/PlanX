import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { Editor } from '../editor/editor';
import { FILLS } from '../model/types';
import { STAGE_COLORS, cardsByColumn, deleteStage, moveStage, setStage, stageAt } from './kanban';

/**
 * «Канбан» (kanban.ts): a stage's menu, opened by a click on its pill, under it: its name to type over,
 * its colour, moving it left or right (its cards along), and deleting it (asked first when it holds cards).
 */
export function KanbanStage({ editor, zoom }: { editor: Editor; zoom: number }) {
  const [at, setAt] = useState<{ id: string; i: number } | null>(null);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const open = (e: Event) => setAt((e as CustomEvent<{ id: string; i: number }>).detail);
    window.addEventListener('planx:stage', open);
    return () => window.removeEventListener('planx:stage', open);
  }, []);
  // A press elsewhere, or Esc, closes it.
  useEffect(() => {
    if (!at) return;
    const away = (e: PointerEvent) => { if (!box.current?.contains(e.target as Node)) setAt(null); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setAt(null); };
    // (Not the press that opened it.)
    const t = setTimeout(() => window.addEventListener('pointerdown', away, true), 0);
    window.addEventListener('keydown', esc);
    return () => { clearTimeout(t); window.removeEventListener('pointerdown', away, true); window.removeEventListener('keydown', esc); };
  }, [at]);
  const f = at ? editor.board.get(at.id) : undefined, stage = f?.kb?.[at!.i];
  const r = editor.canvas?.getBoundingClientRect();
  if (!at || !f || !stage || !r) return null;
  const p = stageAt(f, at.i), n = f.kb!.length, cam = editor.cam;
  const go = (dir: -1 | 1) => { moveStage(editor.board, f, at.i, dir); setAt({ ...at, i: at.i + dir }); };
  const drop = () => {
    const cards = cardsByColumn(editor.board, f)[at.i].length;
    setAt(null);
    if (!cards) { deleteStage(editor.board, f, at.i); return; }
    window.dispatchEvent(new CustomEvent('planx:confirm', { detail: {
      text: `Удалить стадию «${stage.n}» и карточки в ней (${cards}) у всех участников? Отменить можно через Ctrl+Z`, action: 'Удалить',
      ok: () => { const now = editor.board.get(f.id); if (now) deleteStage(editor.board, now, at.i); },
    } }));
  };
  return createPortal(
    <div ref={box} className="pop stage-pop" role="dialog" aria-label="Стадия"
      style={{ left: r.left + cam.x + p.x * zoom, top: r.top + cam.y + p.y * zoom + 8 }}>
      <input className="stage-name" autoFocus value={stage.n} aria-label="Название стадии" onFocus={(e) => e.currentTarget.select()}
        onChange={(e) => setStage(editor.board, f, at.i, { n: e.target.value })} onKeyDown={(e) => { if (e.key === 'Enter') setAt(null); }} />
      <div className="sw-group stage-colors">
        {STAGE_COLORS.map((c) => (
          <button key={c} className={`sw ${stage.c === c ? 'on' : ''}`} style={{ background: FILLS[c] }} aria-label={`Цвет ${c}`} title="Цвет стадии"
            onClick={() => setStage(editor.board, f, at.i, { c })} />
        ))}
      </div>
      <div className="stage-row">
        <button className="btn" disabled={at.i === 0} onClick={() => go(-1)}>← Влево</button>
        <button className="btn" disabled={at.i === n - 1} onClick={() => go(1)}>Вправо →</button>
        <button className="btn stage-delete" disabled={n < 2} onClick={drop}>Удалить</button>
      </div>
    </div>,
    document.body,
  );
}
